//! Contenus Modrinth autres que les mods : packs de ressources, shaders et datapacks (une archive
//! posée dans le bon dossier) et modpacks (`.mrpack` : liste de fichiers à télécharger, plus des
//! fichiers inclus, voir https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack).

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::SystemTime;

use serde::Deserialize;

use super::download::{download_all, Checksum, Download};
use super::modrinth::{self, Kind};
use super::{GameError, Result};

/// Hôtes d'où un modpack peut faire télécharger ses fichiers (liste du format `.mrpack`).
const ALLOWED_HOSTS: [&str; 4] = ["cdn.modrinth.com", "github.com", "raw.githubusercontent.com", "gitlab.com"];
/// Un fichier inclus plus gros serait anormal : refusé plutôt que d'emplir le disque.
const MAX_OVERRIDE: u64 = 512 * 1024 * 1024;

/// Nom d'archive acceptable dans un dossier de jeu : `.zip`, sans chemin ni fichier caché.
fn safe_archive(name: &str) -> Option<&str> {
    let ok = name.to_ascii_lowercase().ends_with(".zip") && !name.starts_with('.') && !name.contains(['/', '\\', ':']) && name.len() <= 200;
    ok.then_some(name)
}

/// Fichier principal d'une version, vérifié par son empreinte une fois téléchargé.
fn primary_download(version: &modrinth::Version, path: PathBuf) -> Result<Download> {
    let file = version.primary_file().ok_or(GameError::NoUpdate)?;
    let sha512 = file.hashes.get("sha512").ok_or(GameError::NoUpdate)?;
    Ok(Download { url: file.url.clone(), path, checksum: Some(Checksum::Sha512(sha512.clone())), size: Some(file.size), executable: false })
}

/// Télécharge la dernière version de `project` (pack de ressources, shader ou datapack) pour
/// `minecraft` dans `dir` ; renvoie le nom du fichier.
pub async fn install_archive(http: &reqwest::Client, dir: &Path, kind: Kind, project: &str, minecraft: &str) -> Result<String> {
    let version = modrinth::compatible_version(http, project, kind.loader(), Some(minecraft)).await?.ok_or(GameError::NoUpdate)?;
    let file = version.primary_file().ok_or(GameError::NoUpdate)?;
    let filename = safe_archive(&file.filename).ok_or_else(|| GameError::InvalidVersion(format!("fichier inattendu « {} »", file.filename)))?.to_owned();
    std::fs::create_dir_all(dir)?;
    download_all(http, vec![primary_download(&version, dir.join(&filename))?], &|_, _| {}).await?;
    Ok(filename)
}

// ── Nom et logo des packs, shaders et datapacks (comme « Mes mods ») ──────────────

/// Au-delà, le logo du pack n'est pas repris : il voyagerait en entier vers l'interface.
const MAX_ICON: u64 = 256 * 1024;

/// Logo `pack.png` à la racine d'un pack (`.zip` ou dossier), en adresse `data:`.
pub fn pack_icon(path: &Path) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = if path.is_dir() {
        let file = path.join("pack.png");
        if std::fs::metadata(&file).ok()?.len() > MAX_ICON {
            return None;
        }
        std::fs::read(file).ok()?
    } else {
        let mut archive = zip::ZipArchive::new(std::fs::File::open(path).ok()?).ok()?;
        let mut entry = archive.by_name("pack.png").ok()?;
        if entry.size() > MAX_ICON {
            return None;
        }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).ok()?;
        bytes
    };
    bytes.starts_with(b"\x89PNG").then(|| format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

/// Taille et date de modification d'un fichier.
type Stamp = (u64, Option<SystemTime>);

/// Empreintes déjà calculées, par fichier : un pack de plusieurs centaines de Mo n'est relu que
/// s'il change.
static HASHES: LazyLock<Mutex<HashMap<PathBuf, (Stamp, String)>>> = LazyLock::new(Default::default);

/// Empreinte SHA-512 d'une archive, pour la reconnaître sur Modrinth ; `None` pour un dossier.
pub fn archive_hash(path: &Path) -> Option<String> {
    let metadata = std::fs::metadata(path).ok().filter(std::fs::Metadata::is_file)?;
    let stamp = (metadata.len(), metadata.modified().ok());
    if let Some((known, hash)) = HASHES.lock().expect("empreintes").get(path) {
        if *known == stamp {
            return Some(hash.clone());
        }
    }
    let hash = super::personal::sha512(path).ok()?;
    HASHES.lock().expect("empreintes").insert(path.to_path_buf(), (stamp, hash.clone()));
    Some(hash)
}

/// Projets Modrinth (nom, logo) des archives reconnues par leur empreinte. Sans réseau : vide.
pub async fn identify_archives(http: &reqwest::Client, hashes: Vec<String>) -> HashMap<String, modrinth::Summary> {
    if hashes.is_empty() {
        return HashMap::new();
    }
    let versions = match modrinth::identify(http, hashes).await {
        Ok(versions) => versions,
        Err(e) => {
            eprintln!("[contenu] Modrinth injoignable pour identifier les packs : {e}");
            return HashMap::new();
        }
    };
    let ids: Vec<String> = versions.values().map(|version| version.project_id.clone()).collect::<HashSet<_>>().into_iter().collect();
    let projects = modrinth::projects(http, &ids).await.unwrap_or_else(|e| {
        eprintln!("[contenu] Modrinth injoignable pour les noms des packs : {e}");
        HashMap::new()
    });
    versions.into_iter().filter_map(|(hash, version)| Some((hash, projects.get(&version.project_id)?.clone()))).collect()
}

/// Monde existant de `saves`, désigné par le nom de son dossier.
pub fn world_dir(saves: &Path, world: &str) -> Result<PathBuf> {
    let dir = saves.join(world);
    let plain = !world.is_empty() && !world.starts_with('.') && !world.contains(['/', '\\', ':']);
    if !plain || !dir.join("level.dat").is_file() {
        return Err(GameError::InvalidVersion(format!("monde « {world} » introuvable")));
    }
    Ok(dir)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    pub name: String,
    files: Vec<PackFile>,
    dependencies: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackFile {
    path: String,
    hashes: HashMap<String, String>,
    #[serde(default)]
    env: Option<Env>,
    downloads: Vec<String>,
    file_size: u64,
}

#[derive(Debug, Deserialize)]
struct Env {
    client: String,
}

impl Index {
    /// Version de Minecraft et de Fabric demandées ; les autres loaders ne sont pas pris en charge.
    pub fn versions(&self) -> Result<(String, String)> {
        if let Some(other) = self.dependencies.keys().find(|key| !matches!(key.as_str(), "minecraft" | "fabric-loader")) {
            return Err(GameError::InvalidVersion(format!("ce modpack demande « {other} », seul Fabric est pris en charge")));
        }
        let minecraft = self.dependencies.get("minecraft").ok_or_else(|| GameError::InvalidVersion("modpack sans version de Minecraft".into()))?;
        let fabric = self.dependencies.get("fabric-loader").ok_or_else(|| GameError::InvalidVersion("modpack sans Fabric".into()))?;
        Ok((minecraft.clone(), fabric.clone()))
    }
}

/// Télécharge le `.mrpack` de `project` dans `dir` et lit son index.
pub async fn fetch_modpack(http: &reqwest::Client, project: &str, dir: &Path) -> Result<(PathBuf, Index)> {
    let version = modrinth::compatible_version(http, project, Kind::Modpack.loader(), None).await?.ok_or(GameError::NoUpdate)?;
    std::fs::create_dir_all(dir)?;
    let archive = dir.join(format!("{project}.mrpack"));
    download_all(http, vec![primary_download(&version, archive.clone())?], &|_, _| {}).await?;
    let index = read_index(&archive)?.ok_or_else(|| GameError::Corrupted("modrinth.index.json absent".into()))?;
    Ok((archive, index))
}

/// Index d'un `.mrpack` ; `None` si l'archive n'en a pas (ce n'est pas un modpack Modrinth).
pub fn read_index(archive: &Path) -> Result<Option<Index>> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?).map_err(|e| GameError::Corrupted(e.to_string()))?;
    let mut text = String::new();
    match zip.by_name("modrinth.index.json") {
        Ok(file) => file.take(16 * 1024 * 1024).read_to_string(&mut text)?,
        Err(_) => return Ok(None),
    };
    Ok(Some(serde_json::from_str(&text)?))
}

/// Chemin relatif sûr (`mods/x.jar`, `config/y.json`), jamais hors du dossier de l'instance.
fn relative(path: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    let plain = path.components().all(|component| matches!(component, Component::Normal(_)));
    (plain && path.components().next().is_some()).then(|| path.to_path_buf())
}

/// Où va un fichier du pack : les `.jar` de `mods/` dans les mods de l'instance (recopiés dans le
/// jeu au lancement), tout le reste dans son dossier de jeu.
fn target(path: &Path, game: &Path, mods: &Path) -> PathBuf {
    match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) if parent == Path::new("mods") && path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("jar")) => mods.join(name),
        _ => game.join(path),
    }
}

fn allowed(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|url| url.scheme() == "https" && url.host_str().is_some_and(|host| ALLOWED_HOSTS.contains(&host)))
}

/// Pose les fichiers du modpack dans `game` et `mods` : téléchargements de l'index (sauf ceux
/// réservés au serveur), puis fichiers inclus (`overrides`, puis `client-overrides` qui l'emporte).
pub async fn install_modpack(http: &reqwest::Client, archive: &Path, index: &Index, game: &Path, mods: &Path, on_progress: &(dyn Fn(usize, usize) + Sync)) -> Result<()> {
    let mut downloads = Vec::new();
    for file in index.files.iter().filter(|file| file.env.as_ref().is_none_or(|env| env.client != "unsupported")) {
        let path = relative(&file.path).ok_or_else(|| GameError::InvalidVersion(format!("chemin refusé « {} »", file.path)))?;
        let url = file.downloads.iter().find(|url| allowed(url)).ok_or_else(|| GameError::InvalidVersion(format!("source refusée pour « {} »", file.path)))?;
        let checksum = match (file.hashes.get("sha512"), file.hashes.get("sha1")) {
            (Some(sha512), _) => Checksum::Sha512(sha512.clone()),
            (None, Some(sha1)) => Checksum::Sha1(sha1.clone()),
            (None, None) => return Err(GameError::InvalidVersion(format!("empreinte absente pour « {} »", file.path))),
        };
        downloads.push(Download { url: url.clone(), path: target(&path, game, mods), checksum: Some(checksum), size: Some(file.file_size), executable: false });
    }
    download_all(http, downloads, on_progress).await?;
    copy_overrides(archive, &["overrides", "client-overrides"], game, mods)
}

/// Copie les fichiers inclus dans l'archive, dossier par dossier de `folders` (le dernier l'emporte),
/// dans `game` et `mods` ; jamais hors de l'instance.
pub fn copy_overrides(archive: &Path, folders: &[&str], game: &Path, mods: &Path) -> Result<()> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?).map_err(|e| GameError::Corrupted(e.to_string()))?;
    for folder in folders {
        let prefix = format!("{folder}/");
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index).map_err(|e| GameError::Corrupted(e.to_string()))?;
            let Some(name) = entry.name().strip_prefix(prefix.as_str()).map(str::to_owned) else { continue };
            if entry.is_dir() || name.is_empty() {
                continue;
            }
            let path = relative(&name).ok_or_else(|| GameError::InvalidVersion(format!("chemin refusé « {name} »")))?;
            if entry.size() > MAX_OVERRIDE {
                return Err(GameError::InvalidVersion(format!("fichier trop lourd « {name} »")));
            }
            let destination = target(&path, game, mods);
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::io::copy(&mut (&mut entry).take(MAX_OVERRIDE), &mut std::fs::File::create(destination)?)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_paths_stay_inside_the_instance() {
        let (game, mods) = (Path::new("/i/game"), Path::new("/i/personal-mods"));
        assert_eq!(target(&relative("mods/sodium.jar").unwrap(), game, mods), mods.join("sodium.jar"));
        assert_eq!(target(&relative("mods/sub/x.jar").unwrap(), game, mods), game.join("mods/sub/x.jar"));
        assert_eq!(target(&relative("config/a.json").unwrap(), game, mods), game.join("config/a.json"));
        assert!(relative("../evil.jar").is_none());
        assert!(relative("/etc/passwd").is_none());
        assert!(relative("C:/Windows/x").is_none() || cfg!(not(windows)));
        assert!(relative("").is_none());
        assert!(allowed("https://cdn.modrinth.com/data/a/b.jar"));
        assert!(!allowed("http://cdn.modrinth.com/data/a/b.jar"));
        assert!(!allowed("https://example.com/b.jar"));
        assert_eq!(safe_archive("pack.zip"), Some("pack.zip"));
        assert_eq!(safe_archive("../pack.zip"), None);
        assert_eq!(safe_archive("pack.jar"), None);
    }

    #[test]
    fn only_fabric_modpacks_are_accepted() {
        let index: Index = serde_json::from_str(r#"{"name":"P","files":[],"dependencies":{"minecraft":"1.21.1","fabric-loader":"0.16.0"}}"#).unwrap();
        assert_eq!(index.versions().unwrap(), ("1.21.1".into(), "0.16.0".into()));
        let forge: Index = serde_json::from_str(r#"{"name":"P","files":[],"dependencies":{"minecraft":"1.21.1","forge":"52"}}"#).unwrap();
        assert!(forge.versions().is_err());
    }

    /// Réseau : un vrai modpack et un vrai pack de ressources, posés dans un dossier temporaire.
    #[tokio::test]
    #[ignore = "réseau"]
    async fn installs_a_real_modpack_and_resource_pack() {
        let http = super::super::download::client();
        let dir = std::env::temp_dir().join(format!("clover-content-{}", std::process::id()));
        let (archive, index) = fetch_modpack(&http, "fabulously-optimized", &dir).await.unwrap();
        let (minecraft, _) = index.versions().unwrap();
        install_modpack(&http, &archive, &index, &dir.join("game"), &dir.join("mods"), &|_, _| {}).await.unwrap();
        assert!(std::fs::read_dir(dir.join("mods")).unwrap().count() > 10);
        assert!(dir.join("game/config").is_dir());
        let pack = install_archive(&http, &dir.join("resourcepacks"), Kind::Resourcepack, "fresh-animations", &minecraft).await.unwrap();
        assert!(dir.join("resourcepacks").join(pack).is_file());
        let _ = std::fs::remove_dir_all(dir);
    }
}
