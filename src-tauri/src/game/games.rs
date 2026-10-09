//! Parties lancées par ce launcher, une par instance : console, processus et demande de
//! fermeture. Plusieurs instances jouent en même temps tant qu'elles n'ont pas le même dossier de
//! jeu : la seconde réécrirait `mods/` et `options.txt` sous les pieds de la première.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tokio::sync::Notify;

use super::console::{Console, Snapshot};

#[derive(Default)]
pub struct Game {
    pub console: Console,
    /// Processus et dossier de jeu tant que la partie dure.
    process: Mutex<Option<(Option<u32>, PathBuf)>>,
    kill: Notify,
}

impl Game {
    pub fn start(&self, pid: Option<u32>, game_dir: PathBuf) {
        self.console.start();
        *self.process.lock().expect("partie") = Some((pid, game_dir));
    }

    pub fn finish(&self, code: Option<i32>) {
        *self.process.lock().expect("partie") = None;
        self.console.finish(code);
    }

    pub fn running(&self) -> bool {
        self.process.lock().expect("partie").is_some()
    }

    pub fn pid(&self) -> Option<u32> {
        self.process.lock().expect("partie").as_ref().and_then(|(pid, _)| *pid)
    }

    fn game_dir(&self) -> Option<PathBuf> {
        self.process.lock().expect("partie").as_ref().map(|(_, dir)| dir.clone())
    }

    /// « Forcer la fermeture » : le fil qui attend le jeu le tue.
    pub fn kill(&self) {
        self.kill.notify_one();
    }

    pub async fn killed(&self) {
        self.kill.notified().await;
    }
}

#[derive(Default)]
pub struct Games(Mutex<HashMap<String, Arc<Game>>>);

impl Games {
    /// Partie de l'instance, créée vide au besoin.
    pub fn get(&self, instance: &str) -> Arc<Game> {
        self.0.lock().expect("parties").entry(instance.to_owned()).or_default().clone()
    }

    pub fn find(&self, instance: &str) -> Option<Arc<Game>> {
        self.0.lock().expect("parties").get(instance).cloned()
    }

    /// Console reprise d'une partie laissée par un launcher fermé depuis.
    pub fn resume(&self, instance: &str, console: Console) {
        self.0.lock().expect("parties").insert(instance.to_owned(), Arc::new(Game { console, ..Game::default() }));
    }

    /// Instances dont le jeu tourne, triées.
    pub fn running(&self) -> Vec<String> {
        let mut running: Vec<_> = self.0.lock().expect("parties").iter().filter(|(_, game)| game.running()).map(|(id, _)| id.clone()).collect();
        running.sort();
        running
    }

    pub fn any_running(&self) -> bool {
        self.0.lock().expect("parties").values().any(|game| game.running())
    }

    /// Instance dont le jeu tourne dans `game_dir`.
    pub fn using(&self, game_dir: &Path) -> Option<String> {
        self.0.lock().expect("parties").iter().find(|(_, game)| game.game_dir().is_some_and(|dir| same_dir(&dir, game_dir))).map(|(id, _)| id.clone())
    }

    pub fn snapshot(&self, instance: &str, after: u64) -> Snapshot {
        self.find(instance).map_or_else(Snapshot::empty, |game| game.console.since(after))
    }
}

/// Même dossier, sans tenir compte de la casse ni du séparateur sous Windows.
pub fn same_dir(a: &Path, b: &Path) -> bool {
    let normal = |path: &Path| {
        let text = path.to_string_lossy().trim_end_matches(['/', '\\']).to_owned();
        if cfg!(windows) { text.replace('/', "\\").to_lowercase() } else { text }
    };
    normal(a) == normal(b)
}

/// Fin d'une partie, pour l'interface.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exited {
    pub instance: String,
    pub code: Option<i32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_instance_has_its_game_and_a_game_dir_is_used_once() {
        let games = Games::default();
        let shared = PathBuf::from("/clover/game");
        games.get("clover").start(Some(1), shared.clone());
        games.get("fabric").start(Some(2), PathBuf::from("/clover/instances/fabric/game"));
        assert_eq!(games.running(), ["clover", "fabric"]);
        assert_eq!(games.using(Path::new("/clover/game/")).as_deref(), Some("clover"));
        assert_eq!(games.using(Path::new("/clover/other")), None);

        games.get("clover").finish(Some(0));
        assert_eq!(games.running(), ["fabric"]);
        assert_eq!(games.using(&shared), None);
        assert!(!games.snapshot("clover", 0).running);
        assert_eq!(games.snapshot("clover", 0).entries.len(), 1);
        assert_eq!(games.snapshot("inconnue", 0).entries.len(), 0);
        assert!(games.any_running());
        games.get("fabric").finish(None);
        assert!(!games.any_running());
    }
}
