//! Réglages de départ du jeu et des mods selon le niveau de la machine, servis par le
//! manifeste signé pour être ajustés sans republier le launcher.
//!
//! Règle : un fichier n'est écrit que s'il n'existe pas ; un réglage du joueur n'est jamais écrasé,
//! sauf par « Rétablir les réglages recommandés », qui garde l'ancien fichier en `.bak`.

use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::Result;

/// Préréglage d'un niveau : lignes de `options.txt` et fichiers de `config/`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Preset {
    /// Clé → valeur d'`options.txt`, au format du jeu (`renderDistance` → `12`, `lang` → `fr_fr`).
    #[serde(default)]
    pub options: BTreeMap<String, String>,
    /// Chemin relatif au dossier du jeu (`config/sodium-options.json`) → contenu complet.
    #[serde(default)]
    pub files: BTreeMap<String, String>,
}

/// Chemin d'un fichier de préréglage : relatif, sous `config/`, sans `..`.
fn target(game: &Path, relative: &str) -> Option<PathBuf> {
    let path = Path::new(relative);
    let safe = path.starts_with("config") && path.components().all(|component| matches!(component, Component::Normal(_)));
    safe.then(|| game.join(path))
}

/// `version` d'`options.txt` : numéro de données du client (`world_version` de son `version.json`).
/// Sans lui, Minecraft croirait le fichier très ancien et le convertirait.
pub fn data_version(client_jar: &Path) -> Option<u32> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(client_jar).ok()?).ok()?;
    let mut text = String::new();
    archive.by_name("version.json").ok()?.read_to_string(&mut text).ok()?;
    serde_json::from_str::<serde_json::Value>(&text).ok()?["world_version"].as_u64().and_then(|version| u32::try_from(version).ok())
}

fn options_text(preset: &Preset, data_version: u32) -> String {
    let mut text = format!("version:{data_version}\n");
    for (key, value) in preset.options.iter().filter(|(key, _)| key.as_str() != "version") {
        text.push_str(&format!("{key}:{value}\n"));
    }
    text
}

/// Écrit `path` ; s'il existe et que `replace`, l'ancien part en `<fichier>.bak`. Renvoie vrai si
/// le fichier a été écrit.
fn write(path: &Path, contents: &str, replace: bool) -> Result<bool> {
    if path.exists() {
        if !replace {
            return Ok(false);
        }
        let mut backup = path.as_os_str().to_owned();
        backup.push(".bak");
        std::fs::copy(path, backup)?;
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, contents)?;
    Ok(true)
}

/// Applique `preset` au dossier `game` : fichiers absents seulement, ou tous si `replace`.
/// `options.txt` demande `data_version` ; sans lui, il est laissé au jeu. Renvoie les fichiers écrits.
pub fn apply(game: &Path, preset: &Preset, data_version: Option<u32>, replace: bool) -> Result<Vec<String>> {
    let mut written = Vec::new();
    if let (Some(version), false) = (data_version, preset.options.is_empty()) {
        if write(&game.join("options.txt"), &options_text(preset, version), replace)? {
            written.push("options.txt".to_owned());
        }
    }
    for (relative, contents) in &preset.files {
        let Some(path) = target(game, relative) else {
            eprintln!("[préréglages] chemin refusé : {relative}");
            continue;
        };
        if write(&path, contents, replace)? {
            written.push(relative.clone());
        }
    }
    Ok(written)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "client 26.2 installé sur le poste"]
    fn reads_the_data_version_of_the_installed_client() {
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap();
        let jar = Path::new(&home).join(".cloverlauncher/versions/26.2/26.2.jar");
        assert_eq!(data_version(&jar), Some(4903));
    }

    #[test]
    fn writes_missing_files_only_and_resets_with_a_backup() {
        let game = std::env::temp_dir().join(format!("clover-presets-{}", rand::random::<u64>()));
        let preset = Preset {
            options: [("renderDistance", "12"), ("lang", "fr_fr"), ("version", "1")].map(|(k, v)| (k.to_owned(), v.to_owned())).into(),
            files: [("config/dynamic_fps.json", "{}"), ("../evil.txt", "x"), ("config/../../evil.txt", "x")].map(|(k, v)| (k.to_owned(), v.to_owned())).into(),
        };
        assert_eq!(apply(&game, &preset, Some(4903), false).unwrap(), ["options.txt", "config/dynamic_fps.json"]);
        assert_eq!(std::fs::read_to_string(game.join("options.txt")).unwrap(), "version:4903\nlang:fr_fr\nrenderDistance:12\n");
        assert!(!game.parent().unwrap().join("evil.txt").exists());

        // Réglage modifié par le joueur : jamais écrasé, sauf « Rétablir ».
        std::fs::write(game.join("options.txt"), "version:4903\nrenderDistance:32\n").unwrap();
        assert!(apply(&game, &preset, Some(4903), false).unwrap().is_empty());
        assert_eq!(apply(&game, &preset, Some(4903), true).unwrap().len(), 2);
        assert_eq!(std::fs::read_to_string(game.join("options.txt.bak")).unwrap(), "version:4903\nrenderDistance:32\n");

        // Sans numéro de données, options.txt est laissé au jeu.
        let fresh = game.join("fresh");
        assert_eq!(apply(&fresh, &preset, None, false).unwrap(), ["config/dynamic_fps.json"]);
        std::fs::remove_dir_all(game).unwrap();
    }
}
