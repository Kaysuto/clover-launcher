//! Espace disque utilisé par le launcher, par catégorie, et nettoyage des fichiers inutiles.
//! Les mondes et les captures d'écran ne sont jamais supprimés.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::Serialize;

/// Journaux et rapports de plantage plus anciens que ça : supprimables.
const OLD_AFTER: Duration = Duration::from_secs(14 * 24 * 3600);

#[derive(Debug, Serialize)]
pub struct Part {
    pub id: &'static str,
    pub label: &'static str,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct Usage {
    pub parts: Vec<Part>,
    pub reclaimable: u64,
    pub game_dir: String,
}

pub fn usage(root: &Path) -> Usage {
    let game = root.join("game");
    let size = |dirs: &[PathBuf]| dirs.iter().map(|dir| dir_size(dir)).sum();
    let parts = vec![
        Part { id: "assets", label: "Ressources du jeu", bytes: size(&[root.join("assets")]) },
        Part { id: "java", label: "Java", bytes: size(&[root.join("runtimes")]) },
        Part { id: "minecraft", label: "Minecraft et bibliothèques", bytes: size(&[root.join("libraries"), root.join("versions"), root.join("natives")]) },
        Part { id: "mods", label: "Mods", bytes: size(&[game.join("mods"), root.join("personal-mods")]) },
        Part { id: "worlds", label: "Mondes solo", bytes: size(&[game.join("saves")]) },
        Part { id: "screenshots", label: "Captures d'écran", bytes: size(&[game.join("screenshots")]) },
    ];
    Usage {
        parts,
        reclaimable: old_files(root).iter().map(|(_, bytes)| bytes).sum(),
        game_dir: game.to_string_lossy().into_owned(),
    }
}

/// Supprime les vieux journaux et rapports de plantage ; renvoie le nombre d'octets libérés.
pub fn clean(root: &Path) -> u64 {
    old_files(root)
        .into_iter()
        .filter(|(path, _)| std::fs::remove_file(path).is_ok())
        .map(|(_, bytes)| bytes)
        .sum()
}

fn old_files(root: &Path) -> Vec<(PathBuf, u64)> {
    let now = SystemTime::now();
    let mut found = Vec::new();
    for dir in [root.join("logs"), root.join("game").join("logs"), root.join("game").join("crash-reports")] {
        let Ok(entries) = std::fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let Ok(metadata) = entry.metadata() else { continue };
            // `latest.log` est le journal de la partie en cours : jamais supprimé.
            let latest = entry.file_name() == "latest.log";
            let old = metadata.modified().ok().and_then(|modified| now.duration_since(modified).ok()).is_some_and(|age| age > OLD_AFTER);
            if metadata.is_file() && old && !latest {
                found.push((entry.path(), metadata.len()));
            }
        }
    }
    found
}

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|entry| match entry.file_type() {
            Ok(kind) if kind.is_dir() => dir_size(&entry.path()),
            Ok(kind) if kind.is_file() => entry.metadata().map_or(0, |metadata| metadata.len()),
            _ => 0,
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measures_nested_directories() {
        let root = std::env::temp_dir().join(format!("clover-storage-{}", std::process::id()));
        std::fs::create_dir_all(root.join("assets").join("objects")).unwrap();
        std::fs::write(root.join("assets").join("objects").join("a"), [0u8; 100]).unwrap();
        std::fs::write(root.join("assets").join("b"), [0u8; 50]).unwrap();
        let usage = usage(&root);
        assert_eq!(usage.parts.iter().find(|part| part.id == "assets").unwrap().bytes, 150);
        let _ = std::fs::remove_dir_all(root);
    }
}
