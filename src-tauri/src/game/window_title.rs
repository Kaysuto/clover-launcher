//! Titre natif de la fenêtre Minecraft sous Windows, sans modifier le client ni ajouter de mod.
//! Le même exécutable tourne en mode interne jusqu'à la fermeture du jeu : le titre reste suivi
//! même avec le réglage « Fermer le launcher ». Ce mode n'initialise ni Tauri ni les comptes.

pub fn start(pid: u32, minecraft: &str) {
    #[cfg(windows)]
    if let Err(error) = native::start(pid, minecraft) {
        // Le titre est cosmétique : une erreur Windows ne doit pas empêcher de jouer.
        eprintln!("[game] Titre de la fenêtre non personnalisé : {error}");
    }
    #[cfg(not(windows))]
    let _ = (pid, minecraft);
}

pub fn run_helper() -> bool {
    #[cfg(windows)]
    return native::run_helper();
    #[cfg(not(windows))]
    false
}

#[cfg(windows)]
mod native {
    use std::io;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, HANDLE, HWND, LPARAM, WAIT_TIMEOUT};
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, WaitForSingleObject,
        CREATE_NO_WINDOW, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindowTextW, GetWindowThreadProcessId, SendMessageTimeoutW,
        SMTO_ABORTIFHUNG, WM_SETTEXT,
    };

    const HELPER_ARG: &str = "--minecraft-window-title";

    struct Process(HANDLE);

    impl Process {
        fn open(pid: u32) -> io::Result<Self> {
            // Droits de lecture et d'attente seulement ; aucun droit d'injection ou de terminaison.
            let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE, 0, pid) };
            if handle.is_null() { Err(io::Error::last_os_error()) } else { Ok(Self(handle)) }
        }

        fn created(&self) -> io::Result<u64> {
            let mut times = [FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 }; 4];
            let [created, exited, kernel, user] = &mut times;
            if unsafe { GetProcessTimes(self.0, created, exited, kernel, user) } == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok((u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime))
        }

        fn is_java(&self) -> bool {
            let mut name = vec![0u16; 32768];
            let mut length = name.len() as u32;
            if unsafe { QueryFullProcessImageNameW(self.0, 0, name.as_mut_ptr(), &mut length) } == 0 {
                return false;
            }
            let name = String::from_utf16_lossy(&name[..length as usize]);
            std::path::Path::new(&name).file_name().is_some_and(|name| {
                matches!(name.to_string_lossy().to_ascii_lowercase().as_str(), "java.exe" | "javaw.exe")
            })
        }
    }

    impl Drop for Process {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0); }
        }
    }

    pub(super) fn start(pid: u32, minecraft: &str) -> io::Result<()> {
        let process = Process::open(pid)?;
        Command::new(std::env::current_exe()?)
            .args([HELPER_ARG, &pid.to_string(), &process.created()?.to_string(), minecraft])
            .creation_flags(CREATE_NO_WINDOW)
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .spawn()?;
        Ok(())
    }

    pub(super) fn run_helper() -> bool {
        let mut args = std::env::args().skip(1);
        if args.next().as_deref() != Some(HELPER_ARG) {
            return false;
        }
        if let (Some(pid), Some(created), Some(minecraft), None) = (args.next(), args.next(), args.next(), args.next()) {
            if let (Ok(pid), Ok(created)) = (pid.parse(), created.parse()) {
                // Version issue du manifeste, jamais de texte arbitraire ou de jeton dans ce mode.
                if !minecraft.is_empty() && minecraft.len() <= 64
                    && minecraft.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._-+".contains(&byte)) {
                    let _ = monitor(pid, created, &minecraft);
                }
            }
        }
        true
    }

    struct WindowTitle {
        pid: u32,
        title: Vec<u16>,
    }

    fn monitor(pid: u32, created: u64, minecraft: &str) -> io::Result<()> {
        let process = Process::open(pid)?;
        // Un PID réutilisé entre le lancement et l'ouverture du helper n'est jamais accepté.
        if process.created()? != created || !process.is_java() {
            return Ok(());
        }
        let title = format!("Minecraft {minecraft} | Clover {}", env!("CARGO_PKG_VERSION"));
        let context = WindowTitle { pid, title: title.encode_utf16().chain([0]).collect() };
        // Minecraft réécrit son titre en rejoignant/quittant un monde. Ne réappliquer que s'il
        // a changé ; l'attente porte sur le processus d'origine et s'arrête dès sa fermeture.
        while unsafe { WaitForSingleObject(process.0, 500) } == WAIT_TIMEOUT {
            unsafe { EnumWindows(Some(update_window), &context as *const WindowTitle as LPARAM); }
        }
        Ok(())
    }

    unsafe extern "system" fn update_window(window: HWND, data: LPARAM) -> i32 {
        // EnumWindows est synchrone : le contexte reste vivant pendant tous ses callbacks.
        let context = unsafe { &*(data as *const WindowTitle) };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(window, &mut pid); }
        if pid != context.pid { return 1; }
        let mut class = [0u16; 32];
        let length = unsafe { GetClassNameW(window, class.as_mut_ptr(), class.len() as i32) };
        // Fenêtre GLFW (versions récentes) ou LWJGL 2 (1.8/1.12), dans le seul processus vérifié.
        if length <= 0 || !matches!(String::from_utf16_lossy(&class[..length as usize]).as_str(), "GLFW30" | "LWJGL") { return 1; }
        let mut current = vec![0u16; context.title.len() + 1];
        let length = unsafe { GetWindowTextW(window, current.as_mut_ptr(), current.len() as i32) };
        if current[..length.max(0) as usize] != context.title[..context.title.len() - 1] {
            // Un jeu occupé ou bloqué ne doit pas immobiliser le suivi des fenêtres.
            unsafe { SendMessageTimeoutW(window, WM_SETTEXT, 0, context.title.as_ptr() as LPARAM, SMTO_ABORTIFHUNG, 250, std::ptr::null_mut()); }
        }
        1
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn refuses_a_reused_pid_or_a_process_that_is_not_java() {
            let pid = std::process::id();
            let process = Process::open(pid).unwrap();
            let created = process.created().unwrap();
            assert!(created > 0);
            assert!(!process.is_java());
            // Ces appels doivent se terminer sans entrer dans la boucle de suivi.
            monitor(pid, created + 1, "26.2").unwrap();
            monitor(pid, created, "26.2").unwrap();
            assert!(Process::open(0).is_err());
        }
    }
}
