//! Runtimes Java distribués par Mojang (ceux du launcher officiel).
//!
//! Le JSON de version désigne un composant (`java-runtime-epsilon` = Java 25 pour la 26.x) ; son
//! manifeste liste chaque fichier du runtime avec son SHA-1.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::download::{download_all, Checksum, Download};
use super::{GameError, Result};

const RUNTIMES_URL: &str =
    "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

#[derive(Deserialize)]
struct RuntimeEntry {
    manifest: ManifestRef,
}

#[derive(Deserialize)]
struct ManifestRef {
    url: String,
}

#[derive(Deserialize)]
struct RuntimeManifest {
    files: HashMap<String, RuntimeFile>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum RuntimeFile {
    Directory,
    File {
        #[serde(default)]
        executable: bool,
        downloads: FileDownloads,
    },
    Link {
        #[cfg_attr(not(unix), allow(dead_code))]
        target: String,
    },
}

#[derive(Deserialize)]
struct FileDownloads {
    raw: RawFile,
}

#[derive(Deserialize)]
struct RawFile {
    url: String,
    sha1: String,
    size: u64,
}

/// Clé de plateforme du manifeste Mojang. Linux ARM n'y figure pas.
fn platform() -> Option<&'static str> {
    Some(match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        ("windows", "x86") => "windows-x86",
        ("macos", "x86_64") => "mac-os",
        ("macos", "aarch64") => "mac-os-arm64",
        ("linux", "x86_64") => "linux",
        ("linux", "x86") => "linux-i386",
        _ => return None,
    })
}

fn executable(runtime: &Path) -> PathBuf {
    if cfg!(windows) {
        runtime.join("bin").join("javaw.exe")
    } else if cfg!(target_os = "macos") {
        runtime.join("jre.bundle/Contents/Home/bin/java")
    } else {
        runtime.join("bin").join("java")
    }
}

/// Installe (ou complète) le runtime et renvoie le chemin de l'exécutable Java.
pub async fn install(
    http: &reqwest::Client,
    runtimes: &Path,
    component: &str,
    on_progress: &(dyn Fn(usize, usize) + Sync),
) -> Result<PathBuf> {
    let platform = platform().ok_or_else(|| {
        GameError::UnsupportedPlatform(format!("{} {}", std::env::consts::OS, std::env::consts::ARCH))
    })?;
    let all: HashMap<String, HashMap<String, Vec<RuntimeEntry>>> =
        http.get(RUNTIMES_URL).send().await?.error_for_status()?.json().await?;
    let entry = all
        .get(platform)
        .and_then(|components| components.get(component))
        .and_then(|entries| entries.first())
        .ok_or_else(|| GameError::UnsupportedPlatform(format!("{platform}, {component}")))?;
    let manifest: RuntimeManifest =
        http.get(&entry.manifest.url).send().await?.error_for_status()?.json().await?;

    let root = runtimes.join(component);
    let mut downloads = Vec::new();
    let mut links = Vec::new();
    for (relative, file) in manifest.files {
        let path = root.join(&relative);
        match file {
            RuntimeFile::Directory => tokio::fs::create_dir_all(&path).await?,
            RuntimeFile::File { executable, downloads: FileDownloads { raw } } => downloads.push(Download {
                url: raw.url,
                path,
                checksum: Some(Checksum::Sha1(raw.sha1)),
                size: Some(raw.size),
                executable,
            }),
            RuntimeFile::Link { target } => links.push((path, target)),
        }
    }
    download_all(http, downloads, on_progress).await?;
    create_links(links).await?;
    Ok(executable(&root))
}

#[cfg(unix)]
async fn create_links(links: Vec<(PathBuf, String)>) -> Result<()> {
    for (path, target) in links {
        if tokio::fs::symlink_metadata(&path).await.is_err() {
            if let Some(parent) = path.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            tokio::fs::symlink(&target, &path).await?;
        }
    }
    Ok(())
}

/// Les runtimes Windows n'utilisent pas de liens.
#[cfg(not(unix))]
async fn create_links(_links: Vec<(PathBuf, String)>) -> Result<()> {
    Ok(())
}
