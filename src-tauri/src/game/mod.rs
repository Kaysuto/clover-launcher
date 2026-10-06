//! Installation et lancement de Minecraft pour Clover Games.

pub mod console;
pub mod content;
pub(crate) mod download;
pub(crate) mod install;
mod java;
pub(crate) mod launch;
pub mod manifest;
pub mod modrinth;
pub(crate) mod mods;
pub mod personal;
pub mod quick_play;
mod version;
pub(crate) mod window_title;

use std::collections::HashSet;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::auth::Session;
use crate::store::RecentServer;

#[derive(Debug, thiserror::Error)]
pub enum GameError {
    #[error("Aucun compte connecté.")]
    NotSignedIn,
    #[error("Minecraft est déjà ouvert ou en cours de lancement. Ferme le jeu avant de lancer une autre instance.")]
    AlreadyRunning,
    #[error("Ce mode ne se rejoint pas directement : passe par le Lobby.")]
    NoQuickPlay,
    #[error("Ce serveur ne fait pas partie de ceux que tu as déjà rejoints.")]
    UnknownServer,
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
    #[error("« {0} » n'est pas un mod Minecraft (.jar).")]
    NotAMod(String),
    #[error("Ce mod n'existe pas encore pour la version du serveur.")]
    NoUpdate,
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
    /// Sortie du jeu pendant la dernière partie (voir `console`).
    pub game_output: PathBuf,
    pub manifest: PathBuf,
    pub game: PathBuf,
    pub mods: PathBuf,
    /// Mods ajoutés par le joueur (« Mes mods »), copiés dans `mods` au lancement.
    pub personal_mods: PathBuf,
    /// Journal Quick Play écrit par le jeu (voir `quick_play`).
    pub quick_play_log: PathBuf,
}

impl Paths {
    pub fn new(app: &AppHandle) -> Result<Self> {
        let root = app
            .path()
            .home_dir()
            .map_err(|e| GameError::Io(std::io::Error::other(e.to_string())))?
            .join(".cloverlauncher");
        Ok(Self::from_root(root))
    }

    pub(crate) fn from_root(root: PathBuf) -> Self {
        Self {
            root: root.clone(),
            libraries: root.join("libraries"),
            assets: root.join("assets"),
            versions: root.join("versions"),
            runtimes: root.join("runtimes"),
            natives: root.join("natives"),
            logs: root.join("logs"),
            game_output: root.join("logs").join("game-output.log"),
            manifest: root.join("manifest"),
            game: root.join("game"),
            mods: root.join("game").join("mods"),
            personal_mods: root.join("personal-mods"),
            quick_play_log: root.join("quick-play.json"),
        }
    }
}

/// Serveur auquel le jeu se connecte au lancement (Quick Play).
pub enum Destination {
    /// Mode du manifeste à rejoindre directement, `None` pour le Lobby.
    Mode(Option<String>),
    /// Autre serveur déjà rejoint par le joueur, par son adresse.
    Server(String),
}

/// Réglages du joueur qui changent la ligne de commande et les mods installés.
pub struct LaunchOptions {
    /// `None` : mémoire automatique.
    pub memory_mb: Option<u64>,
    pub java_args: Vec<String>,
    pub fullscreen: bool,
    /// `None` : mods activés par défaut dans le manifeste.
    pub enabled_mods: Option<HashSet<String>>,
    /// Fichiers de « Mes mods » désactivés par le joueur.
    pub disabled_personal_mods: Vec<String>,
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

/// Canal choisi dans les paramètres (« Canal bêta »).
pub fn channel(app: &AppHandle) -> &'static str {
    if app.state::<crate::AppState>().snapshot().settings.beta_channel {
        manifest::BETA
    } else {
        manifest::PROD
    }
}

/// Manifeste courant (téléchargé, sinon en cache), pour l'interface.
pub async fn catalogue(app: &AppHandle) -> Result<manifest::Manifest> {
    let paths = Paths::new(app)?;
    manifest::load(&download::client(), &paths.manifest, channel(app)).await
}

/// Installe ce qui manque puis démarre le jeu, connecté directement à `destination`.
/// `on_join` reçoit chaque serveur rejoint pendant la partie, et le dernier à sa fermeture.
pub async fn play(
    app: &AppHandle,
    session: &Session,
    options: LaunchOptions,
    destination: Destination,
    on_join: impl Fn(RecentServer) + Send + 'static,
    instance: &crate::instances::Instance,
) -> Result<()> {
    let paths = crate::instances::paths(Paths::new(app)?, instance)?;
    let http = download::client();
    let progress = |progress: Progress| {
        let _ = app.emit("install-progress", progress);
    };
    let manifest = manifest::load(&http, &paths.manifest, channel(app)).await?;
    manifest::check_launcher_version(&manifest)?;
    let server = match destination {
        Destination::Mode(mode) => manifest.server_for(mode.as_deref()).ok_or(GameError::NoQuickPlay)?.to_owned(),
        Destination::Server(address) => address,
    };
    let enabled = options.enabled_mods.clone().unwrap_or_else(|| manifest.default_mods());
    eprintln!(
        "[manifest] n°{} : Minecraft {}, Fabric {}, {} mods activés",
        manifest.serial,
        manifest.minecraft.version,
        manifest.fabric.loader,
        enabled.len()
    );
    let installation = install::install(&http, &paths, &manifest, &progress).await?;
    let personal = personal::loadable(&paths.personal_mods, &options.disabled_personal_mods, &manifest.minecraft.version);
    mods::sync(&http, &paths.mods, &manifest, &enabled, &personal, &|done, total| {
        progress(Progress { phase: "mods", done, total })
    })
    .await?;
    launch::spawn(app, &paths, installation, session, Some(&server), &options, on_join).await
}
