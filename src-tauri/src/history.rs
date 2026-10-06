//! Parties jouées, par instance, gardées dans `~/.cloverlauncher/play-history.json` : début,
//! durée, code de sortie du jeu et serveurs rejoints. La page d'une instance en tire son temps de
//! jeu, son activité et ses serveurs.
//!
//! Une partie s'enregistre à la fermeture du jeu : si le launcher est fermé avant, elle est perdue.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{instances, AppState};

/// Environ un an de jeu quotidien ; les plus anciennes parties partent en premier.
const KEPT: usize = 1000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub instance: String,
    /// Secondes depuis l'époque Unix.
    pub started: u64,
    pub seconds: u64,
    /// Code de sortie du jeu, `None` s'il a été tué.
    pub code: Option<i32>,
    /// Adresses rejointes pendant la partie, dans l'ordre.
    pub servers: Vec<String>,
}

/// Partie en cours, enregistrée à la fermeture du jeu.
#[derive(Default)]
pub struct History(Mutex<Option<Session>>);

impl History {
    pub fn begin(&self, instance: &str) {
        *self.0.lock().expect("partie") = Some(Session { instance: instance.into(), started: instances::now(), seconds: 0, code: None, servers: vec![] });
    }

    /// Le journal Quick Play est relu toutes les quelques secondes : un serveur n'est noté qu'une fois.
    pub fn join(&self, address: &str) {
        if let Some(session) = self.0.lock().expect("partie").as_mut() {
            if !session.servers.iter().any(|known| known == address) {
                session.servers.push(address.into());
            }
        }
    }

    pub fn finish(&self, root: &Path, code: Option<i32>) {
        let Some(mut session) = self.0.lock().expect("partie").take() else { return };
        session.seconds = instances::now().saturating_sub(session.started);
        session.code = code;
        let mut sessions = load(root);
        sessions.push(session);
        let excess = sessions.len().saturating_sub(KEPT);
        sessions.drain(..excess);
        if let Err(e) = save(root, &sessions) {
            eprintln!("[history] partie non enregistrée : {e}");
        }
    }
}

fn path(root: &Path) -> PathBuf {
    root.join("play-history.json")
}

fn load(root: &Path) -> Vec<Session> {
    std::fs::read(path(root)).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
}

/// Écriture atomique, comme `launcher.json`.
fn save(root: &Path, sessions: &[Session]) -> std::io::Result<()> {
    std::fs::create_dir_all(root)?;
    let temporary = path(root).with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_vec(sessions)?)?;
    std::fs::rename(temporary, path(root))
}

/// Parties de l'instance, de la plus ancienne à la plus récente.
#[tauri::command]
pub fn play_history(id: String, state: State<'_, AppState>) -> Vec<Session> {
    load(&state.root).into_iter().filter(|session| session.instance == id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_each_server_once_and_keeps_the_latest_sessions() {
        let root = std::env::temp_dir().join(format!("clover-history-{}", std::process::id()));
        let history = History::default();
        history.join("ignored.example");
        history.begin("clover");
        history.join("play.clovergames.fr");
        history.join("play.clovergames.fr");
        history.join("autre.example");
        history.finish(&root, Some(0));
        history.finish(&root, Some(1));
        let sessions = load(&root);
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].servers, ["play.clovergames.fr", "autre.example"]);
        assert_eq!(sessions[0].code, Some(0));

        save(&root, &vec![sessions[0].clone(); KEPT]).unwrap();
        history.begin("instance-0123456789abcdef0123456789abcdef");
        history.finish(&root, None);
        let sessions = load(&root);
        assert_eq!(sessions.len(), KEPT);
        assert_eq!(sessions.last().unwrap().instance, "instance-0123456789abcdef0123456789abcdef");
        let _ = std::fs::remove_dir_all(root);
    }
}
