//! Mise à jour du launcher par l'updater Tauri : `latest.json` sur `cdn.clovergames.fr`, publié par
//! la CI avec les paquets. Le plugin refuse un paquet qui n'est pas signé par la clé de Clover (clé
//! publique dans `tauri.conf.json`, clé privée dans `Sécurités/` et dans les secrets de la CI).

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

/// Mise à jour trouvée par la dernière vérification, en attente d'installation.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    done: u64,
    total: Option<u64>,
}

/// Lancé depuis le paquet MSIX du Microsoft Store : le Store installe les mises à jour, l'updater
/// ne doit rien télécharger ni lancer d'installeur NSIS.
pub fn store_package() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::APPMODEL_ERROR_NO_PACKAGE;
        use windows_sys::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
        let mut length = 0;
        // Sans tampon : ERROR_INSUFFICIENT_BUFFER dans un paquet, APPMODEL_ERROR_NO_PACKAGE sinon.
        unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) != APPMODEL_ERROR_NO_PACKAGE }
    }
    #[cfg(not(windows))]
    false
}

pub async fn check(app: &AppHandle, pending: &PendingUpdate) -> Result<Option<UpdateInfo>, String> {
    if store_package() {
        return Ok(None);
    }
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("Impossible de vérifier les mises à jour du launcher : {e}"))?;
    let info = update.as_ref().map(|update| UpdateInfo { version: update.version.clone() });
    *pending.0.lock().await = update;
    Ok(info)
}

/// Télécharge le paquet (avancement dans l'évènement `update-progress`), l'installe et relance le
/// launcher. Sous Windows, l'installeur ferme le launcher et le relance lui-même.
pub async fn install(app: &AppHandle, pending: &PendingUpdate) -> Result<(), String> {
    if store_package() {
        return Err("Les mises à jour passent par le Microsoft Store.".into());
    }
    // Gardée en attente : après un échec, « Installer » peut réessayer.
    let update = pending.0.lock().await.clone().ok_or("Aucune mise à jour à installer.")?;
    let mut done = 0;
    let bytes = update
        .download(
            |chunk, total| {
                done += chunk as u64;
                let _ = app.emit("update-progress", DownloadProgress { done, total });
            },
            || {},
        )
        .await
        .map_err(|e| format!("Téléchargement de la mise à jour impossible : {e}"))?;
    update.install(bytes).map_err(|e| format!("Installation de la mise à jour impossible : {e}"))?;
    app.restart()
}
