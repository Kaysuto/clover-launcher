//! Installation de Java, Minecraft et Fabric pour la version visée.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::download::{download_all, ensure, Checksum, Download};
use super::version::{allowed, merge_libraries, VersionJson};
use super::manifest::Manifest;
use super::{java, GameError, Paths, Progress, Result};

const VERSION_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES_URL: &str = "https://resources.download.minecraft.net";
const FABRIC_META_URL: &str = "https://meta.fabricmc.net/v2/versions/loader";

pub struct Installation {
    pub java: PathBuf,
    pub vanilla: VersionJson,
    pub loader: Option<VersionJson>,
    pub classpath: Vec<PathBuf>,
    pub logging_argument: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct VersionManifest {
    pub versions: Vec<ManifestEntry>,
}

#[derive(Deserialize)]
pub(crate) struct ManifestEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
    url: String,
    sha1: String,
}

#[derive(Deserialize)]
struct AssetIndex {
    objects: BTreeMap<String, AssetObject>,
}

#[derive(Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

pub async fn install(
    http: &reqwest::Client,
    paths: &Paths,
    manifest: &Manifest,
    progress: &(dyn Fn(Progress) + Sync),
) -> Result<Installation> {
    install_version(http, paths, &manifest.minecraft.version, Some(&manifest.fabric.loader), progress).await
}

pub(crate) async fn version_manifest(http: &reqwest::Client) -> Result<VersionManifest> {
    Ok(http.get(VERSION_MANIFEST_URL).send().await?.error_for_status()?.json().await?)
}

pub(crate) async fn install_version(
    http: &reqwest::Client,
    paths: &Paths,
    minecraft: &str,
    fabric: Option<&str>,
    progress: &(dyn Fn(Progress) + Sync),
) -> Result<Installation> {
    crate::instances::validate_version_id(minecraft)?;
    if let Some(fabric) = fabric { crate::instances::validate_version_id(fabric)?; }
    let vanilla = vanilla_json(http, paths, minecraft).await?;
    let loader = match fabric {
        Some(fabric) => Some(fabric_json(http, paths, minecraft, fabric).await?),
        None => None,
    };
    crate::instances::validate_version_id(&vanilla.id)?;
    if let Some(loader) = &loader { crate::instances::validate_version_id(&loader.id)?; }
    if vanilla.arguments.game.is_empty() && vanilla.minecraft_arguments.is_none() {
        return Err(GameError::InvalidVersion("arguments du jeu absents".into()));
    }

    let component = vanilla
        .java_version
        .as_ref()
        .map_or("java-runtime-epsilon", |java| java.component.as_str());
    let java = java::install(http, &paths.runtimes, component, &|done, total| {
        progress(Progress { phase: "java", done, total })
    })
    .await?;

    // Bibliothèques, client et configuration des logs
    let mut downloads = Vec::new();
    let mut classpath = Vec::new();
    let mut native_archives = Vec::new();
    for library in merge_libraries(loader.as_ref().map_or(&[], |loader| loader.libraries.as_slice()), &vanilla.libraries) {
        if !allowed(&library.rules, &[]) {
            continue;
        }
        if let Some(resolved) = library.resolve() {
            let sha1 = match resolved.sha1 {
            Some(sha1) => sha1,
            // fabric-loader est publié sans empreinte dans le profil : la lire sur le dépôt Maven.
            None => maven_sha1(http, &resolved.url).await?,
        };
        let path = paths.libraries.join(&resolved.path);
        classpath.push(path.clone());
            downloads.push(Download {
            url: resolved.url,
            path,
            checksum: Some(Checksum::Sha1(sha1)),
            size: resolved.size,
            executable: false,
            });
        }
        if let Some(native) = library.native() {
            let path = paths.libraries.join(&native.path);
            native_archives.push((path.clone(), library.extract.as_ref().map_or_else(Vec::new, |extract| extract.exclude.clone())));
            downloads.push(Download { url: native.url, path, checksum: native.sha1.map(Checksum::Sha1), size: native.size, executable: false });
        }
    }

    let client = &vanilla
        .downloads
        .as_ref()
        .ok_or_else(|| GameError::InvalidVersion("client absent".into()))?
        .client;
    let client_jar = paths.versions.join(&vanilla.id).join(format!("{}.jar", vanilla.id));
    classpath.push(client_jar.clone());
    downloads.push(Download {
        url: client.url.clone(),
        path: client_jar,
        checksum: client.sha1.clone().map(Checksum::Sha1),
        size: client.size,
        executable: false,
    });

    let mut logging_argument = None;
    if let Some(logging) = vanilla.logging.as_ref().and_then(|logging| logging.client.as_ref()) {
        let path = paths.assets.join("log_configs").join(&logging.file.id);
        logging_argument = Some(logging.argument.replace("${path}", &path.to_string_lossy()));
        downloads.push(Download {
            url: logging.file.url.clone(),
            path,
            checksum: Some(Checksum::Sha1(logging.file.sha1.clone())),
            size: Some(logging.file.size),
            executable: false,
        });
    }
    download_all(http, downloads, &|done, total| progress(Progress { phase: "libraries", done, total })).await?;
    if !native_archives.is_empty() {
        let native_dir = paths.natives.join(loader.as_ref().map_or(vanilla.id.as_str(), |loader| &loader.id));
        extract_natives(&native_archives, &native_dir)?;
    }

    // Assets, adressés par leur empreinte : un même fichier peut servir plusieurs noms.
    let index_ref = vanilla
        .asset_index
        .as_ref()
        .ok_or_else(|| GameError::InvalidVersion("index d'assets absent".into()))?;
    let index_path = paths.assets.join("indexes").join(format!("{}.json", index_ref.id));
    ensure(http, &Download {
        url: index_ref.url.clone(),
        path: index_path.clone(),
        checksum: Some(Checksum::Sha1(index_ref.sha1.clone())),
        size: Some(index_ref.size),
        executable: false,
    })
    .await?;
    let index: AssetIndex = read_json(&index_path).await?;
    let objects: BTreeMap<String, u64> = index.objects.into_values().map(|object| (object.hash, object.size)).collect();
    let downloads = objects
        .into_iter()
        .map(|(hash, size)| {
            let prefix = &hash[..2];
            Download {
                url: format!("{RESOURCES_URL}/{prefix}/{hash}"),
                path: paths.assets.join("objects").join(prefix).join(&hash),
                checksum: Some(Checksum::Sha1(hash.clone())),
                size: Some(size),
                executable: false,
            }
        })
        .collect();
    download_all(http, downloads, &|done, total| progress(Progress { phase: "assets", done, total })).await?;

    Ok(Installation { java, vanilla, loader, classpath, logging_argument })
}

/// Le JSON d'une version publiée ne change jamais : une copie locale suffit, même hors ligne.
async fn vanilla_json(http: &reqwest::Client, paths: &Paths, id: &str) -> Result<VersionJson> {
    let path = paths.versions.join(id).join(format!("{id}.json"));
    if tokio::fs::metadata(&path).await.is_err() {
        let manifest: VersionManifest =
            http.get(VERSION_MANIFEST_URL).send().await?.error_for_status()?.json().await?;
        let entry = manifest
            .versions
            .into_iter()
            .find(|entry| entry.id == id)
            .ok_or_else(|| GameError::InvalidVersion(format!("version {id} inconnue de Mojang")))?;
        ensure(http, &Download {
            url: entry.url,
            path: path.clone(),
            checksum: Some(Checksum::Sha1(entry.sha1)),
            size: None,
            executable: false,
        })
        .await?;
    }
    read_json(&path).await
}

/// Octets à télécharger pour installer `minecraft` : client, bibliothèques, ressources et Java
/// manquants. Rien n'est écrit : le JSON d'une version absente est lu en ligne. Les ressources
/// partagées entre versions sont comptées entières si l'index manque : un majorant. Fabric (un
/// chargeur et quelques bibliothèques, sans taille publiée) n'est pas compté.
pub async fn download_size(http: &reqwest::Client, paths: &Paths, minecraft: &str) -> Result<u64> {
    crate::instances::validate_version_id(minecraft)?;
    let cached = paths.versions.join(minecraft).join(format!("{minecraft}.json"));
    let vanilla: VersionJson = if cached.is_file() {
        read_json(&cached).await?
    } else {
        let manifest: VersionManifest = http.get(VERSION_MANIFEST_URL).send().await?.error_for_status()?.json().await?;
        let entry = manifest.versions.into_iter().find(|entry| entry.id == minecraft).ok_or_else(|| GameError::InvalidVersion(format!("version {minecraft} inconnue de Mojang")))?;
        http.get(entry.url).send().await?.error_for_status()?.json().await?
    };
    let missing = |path: PathBuf, size: Option<u64>| if path.is_file() { 0 } else { size.unwrap_or(0) };
    let mut total = 0;
    if let Some(client) = vanilla.downloads.as_ref().map(|downloads| &downloads.client) {
        total += missing(paths.versions.join(minecraft).join(format!("{minecraft}.jar")), client.size);
    }
    for library in vanilla.libraries.iter().filter(|library| allowed(&library.rules, &[])) {
        for resolved in [library.resolve(), library.native()].into_iter().flatten() {
            total += missing(paths.libraries.join(&resolved.path), resolved.size);
        }
    }
    if let Some(index) = &vanilla.asset_index {
        total += missing(paths.assets.join("indexes").join(format!("{}.json", index.id)), Some(index.total_size));
    }
    let component = vanilla.java_version.as_ref().map_or("java-runtime-epsilon", |java| java.component.as_str());
    total += java::download_size(http, &paths.runtimes, component).await?;
    Ok(total)
}

async fn fabric_json(http: &reqwest::Client, paths: &Paths, minecraft: &str, loader: &str) -> Result<VersionJson> {
    let id = format!("fabric-loader-{loader}-{minecraft}");
    let path = paths.versions.join(&id).join(format!("{id}.json"));
    if tokio::fs::metadata(&path).await.is_err() {
        let url = format!("{FABRIC_META_URL}/{minecraft}/{loader}/profile/json");
        ensure(http, &Download { url, path: path.clone(), checksum: None, size: None, executable: false }).await?;
    }
    read_json(&path).await
}

async fn maven_sha1(http: &reqwest::Client, url: &str) -> Result<String> {
    let text = http.get(format!("{url}.sha1")).send().await?.error_for_status()?.text().await?;
    Ok(text.split_whitespace().next().unwrap_or_default().to_lowercase())
}

async fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    Ok(serde_json::from_slice(&tokio::fs::read(path).await?)?)
}

/// Archives vérifiées par Mojang. Les chemins ZIP restent confinés au dossier de cette version.
fn extract_natives(archives: &[(PathBuf, Vec<String>)], dir: &Path) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    for (path, excluded) in archives {
        let mut archive = zip::ZipArchive::new(std::fs::File::open(path)?)
            .map_err(|_| GameError::InvalidVersion("archive de bibliothèques natives illisible".into()))?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|_| GameError::InvalidVersion("bibliothèque native illisible".into()))?;
            if entry.is_dir() || entry.name().starts_with("META-INF/") || excluded.iter().any(|prefix| entry.name().starts_with(prefix)) { continue; }
            let relative = entry.enclosed_name().ok_or_else(|| GameError::InvalidVersion("chemin de bibliothèque native invalide".into()))?;
            let target = dir.join(relative);
            if let Some(parent) = target.parent() { std::fs::create_dir_all(parent)?; }
            std::io::copy(&mut entry, &mut std::fs::File::create(target)?)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod instance_tests {
    use super::*;

    /// Réseau : taille annoncée d'une version absente, sans rien écrire ; puis celle de la 26.2
    /// installée sur le poste (lancer avec `--ignored`).
    #[tokio::test]
    #[ignore]
    async fn announces_download_size() {
        let root = std::env::temp_dir().join(format!("clover-size-{}", rand::random::<u64>()));
        let paths = Paths::from_root(root.clone());
        let size = download_size(&crate::game::download::client(), &paths, "1.20.1").await.unwrap();
        println!("1.20.1 sur un poste neuf : {} Mo", size / 1_000_000);
        assert!(size > 300_000_000 && size < 2_000_000_000);
        assert!(!root.exists(), "rien d'écrit");
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap();
        let installed = Paths::from_root(std::path::PathBuf::from(home).join(".cloverlauncher"));
        println!("26.2 installée : {} octets", download_size(&crate::game::download::client(), &installed, "26.2").await.unwrap());
    }

    #[test]
    fn native_extraction_excludes_metadata_and_refuses_traversal() {
        use std::io::Write;
        let root = std::env::temp_dir().join(format!("clover-native-test-{}", rand::random::<u64>()));
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("native.jar");
        let mut archive = zip::ZipWriter::new(std::fs::File::create(&file).unwrap());
        for name in ["META-INF/manifest", "ignore/notice", "native.dll"] {
            archive.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            archive.write_all(b"native").unwrap();
        }
        archive.finish().unwrap();
        let natives = root.join("natives");
        extract_natives(&[(file.clone(), vec!["ignore/".into()])], &natives).unwrap();
        assert_eq!(std::fs::read(natives.join("native.dll")).unwrap(), b"native");
        assert!(!natives.join("META-INF").exists() && !natives.join("ignore").exists());
        let mut archive = zip::ZipWriter::new(std::fs::File::create(&file).unwrap());
        archive.start_file("../escape.dll", zip::write::SimpleFileOptions::default()).unwrap();
        archive.write_all(b"unsafe").unwrap(); archive.finish().unwrap();
        assert!(extract_natives(&[(file, vec![])], &natives).is_err());
        assert!(!root.join("escape.dll").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    #[ignore = "anciens profils Mojang, réseau requis"]
    async fn legacy_and_modern_vanilla_profiles_build_launchable_arguments() {
        let root = std::env::temp_dir().join(format!("clover-legacy-profile-{}", rand::random::<u64>()));
        let paths = Paths::from_root(root.clone());
        let http = super::super::download::client();
        let session = crate::auth::Session { profile: crate::auth::Profile { uuid: "test".into(), name: "Joueur".into(), skin: None, capes: vec![] }, minecraft_token: "synthetic-test-token".into(), expires_at: u64::MAX };
        let options = crate::game::LaunchOptions { memory_mb: Some(2048), java_args: vec![], fullscreen: false, enabled_mods: None, disabled_personal_mods: vec![] };
        for id in ["1.8.9", "1.12.2", "1.16.5", "1.17.1", "1.18.2", "1.19.4", "1.20.1", "1.21.11", "26.1.2"] {
            let vanilla = vanilla_json(&http, &paths, id).await.unwrap();
            assert!(vanilla.java_version.is_some());
            let classpath: Vec<_> = vanilla.libraries.iter().filter(|library| allowed(&library.rules, &[])).filter_map(|library| library.resolve()).map(|library| paths.libraries.join(library.path)).collect();
            if matches!(id, "1.8.9" | "1.12.2" | "1.16.5" | "1.17.1" | "1.18.2") { assert!(vanilla.libraries.iter().any(|library| library.native().is_some()), "{id}"); }
            let installation = Installation { java: "java".into(), vanilla, loader: None, classpath, logging_argument: None };
            let arguments = crate::game::launch::build_arguments(&paths, &installation, &session, None, &options).unwrap();
            assert!(!arguments.iter().any(|argument| argument.contains("${")), "{id}");
            assert!(arguments.contains(&"-cp".into()));
            assert!(arguments.contains(&"--gameDir".into()));
            assert!(!arguments.contains(&"--quickPlayMultiplayer".into()));
        }
        std::fs::remove_dir_all(root).unwrap();
    }
    #[tokio::test]
    #[ignore = "profils officiels Mojang et Fabric, réseau requis"]
    async fn reads_personal_profiles_and_builds_real_launch_arguments() {
        let root = std::env::temp_dir().join(format!("clover-profile-proof-{}", rand::random::<u64>()));
        let paths = Paths::from_root(root.clone());
        let http = super::super::download::client();
        let vanilla = vanilla_json(&http, &paths, "1.20.1").await.unwrap();
        let loaders = crate::instances::loaders(&root, "1.20.1").await.unwrap();
        let fabric = fabric_json(&http, &paths, "1.20.1", &loaders[0]).await.unwrap();
        assert_eq!(vanilla.id, "1.20.1");
        assert!(!vanilla.arguments.jvm.is_empty());
        assert!(!vanilla.arguments.game.is_empty());
        assert!(vanilla.java_version.is_some());
        assert!(fabric.main_class.as_ref().is_some_and(|class| class.contains("KnotClient")));
        let libraries = merge_libraries(&fabric.libraries, &vanilla.libraries);
        assert!(libraries.iter().filter(|library| allowed(&library.rules, &[])).all(|library| library.resolve().is_some()));
        let classpath = libraries.iter().filter(|library| allowed(&library.rules, &[])).filter_map(|library| library.resolve()).map(|library| paths.libraries.join(library.path)).collect();
        let mut installation = Installation { java: "java".into(), vanilla, loader: None, classpath, logging_argument: None };
        let session = crate::auth::Session { profile: crate::auth::Profile { uuid: "test".into(), name: "Joueur".into(), skin: None, capes: vec![] }, minecraft_token: "synthetic-test-token".into(), expires_at: u64::MAX };
        let options = crate::game::LaunchOptions { memory_mb: Some(4096), java_args: vec![], fullscreen: false, enabled_mods: None, disabled_personal_mods: vec![] };
        let arguments = crate::game::launch::build_arguments(&paths, &installation, &session, None, &options).unwrap();
        assert!(!arguments.iter().any(|argument| argument.contains("${")));
        assert!(!arguments.contains(&"--quickPlayMultiplayer".into()));
        installation.loader = Some(fabric);
        let arguments = crate::game::launch::build_arguments(&paths, &installation, &session, None, &options).unwrap();
        assert!(!arguments.iter().any(|argument| argument.contains("${")));
        assert!(arguments.iter().any(|argument| argument.contains("KnotClient")));
        std::fs::remove_dir_all(root).unwrap();
    }
}
