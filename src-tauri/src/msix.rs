//! Paquet MSIX du Microsoft Store (`scripts/msix/AppxManifest.xml`). Le même exécutable sert au
//! NSIS du site : ce qui diffère dans le paquet se décide ici, à l'exécution.
//!
//! - Le Store installe les mises à jour : l'updater ne doit rien télécharger (`update.rs`).
//! - Le registre du paquet est virtualisé : la clé `Run` du plugin autostart n'aurait aucun effet,
//!   le démarrage avec l'ordinateur passe par la tâche de démarrage déclarée dans le manifeste.

/// `TaskId` de `desktop:StartupTask` dans le manifeste.
#[cfg(windows)]
const STARTUP_TASK: &str = "CloverLauncherStartup";

/// Lancé depuis le paquet du Microsoft Store.
pub fn packaged() -> bool {
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

/// Lancé par la tâche de démarrage du paquet : l'équivalent de `--minimized` hors paquet.
pub fn started_by_startup_task() -> bool {
    #[cfg(windows)]
    {
        use windows::ApplicationModel::Activation::ActivationKind;
        use windows::ApplicationModel::AppInstance;
        packaged()
            && AppInstance::GetActivatedEventArgs()
                .and_then(|args| args.Kind())
                .is_ok_and(|kind| kind == ActivationKind::StartupTask)
    }
    #[cfg(not(windows))]
    false
}

/// Allume ou coupe la tâche de démarrage. Bloquant (appels WinRT attendus sur place). Windows refuse
/// de la rallumer si le joueur l'a coupée lui-même dans le Gestionnaire des tâches ou les Paramètres.
pub fn set_start_with_system(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::ApplicationModel::{StartupTask, StartupTaskState};
        let failed = |e: windows::core::Error| format!("Démarrage avec l'ordinateur impossible : {}", e.message());
        let task = StartupTask::GetAsync(&HSTRING::from(STARTUP_TASK)).and_then(|operation| operation.get()).map_err(failed)?;
        if !enabled {
            return task.Disable().map_err(failed);
        }
        let state = task.RequestEnableAsync().and_then(|operation| operation.get()).map_err(failed)?;
        if state == StartupTaskState::Enabled || state == StartupTaskState::EnabledByPolicy {
            Ok(())
        } else if state == StartupTaskState::DisabledByUser {
            Err("Windows a coupé le démarrage de Clover Launcher : rallume-le dans Paramètres › Applications › Démarrage.".into())
        } else {
            Err("Le démarrage avec l'ordinateur est bloqué par une stratégie de Windows.".into())
        }
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err("Le paquet du Microsoft Store n'existe que sous Windows.".into())
    }
}
