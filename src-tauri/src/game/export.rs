//! Instance personnelle exportée en modpack Modrinth (`.mrpack`, même format qu'à l'import) : les
//! fichiers que Modrinth connaît sont listés avec leur lien de téléchargement, les autres inclus
//! dans `overrides/`.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Digest, Sha512};

use super::modrinth;
use super::{GameError, Result};

/// Seul hôte des fichiers listés : celui de Modrinth, accepté par tous les launchers.
const DOWNLOAD_HOST: &str = "https://cdn.modrinth.com/";

/// Ce que le joueur ajoute aux mods. Mêmes noms que le type `ExportParts` du front.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parts {
    /// Réglages des mods (`config/`).
    pub config: bool,
    pub resource_packs: bool,
    pub shader_packs: bool,
    /// Réglages du jeu (`options.txt`) : touches, graphismes, son.
    pub options: bool,
}

/// Instance à exporter.
pub struct Pack {
    pub name: String,
    pub minecraft: String,
    /// Clé du loader dans le format (`fabric-loader`, `forge`, `neoforge`) et sa version.
    pub loader: Option<(&'static str, String)>,
    /// Dossier de jeu de l'instance.
    pub game: PathBuf,
    /// Mods chargés au lancement.
    pub mods: Vec<PathBuf>,
}

/// Résultat affiché au joueur. Mêmes noms que le type `ExportedModpack` du front.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exported {
    pub path: String,
    /// Fichiers téléchargés depuis Modrinth à l'import.
    pub listed: usize,
    /// Fichiers inclus dans l'archive.
    pub included: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Index<'a> {
    format_version: u32,
    game: &'static str,
    version_id: &'static str,
    name: &'a str,
    summary: &'static str,
    files: Vec<IndexFile>,
    dependencies: HashMap<&'static str, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexFile {
    path: String,
    hashes: HashMap<&'static str, String>,
    downloads: Vec<String>,
    file_size: u64,
}

/// Fichier à exporter : son chemin dans l'instance (`mods/sodium.jar`) et sur le disque.
struct Entry {
    path: String,
    file: PathBuf,
    /// Archive qu'on cherche sur Modrinth (mod ou pack posé à la racine de son dossier).
    lookup: bool,
}

/// Écrit le modpack de `pack` dans `out` (remplacé s'il existe).
pub async fn export(http: &reqwest::Client, pack: Pack, parts: Parts, out: PathBuf) -> Result<Exported> {
    let (entries, hashes) = tauri::async_runtime::spawn_blocking({
        let (game, mods) = (pack.game.clone(), pack.mods.clone());
        move || -> Result<_> {
            let entries = collect(&game, &mods, parts)?;
            let hashes = entries.iter().filter(|entry| entry.lookup).map(|entry| Ok((entry.path.clone(), hash(&entry.file)?))).collect::<Result<HashMap<_, _>>>()?;
            Ok((entries, hashes))
        }
    })
    .await
    .map_err(|e| GameError::Io(std::io::Error::other(e)))??;

    let known = if hashes.is_empty() { HashMap::new() } else { modrinth::identify(http, hashes.values().map(|(_, sha512)| sha512.clone()).collect()).await? };
    let mut files = Vec::new();
    let mut included = Vec::new();
    for entry in entries {
        let listed = hashes.get(&entry.path).and_then(|(sha1, sha512)| {
            let file = known.get(sha512)?.files.iter().find(|file| file.hashes.get("sha512") == Some(sha512))?;
            file.url.starts_with(DOWNLOAD_HOST).then(|| IndexFile {
                path: entry.path.clone(),
                hashes: HashMap::from([("sha1", sha1.clone()), ("sha512", sha512.clone())]),
                downloads: vec![file.url.clone()],
                file_size: file.size,
            })
        });
        match listed {
            Some(file) => files.push(file),
            None => included.push(entry),
        }
    }
    let mut dependencies = HashMap::from([("minecraft", pack.minecraft.clone())]);
    if let Some((key, version)) = &pack.loader {
        dependencies.insert(key, version.clone());
    }
    let (listed, count) = (files.len(), included.len());
    let index = Index { format_version: 1, game: "minecraft", version_id: "1.0.0", name: &pack.name, summary: "Exporté depuis le Clover Launcher", files, dependencies };
    let index = serde_json::to_vec_pretty(&index)?;
    let target = out.clone();
    tauri::async_runtime::spawn_blocking(move || write(&target, &index, &included))
        .await
        .map_err(|e| GameError::Io(std::io::Error::other(e)))??;
    Ok(Exported { path: out.to_string_lossy().into_owned(), listed, included: count })
}

/// Mods, puis les parties choisies, telles qu'elles sont sur le disque ; packs désactivés exclus
/// (rangés dans `.disabled/`, comme les fichiers cachés).
fn collect(game: &Path, mods: &[PathBuf], parts: Parts) -> Result<Vec<Entry>> {
    let mut entries: Vec<Entry> = mods
        .iter()
        .filter_map(|file| Some(Entry { path: format!("mods/{}", file.file_name()?.to_string_lossy()), file: file.clone(), lookup: true }))
        .collect();
    let folders = [("config", parts.config), ("resourcepacks", parts.resource_packs), ("shaderpacks", parts.shader_packs)];
    for (folder, _) in folders.iter().filter(|(_, chosen)| *chosen) {
        walk(&game.join(folder), folder, &mut entries, true)?;
    }
    if parts.options && game.join("options.txt").is_file() {
        entries.push(Entry { path: "options.txt".into(), file: game.join("options.txt"), lookup: false });
    }
    Ok(entries)
}

/// Fichiers de `dir`, sous-dossiers compris ; seuls ceux de son premier niveau sont cherchés sur
/// Modrinth. Les liens symboliques sont ignorés : ils pourraient sortir du dossier de jeu.
fn walk(dir: &Path, prefix: &str, entries: &mut Vec<Entry>, top: bool) -> Result<()> {
    let Ok(list) = std::fs::read_dir(dir) else { return Ok(()) };
    for item in list {
        let item = item?;
        let name = item.file_name().to_string_lossy().into_owned();
        let kind = item.file_type()?;
        if name.starts_with('.') || kind.is_symlink() {
            continue;
        }
        let path = format!("{prefix}/{name}");
        if kind.is_dir() {
            walk(&item.path(), &path, entries, false)?;
        } else {
            entries.push(Entry { path, file: item.path(), lookup: top && prefix != "config" });
        }
    }
    Ok(())
}

/// Empreintes SHA-1 et SHA-512, en une lecture.
fn hash(path: &Path) -> Result<(String, String)> {
    let mut file = std::fs::File::open(path)?;
    let (mut sha1, mut sha512) = (Sha1::new(), Sha512::new());
    let mut buffer = vec![0; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        sha1.update(&buffer[..read]);
        sha512.update(&buffer[..read]);
    }
    let hex = |bytes: &[u8]| bytes.iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    Ok((hex(&sha1.finalize()), hex(&sha512.finalize())))
}

/// Archive écrite à côté puis renommée : jamais de modpack à moitié écrit à la place de `out`.
fn write(out: &Path, index: &[u8], included: &[Entry]) -> Result<()> {
    let partial = out.with_extension("mrpack.part");
    let result = (|| -> Result<()> {
        let mut zip = zip::ZipWriter::new(std::io::BufWriter::new(std::fs::File::create(&partial)?));
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("modrinth.index.json", options).map_err(zip_error)?;
        zip.write_all(index)?;
        for entry in included {
            let large = std::fs::metadata(&entry.file)?.len() >= u64::from(u32::MAX);
            zip.start_file(format!("overrides/{}", entry.path), options.large_file(large)).map_err(zip_error)?;
            std::io::copy(&mut std::fs::File::open(&entry.file)?, &mut zip)?;
        }
        zip.finish().map_err(zip_error)?.flush()?;
        Ok(())
    })();
    match result {
        Ok(()) => Ok(std::fs::rename(&partial, out)?),
        Err(e) => {
            let _ = std::fs::remove_file(&partial);
            Err(e)
        }
    }
}

fn zip_error(error: zip::result::ZipError) -> GameError {
    GameError::Io(std::io::Error::other(error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_the_chosen_parts_without_disabled_packs() {
        let root = std::env::temp_dir().join(format!("clover-export-{}", rand::random::<u64>()));
        let game = root.join("game");
        for dir in ["config/sodium", "resourcepacks/.disabled", "resourcepacks/Dossier", "shaderpacks"] {
            std::fs::create_dir_all(game.join(dir)).unwrap();
        }
        for file in ["config/sodium/options.json", "resourcepacks/Faithful.zip", "resourcepacks/.disabled/Ancien.zip", "resourcepacks/Dossier/pack.mcmeta", "shaderpacks/Complementary.zip", "options.txt"] {
            std::fs::write(game.join(file), file).unwrap();
        }
        let mods = vec![root.join("sodium.jar")];
        let parts = Parts { config: true, resource_packs: true, shader_packs: false, options: false };
        let mut found: Vec<(String, bool)> = collect(&game, &mods, parts).unwrap().into_iter().map(|entry| (entry.path, entry.lookup)).collect();
        found.sort();
        assert_eq!(
            found,
            [
                ("config/sodium/options.json".into(), false),
                ("mods/sodium.jar".into(), true),
                ("resourcepacks/Dossier/pack.mcmeta".into(), false),
                ("resourcepacks/Faithful.zip".into(), true),
            ]
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn writes_a_readable_pack() {
        let root = std::env::temp_dir().join(format!("clover-export-{}", rand::random::<u64>()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("options.txt"), "fov:0.5").unwrap();
        let out = root.join("Survie.mrpack");
        let index = br#"{"formatVersion":1,"game":"minecraft","versionId":"1.0.0","name":"Survie","files":[],"dependencies":{"minecraft":"1.21.1","fabric-loader":"0.16.10"}}"#;
        write(&out, index, &[Entry { path: "options.txt".into(), file: root.join("options.txt"), lookup: false }]).unwrap();
        let read = super::super::content::read_index(&out).unwrap().unwrap();
        assert_eq!(read.versions().unwrap(), ("1.21.1".into(), "0.16.10".into()));
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&out).unwrap()).unwrap();
        let mut text = String::new();
        zip.by_name("overrides/options.txt").unwrap().read_to_string(&mut text).unwrap();
        assert_eq!(text, "fov:0.5");
        assert!(!root.join("Survie.mrpack.part").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hashes_match_the_usual_digests() {
        let file = std::env::temp_dir().join(format!("clover-hash-{}", rand::random::<u64>()));
        std::fs::write(&file, "abc").unwrap();
        let (sha1, sha512) = hash(&file).unwrap();
        assert_eq!(sha1, "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert!(sha512.starts_with("ddaf35a193617aba"));
        std::fs::remove_file(file).unwrap();
    }
}
