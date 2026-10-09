//! Parties jouées, par instance, gardées dans `~/.cloverlauncher/play-history.json` : début,
//! durée, code de sortie du jeu et serveurs rejoints. La page d'une instance en tire son temps de
//! jeu, son activité et ses serveurs.
//!
//! Les parties en cours (une par instance ouverte) sont écrites dès leur lancement dans
//! `play-session.json` : si le launcher se ferme ou se met à jour pendant la partie, il les
//! retrouve au démarrage suivant et clôt chacune quand son jeu s'arrête, d'après le journal du jeu
//! (`logs/latest.log`).

use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{instances, AppState};

/// Environ un an de jeu quotidien ; les plus anciennes parties partent en premier.
const KEPT: usize = 1000;
/// Fin du journal du jeu relue pour savoir s'il s'est fermé normalement.
const LOG_TAIL: u64 = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub instance: String,
    /// Secondes depuis l'époque Unix.
    pub started: u64,
    pub seconds: u64,
    /// Code de sortie du jeu, `None` s'il a été tué ou s'il est inconnu.
    pub code: Option<i32>,
    /// Adresses rejointes pendant la partie, dans l'ordre.
    pub servers: Vec<String>,
}

/// Parties en cours, aussi écrites sur disque pour survivre à un redémarrage du launcher. Celles
/// d'un launcher fermé depuis y restent jusqu'à leur clôture (`recover`).
#[derive(Default)]
pub struct History(Mutex<Vec<Session>>);

impl History {
    /// Reprend les parties laissées par un launcher fermé depuis.
    pub fn resume(root: &Path) -> Self {
        Self(Mutex::new(pending(root)))
    }

    /// Juste avant de lancer le jeu de l'instance.
    pub fn begin(&self, root: &Path, instance: &str) {
        let mut sessions = self.0.lock().expect("parties");
        sessions.push(Session { instance: instance.into(), started: instances::now(), seconds: 0, code: None, servers: vec![] });
        write_pending(root, &sessions);
    }

    /// Le lancement a échoué : aucune partie n'a eu lieu.
    pub fn cancel(&self, root: &Path, instance: &str) {
        let mut sessions = self.0.lock().expect("parties");
        if take_latest(&mut sessions, instance).is_some() {
            write_pending(root, &sessions);
        }
    }

    /// Le journal Quick Play est relu toutes les quelques secondes : un serveur n'est noté qu'une fois.
    pub fn join(&self, root: &Path, instance: &str, address: &str) {
        let mut sessions = self.0.lock().expect("parties");
        let Some(session) = sessions.iter_mut().rev().find(|session| session.instance == instance) else { return };
        if !session.servers.iter().any(|known| known == address) {
            session.servers.push(address.into());
            write_pending(root, &sessions);
        }
    }

    /// Le jeu de l'instance, lancé par ce launcher, vient de se fermer.
    pub fn finish(&self, root: &Path, instance: &str, code: Option<i32>) {
        let mut sessions = self.0.lock().expect("parties");
        let Some(mut session) = take_latest(&mut sessions, instance) else { return };
        write_pending(root, &sessions);
        drop(sessions);
        session.seconds = instances::now().saturating_sub(session.started);
        session.code = code;
        record(root, session);
    }

    /// Clôt la partie `session`, laissée par un launcher fermé, dont le jeu s'est arrêté sans
    /// celui-ci : fin et code lus dans le journal du jeu (`game_dir/logs/latest.log`), dernier
    /// serveur dans le journal Quick Play.
    pub fn recover(&self, root: &Path, session: Session, game_dir: &Path, last_server: Option<String>) {
        let mut sessions = self.0.lock().expect("parties");
        // Les parties commencées entre-temps gardent leur note.
        if let Some(index) = sessions.iter().position(|known| known.instance == session.instance && known.started == session.started) {
            sessions.remove(index);
            write_pending(root, &sessions);
        }
        drop(sessions);
        recover(root, session, game_dir, last_server);
    }
}

/// Partie la plus récente de l'instance : celle lancée par ce launcher, après une éventuelle
/// partie laissée par un launcher fermé.
fn take_latest(sessions: &mut Vec<Session>, instance: &str) -> Option<Session> {
    let index = sessions.iter().rposition(|session| session.instance == instance)?;
    Some(sessions.remove(index))
}

/// Parties lancées par un launcher qui s'est fermé depuis. Lit aussi l'ancien format (une seule
/// partie).
pub fn pending(root: &Path) -> Vec<Session> {
    let Ok(bytes) = std::fs::read(pending_path(root)) else { return vec![] };
    serde_json::from_slice(&bytes).or_else(|_| serde_json::from_slice(&bytes).map(|session: Session| vec![session])).unwrap_or_default()
}

fn recover(root: &Path, mut session: Session, game_dir: &Path, last_server: Option<String>) {
    let Some((ended, code)) = ending(&game_dir.join("logs").join("latest.log"), session.started) else {
        eprintln!("[history] partie interrompue sans journal du jeu : non comptée");
        return;
    };
    session.seconds = ended.saturating_sub(session.started);
    session.code = code;
    if let Some(address) = last_server.filter(|address| !session.servers.contains(address)) {
        session.servers.push(address);
    }
    record(root, session);
}

/// Dernière écriture du journal (fin de la partie) et code : 0 si le jeu a noté son arrêt normal
/// (« Stopping! »), inconnu sinon. `None` si le journal est plus ancien que la partie.
fn ending(log: &Path, started: u64) -> Option<(u64, Option<i32>)> {
    let mut file = std::fs::File::open(log).ok()?;
    let metadata = file.metadata().ok()?;
    let ended = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs();
    if ended < started {
        return None;
    }
    file.seek(SeekFrom::Start(metadata.len().saturating_sub(LOG_TAIL))).ok()?;
    let mut tail = Vec::new();
    file.read_to_end(&mut tail).ok()?;
    let stopped = String::from_utf8_lossy(&tail).contains("Stopping!");
    Some((ended, stopped.then_some(0)))
}

fn record(root: &Path, session: Session) {
    let mut sessions = load(root);
    sessions.push(session);
    let excess = sessions.len().saturating_sub(KEPT);
    sessions.drain(..excess);
    if let Err(e) = save(root, &sessions) {
        eprintln!("[history] partie non enregistrée : {e}");
    }
}

fn path(root: &Path) -> PathBuf {
    root.join("play-history.json")
}

fn pending_path(root: &Path) -> PathBuf {
    root.join("play-session.json")
}

fn write_pending(root: &Path, sessions: &[Session]) {
    let result = if sessions.is_empty() {
        match std::fs::remove_file(pending_path(root)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    } else {
        std::fs::create_dir_all(root).and_then(|()| std::fs::write(pending_path(root), serde_json::to_vec(sessions).expect("parties sérialisables")))
    };
    if let Err(e) = result {
        eprintln!("[history] partie en cours non notée : {e}");
    }
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

    fn temp() -> PathBuf {
        let root = std::env::temp_dir().join(format!("clover-history-{}", rand::random::<u64>()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn records_each_server_once_and_keeps_the_latest_sessions() {
        let root = temp();
        let history = History::default();
        history.join(&root, "clover", "ignored.example");
        history.begin(&root, "clover");
        assert_eq!(pending(&root)[0].instance, "clover");
        history.join(&root, "clover", "play.clovergames.fr");
        history.join(&root, "clover", "play.clovergames.fr");
        history.join(&root, "clover", "autre.example");
        assert_eq!(pending(&root)[0].servers.len(), 2);
        history.finish(&root, "clover", Some(0));
        history.finish(&root, "clover", Some(1));
        assert!(pending(&root).is_empty());
        let sessions = load(&root);
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].servers, ["play.clovergames.fr", "autre.example"]);
        assert_eq!(sessions[0].code, Some(0));

        save(&root, &vec![sessions[0].clone(); KEPT]).unwrap();
        history.begin(&root, "instance-0123456789abcdef0123456789abcdef");
        history.finish(&root, "instance-0123456789abcdef0123456789abcdef", None);
        let sessions = load(&root);
        assert_eq!(sessions.len(), KEPT);
        assert_eq!(sessions.last().unwrap().instance, "instance-0123456789abcdef0123456789abcdef");

        history.begin(&root, "clover");
        history.cancel(&root, "clover");
        assert!(pending(&root).is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn several_instances_play_at_once() {
        let root = temp();
        let history = History::default();
        history.begin(&root, "clover");
        history.begin(&root, "fabric");
        history.join(&root, "fabric", "mc.hypixel.net");
        history.join(&root, "clover", "play.clovergames.fr");
        assert_eq!(pending(&root).len(), 2);
        history.finish(&root, "fabric", Some(0));
        assert_eq!(pending(&root).iter().map(|session| session.instance.as_str()).collect::<Vec<_>>(), ["clover"]);
        history.finish(&root, "clover", Some(1));
        assert!(pending(&root).is_empty());
        let sessions = load(&root);
        assert_eq!(sessions.iter().map(|session| (session.instance.as_str(), session.servers[0].as_str())).collect::<Vec<_>>(), [("fabric", "mc.hypixel.net"), ("clover", "play.clovergames.fr")]);

        // Ancien format : une seule partie, lue comme une liste.
        std::fs::write(pending_path(&root), serde_json::to_vec(&sessions[0]).unwrap()).unwrap();
        assert_eq!(History::resume(&root).0.lock().unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_session_left_by_a_closed_launcher_is_recovered_from_the_game_log() {
        let root = temp();
        let game = root.join("game");
        let session = Session { instance: "clover".into(), started: instances::now() - 600, seconds: 0, code: None, servers: vec![] };
        write_pending(&root, std::slice::from_ref(&session));
        std::fs::create_dir_all(game.join("logs")).unwrap();
        std::fs::write(game.join("logs/latest.log"), "[12:00:00] [Render thread/INFO]: Stopping!\n").unwrap();

        // Relancée depuis : la nouvelle partie de la même instance garde sa note.
        let history = History::resume(&root);
        history.begin(&root, "clover");
        history.recover(&root, session, &game, Some("mc.hypixel.net".into()));
        assert_eq!(pending(&root).len(), 1);
        assert!(pending(&root)[0].started >= instances::now() - 5);
        let sessions = load(&root);
        assert_eq!(sessions.len(), 1);
        assert!((600..=605).contains(&sessions[0].seconds), "{}", sessions[0].seconds);
        assert_eq!(sessions[0].code, Some(0));
        assert_eq!(sessions[0].servers, ["mc.hypixel.net"]);
        history.cancel(&root, "clover");
        assert!(pending(&root).is_empty());

        // Journal plus ancien que la partie : rien n'est compté.
        let stale = Session { instance: "clover".into(), started: instances::now() + 3600, seconds: 0, code: None, servers: vec![] };
        history.recover(&root, stale, &game, None);
        assert_eq!(load(&root).len(), 1);
        let _ = std::fs::remove_dir_all(root);
    }
}
