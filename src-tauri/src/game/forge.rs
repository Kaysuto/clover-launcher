//! Forge et NeoForge : versions publiées et installation par leur installateur officiel, sans son
//! interface. Le launcher fait ce que fait l'installateur pour un client :
//!
//! - installateurs récents (Forge 1.12.2 et suivants, NeoForge) : `install_profile.json` décrit des
//!   « processeurs », des programmes Java qui fabriquent le client modifié à partir de celui de
//!   Mojang ; `version.json` est le profil de lancement, qui hérite de la version de Minecraft ;
//! - anciens installateurs (Forge 1.8.9…) : `versionInfo` est le profil, et la bibliothèque Forge
//!   est extraite telle quelle de l'installateur.
//!
//! Tout est vérifié par empreinte quand l'installateur la donne, et rien n'est refait d'une partie
//! à l'autre : un témoin note une installation terminée.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::Value;
use sha1::{Digest, Sha1};

use super::download::{download_all, ensure, Checksum, Download};
use super::version::{maven_path, VersionJson};
use super::{GameError, Paths, Progress, Result};

const FORGE_MAVEN: &str = "https://maven.minecraftforge.net";
const NEOFORGE_MAVEN: &str = "https://maven.neoforged.net/releases";
const FORGE_PROMOTIONS: &str = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
const NEOFORGE_VERSIONS: &str = "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
const MOJANG_LIBRARIES: &str = "https://libraries.minecraft.net/";
/// Installation terminée pour ce profil : les processeurs ne sont pas relancés.
const DONE_MARKER: &str = ".clover-loader-installed";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flavor {
    Forge,
    NeoForge,
}

impl Flavor {
    pub fn label(self) -> &'static str {
        match self {
            Flavor::Forge => "Forge",
            Flavor::NeoForge => "NeoForge",
        }
    }

    /// Coordonnée Maven de l'installateur (`groupe:artefact:version`) et dépôt qui le publie.
    fn installer(self, minecraft: &str, loader: &str) -> (String, &'static str) {
        match self {
            Flavor::Forge => (format!("net.minecraftforge:forge:{minecraft}-{loader}:installer"), FORGE_MAVEN),
            Flavor::NeoForge => (format!("net.neoforged:neoforge:{loader}:installer"), NEOFORGE_MAVEN),
        }
    }
}

// ── Versions publiées ─────────────────────────────────────────────────────────

/// Version de Minecraft visée par une version de NeoForge : `21.1.77` → `1.21.1`, `21.0.5` →
/// `1.21`, `26.1.2.114` → `26.1.2`, `26.2.0.88` → `26.2`. Préversions de Minecraft exclues.
pub(crate) fn neoforge_minecraft(version: &str) -> Option<String> {
    if version.contains('+') || version.contains("alpha") || version.starts_with("0.") {
        return None;
    }
    let numbers: Vec<&str> = version.split('-').next()?.split('.').collect();
    let major: u32 = numbers.first()?.parse().ok()?;
    if major < 26 {
        // Ancienne numérotation : majeure et mineure de Minecraft 1.x.
        let minor = *numbers.get(1)?;
        return Some(if minor == "0" { format!("1.{major}") } else { format!("1.{major}.{minor}") });
    }
    let (minor, patch) = (*numbers.get(1)?, *numbers.get(2)?);
    Some(if patch == "0" { format!("{major}.{minor}") } else { format!("{major}.{minor}.{patch}") })
}

/// Numéros d'une version (`47.4.10`, `21.1.77-beta`), pour trier de la plus récente à la plus ancienne.
fn numeric(version: &str) -> Vec<u64> {
    version.split(['.', '-']).map_while(|part| part.parse().ok()).collect()
}

/// Versions de Forge pour `minecraft`, la recommandée d'abord puis de la plus récente à la plus
/// ancienne, d'après le `maven-metadata.xml` du dépôt et les promotions de Forge.
fn forge_versions(metadata: &str, promotions: &Value, minecraft: &str) -> Vec<String> {
    let prefix = format!("{minecraft}-");
    let mut versions: Vec<String> = metadata
        .split("<version>")
        .skip(1)
        .filter_map(|part| part.split("</version>").next())
        .filter_map(|full| full.strip_prefix(&prefix))
        .filter(|loader| crate::instances::validate_version_id(loader).is_ok())
        .map(str::to_owned)
        .collect();
    versions.sort_by_key(|version| std::cmp::Reverse(numeric(version)));
    versions.dedup();
    let promoted = ["recommended", "latest"]
        .iter()
        .find_map(|kind| promotions["promos"][format!("{minecraft}-{kind}")].as_str())
        // Les anciennes versions portent un suffixe de branche (`11.15.1.2318-1.8.9`).
        .and_then(|promo| versions.iter().position(|version| version == promo || version.starts_with(&format!("{promo}-"))));
    if let Some(index) = promoted {
        let recommended = versions.remove(index);
        versions.insert(0, recommended);
    }
    versions
}

/// Versions de NeoForge pour `minecraft`, de la plus récente à la plus ancienne ; les bêtas
/// seulement s'il n'existe aucune version stable.
fn neoforge_versions(all: &[String], minecraft: &str) -> Vec<String> {
    let mut matching: Vec<&String> = all
        .iter()
        .filter(|version| neoforge_minecraft(version).as_deref() == Some(minecraft))
        .filter(|version| crate::instances::validate_version_id(version).is_ok())
        .collect();
    matching.sort_by_key(|version| std::cmp::Reverse(numeric(version)));
    let stable: Vec<String> = matching.iter().filter(|version| !version.contains("beta")).map(|version| (*version).clone()).collect();
    if stable.is_empty() { matching.into_iter().cloned().collect() } else { stable }
}

/// Versions de `flavor` publiées pour `minecraft`, celle à proposer d'abord. Gardées sur le
/// disque : la liste reste disponible hors ligne.
pub async fn versions(http: &reqwest::Client, root: &Path, flavor: Flavor, minecraft: &str) -> Result<Vec<String>> {
    crate::instances::validate_version_id(minecraft)?;
    let cache = root.join("versions").join(format!("{}-loaders-{minecraft}.json", flavor.label().to_lowercase()));
    let fetched = async {
        Ok::<_, GameError>(match flavor {
            Flavor::Forge => {
                let metadata = http.get(format!("{FORGE_MAVEN}/net/minecraftforge/forge/maven-metadata.xml")).send().await?.error_for_status()?.text().await?;
                let promotions: Value = http.get(FORGE_PROMOTIONS).send().await?.error_for_status()?.json().await.unwrap_or(Value::Null);
                forge_versions(&metadata, &promotions, minecraft)
            }
            Flavor::NeoForge => {
                #[derive(Deserialize)]
                struct Listing {
                    versions: Vec<String>,
                }
                let listing: Listing = http.get(NEOFORGE_VERSIONS).send().await?.error_for_status()?.json().await?;
                neoforge_versions(&listing.versions, minecraft)
            }
        })
    }
    .await;
    match fetched {
        Ok(list) => {
            std::fs::create_dir_all(cache.parent().expect("dossier versions"))?;
            std::fs::write(&cache, serde_json::to_vec(&list)?)?;
            Ok(list)
        }
        Err(error) => std::fs::read(&cache).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).ok_or(error),
    }
}

// ── Installation ──────────────────────────────────────────────────────────────

/// Profil de lancement prêt, et ce qu'il reste à faire une fois Minecraft téléchargé.
pub struct Prepared {
    pub profile: VersionJson,
    flavor: Flavor,
    installer: PathBuf,
    /// Installateur récent : bibliothèques et processeurs. `None` : ancien installateur.
    install: Option<InstallProfile>,
    /// Ancien installateur : fichier de l'archive et chemin Maven de la bibliothèque Forge.
    legacy_jar: Option<(String, String)>,
}

#[derive(Deserialize)]
struct InstallProfile {
    #[serde(default)]
    data: HashMap<String, DataEntry>,
    #[serde(default)]
    processors: Vec<Processor>,
    #[serde(default)]
    libraries: Vec<super::version::Library>,
}

#[derive(Deserialize)]
struct DataEntry {
    client: String,
}

#[derive(Deserialize)]
struct Processor {
    jar: String,
    #[serde(default)]
    classpath: Vec<String>,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    outputs: HashMap<String, String>,
    sides: Option<Vec<String>>,
}

fn read_entry(archive: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Result<Vec<u8>> {
    let mut entry = archive.by_name(name.trim_start_matches('/')).map_err(|_| GameError::InvalidVersion(format!("{name} absent de l'installateur")))?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn library_path(paths: &Paths, coordinate: &str) -> Result<PathBuf> {
    let relative = maven_path(coordinate).ok_or_else(|| GameError::InvalidVersion(format!("bibliothèque invalide : {coordinate}")))?;
    safe_join(&paths.libraries, &relative)
}

/// `base/relatif`, sans jamais sortir de `base` (chemins lus dans l'installateur).
fn safe_join(base: &Path, relative: &str) -> Result<PathBuf> {
    let relative = Path::new(relative.trim_start_matches('/'));
    if relative.components().all(|part| matches!(part, std::path::Component::Normal(_))) {
        Ok(base.join(relative))
    } else {
        Err(GameError::InvalidVersion(format!("chemin refusé dans l'installateur : {}", relative.display())))
    }
}

/// Ancien profil (`versionInfo`) rendu au format actuel : la bibliothèque Forge vient de
/// l'installateur (adresse vide), les autres de leur dépôt ou de celui de Mojang.
fn legacy_profile(mut info: Value, forge_library: &str) -> Value {
    if let Some(libraries) = info["libraries"].as_array_mut() {
        for library in libraries {
            let name = library["name"].as_str().unwrap_or_default().to_owned();
            let object = library.as_object_mut().expect("bibliothèque");
            object.remove("checksums");
            if name == forge_library {
                let path = maven_path(&name).unwrap_or_default();
                object.remove("url");
                object.insert("downloads".into(), serde_json::json!({ "artifact": { "path": path, "url": "" } }));
            } else {
                let url = object.get("url").and_then(Value::as_str).unwrap_or(MOJANG_LIBRARIES).replace("http://files.minecraftforge.net/maven/", "https://maven.minecraftforge.net/");
                object.insert("url".into(), Value::String(url));
            }
        }
    }
    info
}

/// Télécharge l'installateur et en lit le profil de lancement (gardé dans `versions/`).
pub async fn prepare(http: &reqwest::Client, paths: &Paths, flavor: Flavor, minecraft: &str, loader: &str) -> Result<Prepared> {
    crate::instances::validate_version_id(loader)?;
    let (coordinate, repository) = flavor.installer(minecraft, loader);
    let relative = maven_path(&coordinate).ok_or_else(|| GameError::InvalidVersion("installateur introuvable".into()))?;
    let installer = paths.libraries.join(&relative);
    let url = format!("{repository}/{relative}");
    let sha1 = super::install::maven_sha1(http, &url).await.ok();
    ensure(http, &Download { url, path: installer.clone(), checksum: sha1.map(Checksum::Sha1), size: None, executable: false })
        .await
        .map_err(|error| match error {
            GameError::Network(_) => GameError::InvalidVersion(format!("{} {loader} introuvable pour Minecraft {minecraft}", flavor.label())),
            other => other,
        })?;

    let mut archive = zip::ZipArchive::new(std::fs::File::open(&installer)?).map_err(|_| GameError::InvalidVersion("installateur illisible".into()))?;
    let profile: Value = serde_json::from_slice(&read_entry(&mut archive, "install_profile.json")?)?;
    let (version, install, legacy_jar) = if let Some(info) = profile.get("versionInfo") {
        let forge_library = profile["install"]["path"].as_str().unwrap_or_default().to_owned();
        let file = profile["install"]["filePath"].as_str().unwrap_or_default().to_owned();
        let path = maven_path(&forge_library).ok_or_else(|| GameError::InvalidVersion("bibliothèque Forge absente".into()))?;
        (legacy_profile(info.clone(), &forge_library), None, Some((file, path)))
    } else {
        let json = profile["json"].as_str().unwrap_or("/version.json").to_owned();
        let version: Value = serde_json::from_slice(&read_entry(&mut archive, &json)?)?;
        (version, Some(serde_json::from_value::<InstallProfile>(profile)?), None)
    };
    let parsed: VersionJson = serde_json::from_value(version.clone())?;
    crate::instances::validate_version_id(&parsed.id)?;
    let dir = paths.versions.join(&parsed.id);
    tokio::fs::create_dir_all(&dir).await?;
    tokio::fs::write(dir.join(format!("{}.json", parsed.id)), serde_json::to_vec_pretty(&version)?).await?;
    Ok(Prepared { profile: parsed, flavor, installer, install, legacy_jar })
}

/// Bibliothèques livrées dans l'installateur (`maven/…`, ou la bibliothèque Forge des anciens
/// installateurs), copiées dans `libraries/` si elles manquent.
fn extract_bundled(prepared: &Prepared, paths: &Paths) -> Result<()> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(&prepared.installer)?).map_err(|_| GameError::InvalidVersion("installateur illisible".into()))?;
    let mut wanted: Vec<(String, PathBuf)> = Vec::new();
    if let Some((file, path)) = &prepared.legacy_jar {
        wanted.push((file.clone(), safe_join(&paths.libraries, path)?));
    }
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|_| GameError::InvalidVersion("installateur illisible".into()))?;
        if let Some(relative) = entry.name().strip_prefix("maven/").filter(|name| !name.is_empty() && !entry.is_dir()) {
            wanted.push((entry.name().to_owned(), safe_join(&paths.libraries, relative)?));
        }
    }
    for (name, target) in wanted {
        if target.is_file() {
            continue;
        }
        let bytes = read_entry(&mut archive, &name)?;
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&target, bytes)?;
    }
    Ok(())
}

fn sha1_of(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(Sha1::digest(&bytes).iter().map(|byte| format!("{byte:02x}")).collect())
}

/// Classe principale déclarée par le `MANIFEST.MF` d'un processeur.
fn main_class(jar: &Path) -> Result<String> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(jar)?).map_err(|_| GameError::InvalidVersion(format!("{} illisible", jar.display())))?;
    let manifest = String::from_utf8_lossy(&read_entry(&mut archive, "META-INF/MANIFEST.MF")?).replace("\r\n", "\n").replace("\n ", "");
    manifest
        .lines()
        .find_map(|line| line.strip_prefix("Main-Class:"))
        .map(|class| class.trim().to_owned())
        .ok_or_else(|| GameError::InvalidVersion(format!("classe principale absente de {}", jar.display())))
}

/// Valeurs `{CLÉ}` des arguments des processeurs : données de l'installateur et valeurs connues.
struct Values {
    data: HashMap<String, String>,
}

impl Values {
    fn new(paths: &Paths, prepared: &Prepared, profile: &InstallProfile, minecraft: &str, client_jar: &Path, work: &Path) -> Result<Self> {
        let mut archive = zip::ZipArchive::new(std::fs::File::open(&prepared.installer)?).map_err(|_| GameError::InvalidVersion("installateur illisible".into()))?;
        let mut data = HashMap::new();
        for (key, entry) in &profile.data {
            let value = &entry.client;
            let resolved = if let Some(coordinate) = value.strip_prefix('[').and_then(|value| value.strip_suffix(']')) {
                library_path(paths, coordinate)?.to_string_lossy().into_owned()
            } else if let Some(literal) = value.strip_prefix('\'').and_then(|value| value.strip_suffix('\'')) {
                literal.to_owned()
            } else if value.starts_with('/') {
                // Fichier de l'installateur (correctifs binaires…), extrait dans le dossier de travail.
                let target = safe_join(work, value)?;
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&target, read_entry(&mut archive, value)?)?;
                target.to_string_lossy().into_owned()
            } else {
                value.clone()
            };
            data.insert(key.clone(), resolved);
        }
        let known = [
            ("SIDE", "client".to_owned()),
            ("MINECRAFT_JAR", client_jar.to_string_lossy().into_owned()),
            ("MINECRAFT_VERSION", minecraft.to_owned()),
            ("ROOT", paths.root.to_string_lossy().into_owned()),
            ("INSTALLER", prepared.installer.to_string_lossy().into_owned()),
            ("LIBRARY_DIR", paths.libraries.to_string_lossy().into_owned()),
        ];
        data.extend(known.into_iter().map(|(key, value)| (key.to_owned(), value)));
        Ok(Self { data })
    }

    /// `[groupe:artefact:version]` → chemin de la bibliothèque ; sinon chaque `{CLÉ}` remplacée.
    fn resolve(&self, paths: &Paths, argument: &str) -> Result<String> {
        if let Some(coordinate) = argument.strip_prefix('[').and_then(|value| value.strip_suffix(']')) {
            return Ok(library_path(paths, coordinate)?.to_string_lossy().into_owned());
        }
        let mut resolved = argument.to_owned();
        for (key, value) in &self.data {
            resolved = resolved.replace(&format!("{{{key}}}"), value);
        }
        Ok(resolved)
    }
}

/// Fin d'installation, une fois Java, Minecraft et les bibliothèques du profil téléchargés :
/// bibliothèques livrées dans l'installateur, outils des processeurs, puis les processeurs.
pub async fn finish(
    http: &reqwest::Client,
    paths: &Paths,
    java: &Path,
    prepared: &Prepared,
    minecraft: &str,
    client_jar: &Path,
    progress: &(dyn Fn(Progress) + Sync),
) -> Result<()> {
    let marker = paths.versions.join(&prepared.profile.id).join(DONE_MARKER);
    extract_bundled(prepared, paths)?;
    let Some(profile) = &prepared.install else { return Ok(()) };
    if marker.is_file() {
        return Ok(());
    }

    // Outils des processeurs ; une adresse vide désigne un fichier livré dans l'installateur.
    let mut downloads = Vec::new();
    for library in &profile.libraries {
        let Some(resolved) = library.resolve() else { continue };
        if resolved.url.is_empty() {
            continue;
        }
        downloads.push(Download {
            url: resolved.url,
            path: safe_join(&paths.libraries, &resolved.path)?,
            checksum: resolved.sha1.map(Checksum::Sha1),
            size: resolved.size,
            executable: false,
        });
    }
    download_all(http, downloads, &|done, total| progress(Progress { phase: "libraries", done, total })).await?;

    let work = paths.root.join("tmp").join(format!("{}-{}", prepared.flavor.label().to_lowercase(), prepared.profile.id));
    let values = Values::new(paths, prepared, profile, minecraft, client_jar, &work)?;
    let steps: Vec<&Processor> = profile.processors.iter().filter(|processor| processor.sides.as_ref().is_none_or(|sides| sides.iter().any(|side| side == "client"))).collect();
    for (index, processor) in steps.iter().enumerate() {
        progress(Progress { phase: "loader", done: index, total: steps.len() });
        let outputs = processor
            .outputs
            .iter()
            .map(|(file, sha1)| Ok((PathBuf::from(values.resolve(paths, file)?), values.resolve(paths, sha1)?.to_lowercase())))
            .collect::<Result<Vec<_>>>()?;
        if !outputs.is_empty() && outputs.iter().all(|(file, sha1)| sha1_of(file).as_deref() == Some(sha1.as_str())) {
            continue;
        }
        let jar = library_path(paths, &processor.jar)?;
        let class = main_class(&jar)?;
        let mut classpath = vec![jar];
        for coordinate in &processor.classpath {
            classpath.push(library_path(paths, coordinate)?);
        }
        let separator = if cfg!(windows) { ";" } else { ":" };
        let classpath = classpath.iter().map(|path| path.to_string_lossy()).collect::<Vec<_>>().join(separator);
        let arguments = processor.args.iter().map(|argument| values.resolve(paths, argument)).collect::<Result<Vec<_>>>()?;
        tokio::fs::create_dir_all(&work).await?;
        let mut command = tokio::process::Command::new(java);
        command.arg("-cp").arg(&classpath).arg(&class).args(&arguments).current_dir(&work).stdin(std::process::Stdio::null());
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW : pas de console qui clignote.
        let output = command.output().await.map_err(GameError::Spawn)?;
        if !output.status.success() {
            let text = String::from_utf8_lossy(&output.stderr).into_owned() + &String::from_utf8_lossy(&output.stdout);
            let tail: Vec<&str> = text.lines().rev().filter(|line| !line.trim().is_empty()).take(4).collect();
            eprintln!("[{}] processeur {class} en échec :\n{text}", prepared.flavor.label());
            return Err(GameError::InvalidVersion(format!(
                "l'installation de {} a échoué à l'étape {}/{} ({})",
                prepared.flavor.label(),
                index + 1,
                steps.len(),
                tail.into_iter().rev().collect::<Vec<_>>().join(" ")
            )));
        }
        for (file, sha1) in &outputs {
            if sha1_of(file).as_deref() != Some(sha1.as_str()) {
                return Err(GameError::Corrupted(file.to_string_lossy().into_owned()));
            }
        }
    }
    progress(Progress { phase: "loader", done: steps.len(), total: steps.len() });
    let _ = tokio::fs::remove_dir_all(&work).await;
    tokio::fs::write(&marker, b"").await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_neoforge_versions_to_minecraft() {
        assert_eq!(neoforge_minecraft("21.1.77").as_deref(), Some("1.21.1"));
        assert_eq!(neoforge_minecraft("21.0.167").as_deref(), Some("1.21"));
        assert_eq!(neoforge_minecraft("20.4.251").as_deref(), Some("1.20.4"));
        assert_eq!(neoforge_minecraft("26.1.2.114").as_deref(), Some("26.1.2"));
        assert_eq!(neoforge_minecraft("26.2.0.88").as_deref(), Some("26.2"));
        assert_eq!(neoforge_minecraft("26.3.0.55-beta").as_deref(), Some("26.3"));
        assert_eq!(neoforge_minecraft("26.1.0.0-alpha.1+snapshot-1"), None);
        assert_eq!(neoforge_minecraft("0.25w14craftmine.3-beta"), None);
    }

    #[test]
    fn lists_neoforge_stable_first_or_betas_alone() {
        let all: Vec<String> = ["21.1.1", "21.1.256", "21.1.9", "21.6.0-beta", "21.6.20-beta", "21.1.200-beta"].map(String::from).to_vec();
        assert_eq!(neoforge_versions(&all, "1.21.1"), ["21.1.256", "21.1.9", "21.1.1"]);
        assert_eq!(neoforge_versions(&all, "1.21.6"), ["21.6.20-beta", "21.6.0-beta"]);
        assert!(neoforge_versions(&all, "1.20.1").is_empty());
    }

    #[test]
    fn lists_forge_with_the_promoted_version_first() {
        let metadata = "<versions><version>1.20.1-47.4.26</version><version>1.20.1-47.4.10</version><version>1.20.1-47.3.0</version><version>1.21.1-52.1.16</version>\
                        <version>1.8.9-11.15.1.2318-1.8.9</version><version>1.8.9-11.15.0.1658</version></versions>";
        let promotions = serde_json::json!({ "promos": { "1.20.1-recommended": "47.4.10", "1.20.1-latest": "47.4.26", "1.8.9-recommended": "11.15.1.2318" } });
        assert_eq!(forge_versions(metadata, &promotions, "1.20.1"), ["47.4.10", "47.4.26", "47.3.0"]);
        assert_eq!(forge_versions(metadata, &promotions, "1.8.9"), ["11.15.1.2318-1.8.9", "11.15.0.1658"]);
        assert_eq!(forge_versions(metadata, &Value::Null, "1.21.1"), ["52.1.16"]);
    }

    #[test]
    fn legacy_profiles_get_library_sources() {
        let info = serde_json::json!({ "id": "1.8.9-forge", "libraries": [
            { "name": "net.minecraftforge:forge:1.8.9-11.15.1.2318-1.8.9", "url": "https://maven.minecraftforge.net/" },
            { "name": "net.minecraft:launchwrapper:1.12", "clientreq": true },
            { "name": "org.scala-lang:scala-library:2.11.1", "url": "http://files.minecraftforge.net/maven/", "checksums": ["a"] }
        ]});
        let profile = legacy_profile(info, "net.minecraftforge:forge:1.8.9-11.15.1.2318-1.8.9");
        let libraries: Vec<super::super::version::Library> = serde_json::from_value(profile["libraries"].clone()).unwrap();
        assert_eq!(libraries[0].resolve().unwrap().url, "");
        assert_eq!(libraries[1].resolve().unwrap().url, "https://libraries.minecraft.net/net/minecraft/launchwrapper/1.12/launchwrapper-1.12.jar");
        assert!(libraries[2].resolve().unwrap().url.starts_with("https://maven.minecraftforge.net/org/scala-lang/"));
    }

    /// Réseau, plusieurs Go : installe chaque loader comme avant une partie, puis, avec
    /// `CLOVER_TEST_BOOT=1`, lance le jeu (compte factice) jusqu'au démarrage du son, signe que le
    /// loader a chargé et que le menu s'ouvre. `CLOVER_TEST_ROOT` : dossier réutilisé d'une fois sur
    /// l'autre ; `CLOVER_TEST_LOADERS` : sélection, par exemple `forge-1.20.1,neoforge-1.21.1`.
    #[tokio::test]
    #[ignore]
    async fn installs_and_boots_real_loaders() {
        use crate::game::install::{install_version, Loader};
        use tokio::io::{AsyncBufReadExt, BufReader};

        let http = crate::game::download::client();
        let root = std::env::var_os("CLOVER_TEST_ROOT").map_or_else(|| std::env::temp_dir().join("clover-forge-test"), PathBuf::from);
        let selection = std::env::var("CLOVER_TEST_LOADERS").unwrap_or_else(|_| "forge-1.20.1,neoforge-1.21.1,forge-1.16.5,forge-1.12.2,forge-1.8.9".into());
        let boot = std::env::var("CLOVER_TEST_BOOT").is_ok_and(|value| value == "1");
        for target in selection.split(',') {
            let (flavor, minecraft) = match target.split_once('-').unwrap() {
                ("forge", minecraft) => (Flavor::Forge, minecraft),
                ("neoforge", minecraft) => (Flavor::NeoForge, minecraft),
                other => panic!("loader inconnu : {other:?}"),
            };
            let mut paths = Paths::from_root(root.clone());
            paths.game = root.join("games").join(target);
            let list = versions(&http, &root, flavor, minecraft).await.unwrap();
            let version = list.first().unwrap_or_else(|| panic!("aucune version pour {target}"));
            let loader = if flavor == Flavor::Forge { Loader::Forge(version) } else { Loader::NeoForge(version) };
            let started = std::time::Instant::now();
            let installation = install_version(&http, &paths, minecraft, Some(loader), &|_| {}).await.unwrap_or_else(|e| panic!("{target} {version} : {e}"));
            println!("{target} {version} installé en {:?}", started.elapsed());
            let missing: Vec<_> = installation.classpath.iter().filter(|path| !path.is_file()).collect();
            assert!(missing.is_empty(), "{target} : {missing:?}");
            if !boot {
                continue;
            }

            let session = crate::auth::Session {
                profile: crate::auth::Profile { uuid: "00000000-0000-0000-0000-000000000001".into(), name: "CloverTest".into(), skin: None, capes: vec![] },
                minecraft_token: "0".into(),
                expires_at: 0,
            };
            let options = crate::game::LaunchOptions { memory_mb: Some(3072), java_args: vec![], fullscreen: false, resolution: None, graphics_backend: None, enabled_mods: None, disabled_personal_mods: vec![] };
            let arguments = crate::game::launch::build_arguments(&paths, &installation, &session, None, &options).unwrap();
            let version_id = installation.loader.as_ref().map_or(installation.vanilla.id.as_str(), |loader| &loader.id);
            std::fs::create_dir_all(paths.natives.join(version_id)).unwrap();
            std::fs::create_dir_all(&paths.game).unwrap();
            let mut child = tokio::process::Command::new(&installation.java)
                .args(&arguments)
                .current_dir(&paths.game)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .kill_on_drop(true)
                .spawn()
                .unwrap();
            let mut stdout = BufReader::new(child.stdout.take().unwrap()).lines();
            let mut stderr = BufReader::new(child.stderr.take().unwrap()).lines();
            let mut tail = std::collections::VecDeque::new();
            let outcome = tokio::time::timeout(std::time::Duration::from_secs(300), async {
                loop {
                    let line = tokio::select! {
                        line = stdout.next_line() => line,
                        line = stderr.next_line() => line,
                    };
                    let Ok(Some(line)) = line else { return false };
                    if line.contains("Sound engine started") {
                        return true;
                    }
                    tail.push_back(line);
                    if tail.len() > 40 {
                        tail.pop_front();
                    }
                }
            })
            .await;
            let _ = child.kill().await;
            assert!(outcome == Ok(true), "{target} {version} ne démarre pas :\n{}", tail.iter().map(String::as_str).collect::<Vec<_>>().join("\n"));
            println!("{target} {version} démarre ({:?})", started.elapsed());
        }
    }

    #[test]
    fn refuses_paths_outside_the_libraries() {
        let base = Path::new("/clover/libraries");
        assert!(safe_join(base, "net/x/1/x-1.jar").is_ok());
        assert!(safe_join(base, "/data/client.lzma").is_ok());
        assert!(safe_join(base, "../escape.jar").is_err());
        assert!(safe_join(base, "net/../../escape.jar").is_err());
    }
}
