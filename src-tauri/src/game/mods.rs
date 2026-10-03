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
