//! Installation et lancement de Minecraft pour Clover Games.

pub(crate) mod download;
mod install;
mod java;
mod launch;
pub mod manifest;
mod mods;
mod version;

use std::collections::HashSet;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::auth::Session;

#[derive(Debug, thiserror::Error)]
pub enum GameError {
    #[error("Aucun compte connecté.")]
    NotSignedIn,
    #[error("Ce mode ne se rejoint pas directement : passe par le Lobby.")]
    NoQuickPlay,
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
    pub root: PathBuf,
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
    pub fn new(app: &AppHandle) -> Result<Self> {
        let root = app
            .path()
            .home_dir()
            .map_err(|e| GameError::Io(std::io::Error::other(e.to_string())))?
            .join(".cloverlauncher");
        Ok(Self {
            root: root.clone(),
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

/// Réglages du joueur qui changent la ligne de commande et les mods installés.
pub struct LaunchOptions {
    /// `None` : mémoire automatique.
    pub memory_mb: Option<u64>,
    pub java_args: Vec<String>,
    pub fullscreen: bool,
    /// `None` : mods activés par défaut dans le manifeste.
    pub enabled_mods: Option<HashSet<String>>,
}

/// Quart de la mémoire du poste, borné entre 2 et 6 Go.
pub fn auto_memory_mb() -> u64 {
    (total_memory_mb() / 4).clamp(2048, 6144)
}

pub fn total_memory_mb() -> u64 {
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    system.total_memory() / 1024 / 1024
}

/// Version du Java installé par le launcher (fichier `release` du runtime Mojang), s'il existe.
pub fn installed_java(paths: &Paths) -> Option<String> {
    let entries = std::fs::read_dir(&paths.runtimes).ok()?;
    entries.flatten().find_map(|entry| {
        let candidates = [entry.path().join("release"), entry.path().join("jre.bundle/Contents/Home/release")];
        candidates.iter().find_map(|file| {
            let text = std::fs::read_to_string(file).ok()?;
            text.lines().find_map(|line| line.strip_prefix("JAVA_VERSION=").map(|value| value.trim_matches('"').to_owned()))
        })
    })
}

/// Manifeste courant (téléchargé, sinon en cache), pour l'interface.
pub async fn catalogue(app: &AppHandle) -> Result<manifest::Manifest> {
    let paths = Paths::new(app)?;
    manifest::load(&download::client(), &paths.manifest).await
}

/// Installe ce qui manque puis démarre le jeu, connecté directement au serveur.
/// `mode` : identifiant d'un mode du manifeste à rejoindre directement, `None` pour le Lobby.
pub async fn play(app: &AppHandle, session: &Session, options: LaunchOptions, mode: Option<&str>) -> Result<()> {
    let paths = Paths::new(app)?;
    let http = download::client();
    let progress = |progress: Progress| {
        let _ = app.emit("install-progress", progress);
    };
    let manifest = manifest::load(&http, &paths.manifest).await?;
    manifest::check_launcher_version(&manifest)?;
    let server = manifest.server_for(mode).ok_or(GameError::NoQuickPlay)?.to_owned();
    let enabled = options.enabled_mods.clone().unwrap_or_else(|| manifest.default_mods());
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
    launch::spawn(app, &paths, installation, session, &server, &options).await
}
