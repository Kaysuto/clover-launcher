//! Téléchargements parallèles vérifiés.
//!
//! Un fichier déjà présent à la bonne taille est considéré comme installé ; tout nouveau
//! téléchargement est vérifié (SHA-1 ou SHA-512) avant d'être renommé à sa place définitive. Une coupure
//! laisse au pire un `.part`, repris depuis le début au lancement suivant.

use std::path::{Path, PathBuf};

use futures_util::{stream, StreamExt};
use sha1::{Digest, Sha1};
use sha2::Sha512;
use tokio::io::AsyncWriteExt;

use super::{GameError, Result};

const PARALLEL_DOWNLOADS: usize = 16;
const ATTEMPTS: usize = 3;

/// Empreinte attendue, en hexadécimal minuscule.
#[derive(Debug, Clone, PartialEq)]
pub enum Checksum {
    Sha1(String),
    Sha512(String),
}

#[derive(Debug, Clone)]
pub struct Download {
    pub url: String,
    pub path: PathBuf,
    pub checksum: Option<Checksum>,
    pub size: Option<u64>,
    pub executable: bool,
}

enum Hasher {
    Sha1(Sha1),
    Sha512(Sha512),
}

impl Hasher {
    fn new(checksum: &Checksum) -> Self {
        match checksum {
            Checksum::Sha1(_) => Self::Sha1(Sha1::new()),
            Checksum::Sha512(_) => Self::Sha512(Sha512::new()),
        }
    }

    fn update(&mut self, bytes: &[u8]) {
        match self {
            Self::Sha1(hasher) => hasher.update(bytes),
            Self::Sha512(hasher) => hasher.update(bytes),
        }
    }

    fn matches(self, checksum: &Checksum) -> bool {
        let actual = match self {
            Self::Sha1(hasher) => hex(&hasher.finalize()),
            Self::Sha512(hasher) => hex(&hasher.finalize()),
        };
        match checksum {
            Checksum::Sha1(expected) | Checksum::Sha512(expected) => actual == *expected,
        }
    }
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("CloverLauncher/", env!("CARGO_PKG_VERSION"), " (+https://clovergames.fr)"))
        .build()
        .expect("client HTTP valide")
}

/// Télécharge ce qui manque, en parallèle. `on_progress(fait, total)` est appelé au départ puis à
/// chaque fichier terminé.
pub async fn download_all(
    http: &reqwest::Client,
    downloads: Vec<Download>,
    on_progress: &(dyn Fn(usize, usize) + Sync),
) -> Result<()> {
    let total = downloads.len();
    on_progress(0, total);
    // Chaque future possède son `Download` : un emprunt ici empêche le futur d'être `Send`.
    let mut pending = stream::iter(downloads)
        .map(|download| async move { ensure(http, &download).await })
        .buffer_unordered(PARALLEL_DOWNLOADS);
    let mut done = 0;
    while let Some(result) = pending.next().await {
        result?;
        done += 1;
        on_progress(done, total);
    }
    Ok(())
}

pub async fn ensure(http: &reqwest::Client, download: &Download) -> Result<()> {
    if is_installed(download).await? {
        return Ok(());
    }
    let mut last_error = None;
    for _ in 0..ATTEMPTS {
        match fetch(http, download).await {
            Ok(()) => return Ok(()),
            Err(error) => last_error = Some(error),
        }
    }
    Err(last_error.expect("au moins une tentative"))
}

async fn is_installed(download: &Download) -> Result<bool> {
    let Ok(metadata) = tokio::fs::metadata(&download.path).await else {
        return Ok(false);
    };
    match (download.size, &download.checksum) {
        (Some(size), _) => Ok(metadata.len() == size),
        (None, Some(checksum)) => {
            let mut hasher = Hasher::new(checksum);
            hasher.update(&tokio::fs::read(&download.path).await?);
            Ok(hasher.matches(checksum))
        }
        (None, None) => Ok(true),
    }
}

async fn fetch(http: &reqwest::Client, download: &Download) -> Result<()> {
    if let Some(parent) = download.path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    // `java.dll` et `java.exe` partagent le même dossier : suffixer le nom complet, pas l'extension.
    let mut partial_name = download.path.file_name().unwrap_or_default().to_os_string();
    partial_name.push(".part");
    let partial = download.path.with_file_name(partial_name);
    let mut response = http.get(&download.url).send().await?.error_for_status()?;
    let mut file = tokio::fs::File::create(&partial).await?;
    let mut hasher = download.checksum.as_ref().map(Hasher::new);
    let mut written = 0u64;
    while let Some(chunk) = response.chunk().await? {
        if let Some(hasher) = hasher.as_mut() {
            hasher.update(&chunk);
        }
        written += chunk.len() as u64;
        file.write_all(&chunk).await?;
    }
    file.flush().await?;
    drop(file);

    let size_ok = download.size.is_none_or(|size| size == written);
    let checksum_ok = match (hasher, &download.checksum) {
        (Some(hasher), Some(checksum)) => hasher.matches(checksum),
        _ => true,
    };
    if !(size_ok && checksum_ok) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(GameError::Corrupted(download.url.clone()));
    }
    set_executable(&partial, download.executable).await?;
    tokio::fs::rename(&partial, &download.path).await?;
    Ok(())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(unix)]
async fn set_executable(path: &Path, executable: bool) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    if executable {
        tokio::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).await?;
    }
    Ok(())
}

#[cfg(not(unix))]
async fn set_executable(_path: &Path, _executable: bool) -> Result<()> {
    Ok(())
}
