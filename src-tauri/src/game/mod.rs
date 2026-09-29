//! Installation et lancement de Minecraft pour Clover Games.

mod download;
mod install;
mod java;
mod launch;
mod manifest;
mod mods;
mod version;

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::auth::Session;

#[derive(Debug, thiserror::Error)]
pub enum GameError {
    #[error("Aucun compte connecté.")]
    NotSignedIn,
    #[error("Une mise à jour du Clover Launcher est nécessaire pour jouer.")]
    LauncherOutdated,
    #[error("Impossible de récupérer la configuration du jeu. Vérifie ta connexion Internet.")]
    ManifestUnavailable,
    #[error("La configuration du jeu reçue n'est pas signée par Clover Games : elle a été refusée.")]
    ManifestSignature,
    #[error("Système non pris en charge : {0}.")]
    UnsupportedPlatform(String),
    #[error("Données de version invalides : {0}.")]
    InvalidVersion(String),
    #[error("Fichier corrompu après téléchargement : {0}")]
    Corrupted(String),
    #[error("Java n'a pas pu démarrer : {0}")]
    Spawn(std::io::Error),
    #[error("Erreur réseau : {0}")]
    Network(#[from] reqwest::Error),
    #[error("Fichier de version illisible : {0}")]
    Json(#[from] serde_json::Error),
    #[error("Erreur disque : {0}")]
    Io(#[from] std::io::Error),
}

impl Serialize for GameError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, GameError>;

/// Avancement envoyé à l'interface (évènement `install-progress`).
#[derive(Debug, Clone, Serialize)]
pub struct Progress {
    pub phase: &'static str,
    pub done: usize,
    pub total: usize,
}

/// `~/.cloverlauncher/`, séparé de `.minecraft`. Les fichiers partagés entre versions sont à la
/// racine, ceux du joueur (options, mods, captures) dans `game/`.
pub struct Paths {
    pub libraries: PathBuf,
    pub assets: PathBuf,
    pub versions: PathBuf,
    pub runtimes: PathBuf,
    pub natives: PathBuf,
    pub logs: PathBuf,
    pub manifest: PathBuf,
    pub game: PathBuf,
    pub mods: PathBuf,
}

impl Paths {
    fn new(app: &AppHandle) -> Result<Self> {
        let root = app
            .path()
            .home_dir()
            .map_err(|e| GameError::Io(std::io::Error::other(e.to_string())))?
            .join(".cloverlauncher");
        Ok(Self {
            libraries: root.join("libraries"),
            assets: root.join("assets"),
            versions: root.join("versions"),
            runtimes: root.join("runtimes"),
            natives: root.join("natives"),
            logs: root.join("logs"),
            manifest: root.join("manifest"),
            game: root.join("game"),
            mods: root.join("game").join("mods"),
        })
    }
}

/// Installe ce qui manque puis démarre le jeu, connecté directement au serveur.
pub async fn play(app: &AppHandle, session: &Session) -> Result<()> {
    let paths = Paths::new(app)?;
    let http = download::client();
    let progress = |progress: Progress| {
        let _ = app.emit("install-progress", progress);
    };
    let manifest = manifest::load(&http, &paths.manifest).await?;
    manifest::check_launcher_version(&manifest)?;
    let enabled = manifest.default_mods();
    eprintln!(
        "[manifest] n°{} : Minecraft {}, Fabric {}, {} mods activés",
        manifest.serial,
        manifest.minecraft.version,
        manifest.fabric.loader,
        enabled.len()
    );
    let installation = install::install(&http, &paths, &manifest, &progress).await?;
    mods::sync(&http, &paths.mods, &manifest, &enabled, &|done, total| {
        progress(Progress { phase: "mods", done, total })
    })
    .await?;
    launch::spawn(app, &paths, installation, session, &manifest.server.host).await
}
