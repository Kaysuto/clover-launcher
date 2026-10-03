//! Réglages et liste des comptes, gardés dans `~/.cloverlauncher/launcher.json`.
//!
//! Les secrets n'y sont jamais : jetons et sessions restent dans le coffre du système (`auth`).
//! Un fichier absent ou illisible redonne les valeurs par défaut, sans bloquer le démarrage.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Réglages modifiables dans l'interface. Mêmes noms que le type `Settings` du front.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub start_with_system: bool,
    pub keep_in_tray: bool,
    pub auto_update: bool,
    pub beta_channel: bool,
    pub system_notifications: bool,
    pub scale: u32,
    pub animations: String,
    pub animated_skin: bool,
    pub show_votes: bool,
    pub memory_auto: bool,
    pub memory_gb: u32,
    pub fullscreen: bool,
    /// `keep`, `minimize` ou `quit`.
    pub on_launch: String,
    pub java_args: String,
    pub discord_presence: bool,
    pub crash_reports: bool,
    /// Mods du catalogue choisis ; `None` = mods activés par défaut dans le manifeste.
    pub enabled_mods: Option<Vec<String>>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            start_with_system: false,
            keep_in_tray: true,
            auto_update: true,
            beta_channel: false,
            system_notifications: true,
            scale: 100,
            animations: "system".into(),
            animated_skin: true,
            show_votes: true,
            memory_auto: true,
            memory_gb: 4,
            fullscreen: false,
            on_launch: "minimize".into(),
            java_args: String::new(),
            discord_presence: true,
            // Consentement RGPD : désactivé tant que le joueur ne l'a pas donné.
            crash_reports: false,
            enabled_mods: None,
        }
    }
}

/// Compte connu du launcher (pas de secret : uuid, pseudo, skin pour la tête dans la liste).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRef {
    pub uuid: String,
    pub name: String,
    pub skin_url: Option<String>,
}

/// Serveur rejoint en jeu, d'après le journal Quick Play de Minecraft (`game::quick_play`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecentServer {
    pub address: String,
    /// Nom donné dans la liste des serveurs du jeu, ou nom par défaut pour une connexion directe.
    pub name: String,
}

/// Assez pour que les serveurs Clover Games (Lobby, modes), filtrés par l'accueil, ne chassent pas
/// les autres de l'historique.
const RECENT_SERVERS: usize = 16;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Stored {
    pub settings: Settings,
    pub accounts: Vec<AccountRef>,
    pub active_account: Option<String>,
    /// Premier lancement terminé.
    pub onboarded: bool,
    /// Fichiers de « Mes mods » désactivés ; un mod ajouté est activé d'office.
    pub disabled_personal_mods: Vec<String>,
    /// Serveurs rejoints en jeu, du plus récent au plus ancien.
    pub recent_servers: Vec<RecentServer>,
}

impl Stored {
    pub fn load(path: &Path) -> Self {
        std::fs::read(path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
    }

    /// Écriture atomique : un plantage pendant l'écriture ne laisse jamais un fichier tronqué.
    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temporary = path.with_extension("json.tmp");
        std::fs::write(&temporary, serde_json::to_vec_pretty(self).expect("réglages sérialisables"))?;
        std::fs::rename(temporary, path)
    }

    /// Ajoute ou met à jour un compte ; le premier compte ajouté devient le compte actif.
    pub fn upsert_account(&mut self, account: AccountRef) {
        match self.accounts.iter_mut().find(|existing| existing.uuid == account.uuid) {
            Some(existing) => *existing = account,
            None => {
                if self.active_account.is_none() {
                    self.active_account = Some(account.uuid.clone());
                }
                self.accounts.push(account);
            }
        }
    }

    /// Retire un compte ; si c'était le compte actif, le suivant de la liste le devient.
    pub fn remove_account(&mut self, uuid: &str) {
        self.accounts.retain(|account| account.uuid != uuid);
        if self.active_account.as_deref() == Some(uuid) {
            self.active_account = self.accounts.first().map(|account| account.uuid.clone());
        }
    }

    /// Place `server` en tête des serveurs récents ; `false` s'il y était déjà (rien à enregistrer).
    pub fn remember_server(&mut self, server: RecentServer) -> bool {
        if self.recent_servers.first() == Some(&server) {
            return false;
        }
        self.recent_servers.retain(|known| known.address != server.address);
        self.recent_servers.insert(0, server);
        self.recent_servers.truncate(RECENT_SERVERS);
        true
    }
}

pub fn path(root: &Path) -> PathBuf {
    root.join("launcher.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account(uuid: &str) -> AccountRef {
        AccountRef { uuid: uuid.into(), name: uuid.into(), skin_url: None }
    }

    #[test]
    fn first_account_becomes_active_and_removal_falls_back() {
        let mut stored = Stored::default();
        stored.upsert_account(account("a"));
        stored.upsert_account(account("b"));
        assert_eq!(stored.active_account.as_deref(), Some("a"));
        stored.remove_account("a");
        assert_eq!(stored.active_account.as_deref(), Some("b"));
        stored.remove_account("b");
        assert_eq!(stored.active_account, None);
    }

    #[test]
    fn remembered_server_moves_to_front_once() {
        let server = |address: &str| RecentServer { address: address.into(), name: "Serveur Minecraft".into() };
        let mut stored = Stored::default();
        assert!(stored.remember_server(server("a")));
        assert!(stored.remember_server(server("b")));
        assert!(!stored.remember_server(server("b")));
        assert!(stored.remember_server(server("a")));
        assert_eq!(stored.recent_servers, [server("a"), server("b")]);
        for index in 0..RECENT_SERVERS + 4 {
            stored.remember_server(server(&index.to_string()));
        }
        assert_eq!(stored.recent_servers.len(), RECENT_SERVERS);
    }

    #[test]
    fn unknown_or_missing_fields_fall_back_to_defaults() {
        let stored: Stored = serde_json::from_str(r#"{"settings": {"memoryGb": 8, "ancienChamp": 1}}"#).unwrap();
        assert_eq!(stored.settings.memory_gb, 8);
        assert!(stored.settings.keep_in_tray);
        assert!(!stored.settings.crash_reports);
    }

    #[test]
    fn saves_and_reloads() {
        let dir = std::env::temp_dir().join(format!("clover-store-{}", std::process::id()));
        let file = path(&dir);
        let mut stored = Stored::default();
        stored.settings.scale = 125;
        stored.save(&file).unwrap();
        assert_eq!(Stored::load(&file).settings.scale, 125);
        let _ = std::fs::remove_dir_all(dir);
    }
}
