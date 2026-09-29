//! Installation et lancement de Minecraft pour Clover Games.

mod download;
mod install;
mod java;
mod launch;
mod version;

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::auth::Session;

/// Ce que le launcher installe. Codé en dur pour le prototype ; viendra du manifeste distant
/// signé (CLO-272).
pub struct Target {
    pub minecraft: &'static str,
    pub fabric_loader: &'static str,
    pub server: &'static str,
}

pub const TARGET: Target = Target { minecraft: "26.2", fabric_loader: "0.19.5", server: "play.clovergames.fr" };

#[derive(Debug, thiserror::Error)]
pub enum GameError {
    #[error("Aucun compte connecté.")]
    NotSignedIn,
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
    pub game: PathBuf,
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
            game: root.join("game"),
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
    let installation = install::install(&http, &paths, &TARGET, &progress).await?;
    launch::spawn(app, &paths, installation, session, &TARGET).await
}
