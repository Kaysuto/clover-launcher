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
    pub loader: VersionJson,
    pub classpath: Vec<PathBuf>,
    pub logging_argument: Option<String>,
}

#[derive(Deserialize)]
struct VersionManifest {
    versions: Vec<ManifestEntry>,
}

#[derive(Deserialize)]
struct ManifestEntry {
    id: String,
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
    let minecraft = &manifest.minecraft.version;
    let vanilla = vanilla_json(http, paths, minecraft).await?;
    let loader = fabric_json(http, paths, minecraft, &manifest.fabric.loader).await?;

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
    for library in merge_libraries(&loader.libraries, &vanilla.libraries) {
        if !allowed(&library.rules, &[]) {
            continue;
        }
        let Some(resolved) = library.resolve() else { continue };
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
