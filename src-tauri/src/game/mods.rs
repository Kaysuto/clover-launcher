//! Synchronisation du dossier `mods/` avec la sélection du joueur.
//!
//! Le dossier appartient au launcher : tout `.jar` qui ne correspond pas à un mod sélectionné
//! est retiré, pour qu'un mod désactivé ou remplacé par une nouvelle version ne reste pas chargé.
//! Les mods du joueur (« Mes mods ») y sont recopiés à chaque lancement.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::download::{download_all, Checksum, Download};
use super::manifest::Manifest;
use super::personal;
use super::{GameError, Result};

/// Instances sans catalogue Clover : remplacer uniquement les jars dans le dossier géré.
pub async fn sync_personal(mods_dir: &Path, personal: &[PathBuf]) -> Result<()> {
    tokio::fs::create_dir_all(mods_dir).await?;
    let mut entries = tokio::fs::read_dir(mods_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        if entry.path().extension().is_some_and(|ext| ext.eq_ignore_ascii_case("jar")) { tokio::fs::remove_file(entry.path()).await?; }
    }
    for path in personal {
        if let Some(name) = path.file_name() { tokio::fs::copy(path, mods_dir.join(name)).await?; }
    }
    Ok(())
}

pub async fn sync(
    http: &reqwest::Client,
    mods_dir: &Path,
    manifest: &Manifest,
    enabled: &HashSet<String>,
    personal: &[PathBuf],
    on_progress: &(dyn Fn(usize, usize) + Sync),
) -> Result<()> {
    tokio::fs::create_dir_all(mods_dir).await?;
    let files: Vec<_> = manifest.mods_to_install(enabled).into_iter().filter_map(|m| m.file.as_ref()).collect();
    // Défense en profondeur : même signé, un nom de fichier ne doit pas sortir de `mods/`.
    if files.iter().any(|file| file.filename.contains(['/', '\\']) || file.filename.starts_with('.')) {
        return Err(GameError::InvalidVersion("nom de fichier de mod invalide".into()));
    }
    let catalogue: HashSet<&str> = files.iter().map(|file| file.filename.as_str()).collect();

    let mut entries = tokio::fs::read_dir(mods_dir).await?;
    while let Some(entry) = entries.next_entry().await? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(".jar") && !catalogue.contains(name.as_str()) {
            tokio::fs::remove_file(entry.path()).await?;
        }
    }

    let downloads = files
        .iter()
        .map(|file| Download {
            url: file.url.clone(),
            path: mods_dir.join(&file.filename),
            checksum: Some(Checksum::Sha512(file.sha512.clone())),
            size: Some(file.size),
            executable: false,
        })
        .collect();
    download_all(http, downloads, on_progress).await?;

    // Un mod du joueur déjà fourni par le catalogue ferait planter Fabric (« duplicate mod ») :
    // la version du catalogue l'emporte.
    let catalogue_ids: HashSet<String> = catalogue.iter().filter_map(|name| personal::fabric_id(&mods_dir.join(name))).collect();
    for path in personal {
        let Some(name) = path.file_name() else { continue };
        let duplicate = catalogue.contains(name.to_string_lossy().as_ref())
            || personal::fabric_id(path).is_some_and(|id| catalogue_ids.contains(&id));
        if duplicate {
            eprintln!("[mods] {} ignoré : déjà fourni par le catalogue Clover", name.to_string_lossy());
            continue;
        }
        tokio::fs::copy(path, mods_dir.join(name)).await?;
    }
    Ok(())
}

#[cfg(test)]
mod instance_tests {
    use super::*;
    #[tokio::test]
    async fn switching_shared_instances_replaces_only_active_jars() {
        let root = std::env::temp_dir().join(format!("clover-mod-switch-{}", rand::random::<u64>()));
        let active = root.join("game/mods");
        let source = root.join("personal-mods");
        std::fs::create_dir_all(&active).unwrap();
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(active.join("clover.jar"), b"catalogue").unwrap();
        std::fs::write(active.join("note.txt"), b"keep").unwrap();
        std::fs::write(source.join("fabric.jar"), b"personal").unwrap();
        sync_personal(&active, &[source.join("fabric.jar")]).await.unwrap();
        assert!(!active.join("clover.jar").exists());
        assert!(active.join("fabric.jar").exists());
        sync_personal(&active, &[]).await.unwrap();
        assert!(!active.join("fabric.jar").exists());
        assert!(source.join("fabric.jar").exists());
        assert!(active.join("note.txt").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
