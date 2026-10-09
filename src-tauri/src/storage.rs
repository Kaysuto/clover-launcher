//! Espace disque utilisé par le launcher, par catégorie, et nettoyage des fichiers inutiles : vieux
//! journaux, versions de Minecraft et runtimes Java qu'aucune instance n'utilise plus. Les mondes et
//! les captures d'écran ne sont jamais supprimés.

use std::collections::HashSet;
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

/// `keep` : versions des instances (identifiants de `versions/`), `None` si elles ne sont pas toutes
/// connues (manifeste illisible) : aucune version n'est alors proposée au nettoyage.
pub fn usage(root: &Path, keep: Option<&HashSet<String>>) -> Usage {
    let game = root.join("game");
    let size = |dirs: &[PathBuf]| dirs.iter().map(|dir| dir_size(dir)).sum();
    let parts = vec![
        Part { id: "assets", label: "Ressources du jeu", bytes: size(&[root.join("assets")]) },
        Part { id: "java", label: "Java", bytes: size(&[root.join("runtimes")]) },
        Part { id: "minecraft", label: "Minecraft et bibliothèques", bytes: size(&[root.join("libraries"), root.join("versions"), root.join("natives")]) },
        Part { id: "mods", label: "Mods", bytes: size(&[game.join("mods"), root.join("personal-mods")]) },
        Part { id: "worlds", label: "Mondes solo", bytes: size(&[game.join("saves")]) },
        Part { id: "screenshots", label: "Captures d'écran", bytes: size(&[game.join("screenshots")]) },
        Part { id: "instances", label: "Instances personnelles", bytes: size(&[root.join("instances")]) },
    ];
    Usage {
        parts,
        reclaimable: reclaimable(root, keep).iter().map(|(_, bytes)| bytes).sum(),
        game_dir: game.to_string_lossy().into_owned(),
    }
}

/// Supprime les vieux journaux, rapports de plantage, versions et runtimes inutilisés ; renvoie le
/// nombre d'octets libérés. À n'appeler qu'aucun jeu ouvert.
pub fn clean(root: &Path, keep: Option<&HashSet<String>>) -> u64 {
    reclaimable(root, keep)
        .into_iter()
        .filter(|(path, _)| if path.is_dir() { std::fs::remove_dir_all(path).is_ok() } else { std::fs::remove_file(path).is_ok() })
        .map(|(_, bytes)| bytes)
        .sum()
}

fn reclaimable(root: &Path, keep: Option<&HashSet<String>>) -> Vec<(PathBuf, u64)> {
    let mut found = old_files(root);
    if let Some(keep) = keep {
        found.extend(unused_versions(root, keep));
    }
    found
}

/// Dossiers de `versions/` et `natives/` hors de `keep`, et runtimes Java qu'aucune version gardée
/// ne demande (`javaVersion.component` de son JSON).
fn unused_versions(root: &Path, keep: &HashSet<String>) -> Vec<(PathBuf, u64)> {
    let subdirs = |dir: PathBuf| -> Vec<PathBuf> {
        std::fs::read_dir(dir).into_iter().flatten().flatten().filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir())).map(|entry| entry.path()).collect()
    };
    let name = |path: &Path| path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let mut runtimes = HashSet::new();
    for id in keep {
        let json = root.join("versions").join(id).join(format!("{id}.json"));
        let component = std::fs::read(json)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
            .and_then(|version| version["javaVersion"]["component"].as_str().map(str::to_owned));
        // Une version au JSON illisible pourrait demander n'importe quel runtime : on les garde tous.
        match component {
            Some(component) => runtimes.insert(component),
            None if root.join("versions").join(id).is_dir() && !id.starts_with("fabric-loader-") => return Vec::new(),
            None => false,
        };
    }
    let mut found = Vec::new();
    for dir in [root.join("versions"), root.join("natives")] {
        found.extend(subdirs(dir).into_iter().filter(|path| !keep.contains(&name(path))));
    }
    found.extend(subdirs(root.join("runtimes")).into_iter().filter(|path| !runtimes.contains(&name(path))));
    found.into_iter().map(|path| { let bytes = dir_size(&path); (path, bytes) }).collect()
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
    fn unused_versions_and_runtimes_are_reclaimable() {
        let root = std::env::temp_dir().join(format!("clover-storage-versions-{}", rand::random::<u64>()));
        let write = |path: PathBuf, text: &str| {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, text).unwrap();
        };
        write(root.join("versions/26.2/26.2.json"), r#"{"javaVersion":{"component":"java-runtime-epsilon"}}"#);
        write(root.join("versions/fabric-loader-0.19.5-26.2/fabric-loader-0.19.5-26.2.json"), "{}");
        write(root.join("versions/1.21.4/1.21.4.json"), r#"{"javaVersion":{"component":"java-runtime-delta"}}"#);
        write(root.join("versions/fabric-loaders-26.2.json"), "[]");
        write(root.join("natives/fabric-loader-0.19.5-26.2/a.dll"), "x");
        write(root.join("natives/1.21.4/a.dll"), "x");
        write(root.join("runtimes/java-runtime-epsilon/bin/java"), "x");
        write(root.join("runtimes/java-runtime-delta/bin/java"), "x");

        let keep: HashSet<String> = ["26.2", "fabric-loader-0.19.5-26.2"].map(str::to_owned).into();
        let mut found: Vec<String> = unused_versions(&root, &keep).into_iter().map(|(path, _)| path.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/")).collect();
        found.sort();
        assert_eq!(found, ["natives/1.21.4", "runtimes/java-runtime-delta", "versions/1.21.4"]);
        assert!(usage(&root, None).reclaimable == 0);

        clean(&root, Some(&keep));
        assert!(root.join("versions/26.2/26.2.json").is_file() && root.join("versions/fabric-loaders-26.2.json").is_file());
        assert!(!root.join("versions/1.21.4").exists() && !root.join("runtimes/java-runtime-delta").exists());
        assert!(root.join("runtimes/java-runtime-epsilon/bin/java").is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn measures_nested_directories() {
        let root = std::env::temp_dir().join(format!("clover-storage-{}", std::process::id()));
        std::fs::create_dir_all(root.join("assets").join("objects")).unwrap();
        std::fs::write(root.join("assets").join("objects").join("a"), [0u8; 100]).unwrap();
        std::fs::write(root.join("assets").join("b"), [0u8; 50]).unwrap();
        let usage = usage(&root, None);
        assert_eq!(usage.parts.iter().find(|part| part.id == "assets").unwrap().bytes, 150);
        let _ = std::fs::remove_dir_all(root);
    }
}
