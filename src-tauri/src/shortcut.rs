//! Parties demandées de l'extérieur : le launcher démarre, ou se réaffiche s'il est déjà ouvert,
//! et l'interface lance la partie dès que le compte est prêt.
//!
//! - Raccourci sur le bureau : `--play <instance>`.
//! - Lien `clover://play` (instance Clover, menu du jeu) ou `clover://play/<mode>` (mode du
//!   manifeste, rejoint directement), par exemple depuis le site. Sous Windows et Linux le lien
//!   arrive en argument ; sous macOS par le plugin deep-link (`lib.rs`).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::{instances, AppState};

pub const PLAY_ARG: &str = "--play";
/// Schéma des liens, déclaré dans `tauri.conf.json` et le manifeste MSIX.
const SCHEME: &str = "clover";

/// Partie demandée. Mêmes noms que le type `LaunchRequest` du front.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", content = "id", rename_all = "camelCase")]
pub enum Request {
    /// Instance lancée sur son menu.
    Instance(String),
    /// Mode du manifeste rejoint avec l'instance Clover ; `play` refuse un mode inconnu.
    Mode(String),
}

/// Partie demandée et pas encore prise par l'interface.
#[derive(Default)]
pub struct LaunchRequest(Mutex<Option<Request>>);

impl LaunchRequest {
    pub fn from_env() -> Self {
        Self(Mutex::new(requested(&std::env::args().collect::<Vec<_>>())))
    }

    /// Second lancement (raccourci ou lien ouvert launcher ouvert) : `true` s'il demande une partie.
    pub fn take_from(&self, args: &[String]) -> bool {
        self.set(requested(args))
    }

    /// Lien reçu par le plugin deep-link (macOS) : `true` s'il demande une partie.
    pub fn take_url(&self, url: &str) -> bool {
        self.set(from_url(url))
    }

    fn set(&self, request: Option<Request>) -> bool {
        let Some(request) = request else { return false };
        *self.0.lock().expect("demande de partie") = Some(request);
        true
    }
}

/// `--play <instance>` si l'identifiant est bien formé, sinon un lien `clover://` en argument.
fn requested(args: &[String]) -> Option<Request> {
    let shortcut = args.windows(2).find(|pair| pair[0] == PLAY_ARG).map(|pair| pair[1].clone()).filter(|id| instances::validate_instance_id(id).is_ok());
    shortcut.map(Request::Instance).or_else(|| args.iter().skip(1).find_map(|arg| from_url(arg)))
}

/// `clover://play` ou `clover://play/<mode>` ; tout autre lien ouvre seulement le launcher.
fn from_url(text: &str) -> Option<Request> {
    let url = url::Url::parse(text).ok().filter(|url| url.scheme() == SCHEME)?;
    if url.host_str() != Some("play") {
        return None;
    }
    // Les navigateurs ajoutent parfois une barre finale.
    match url.path().trim_matches('/') {
        "" => Some(Request::Instance(instances::BUILTIN.into())),
        mode if mode.len() <= 32 && mode.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_') => Some(Request::Mode(mode.to_owned())),
        _ => None,
    }
}

#[tauri::command]
pub fn take_launch_request(request: State<'_, LaunchRequest>) -> Option<Request> {
    request.0.lock().expect("demande de partie").take()
}

/// Windows hors Microsoft Store (l'exécutable d'un paquet ne se lance pas directement) et Linux.
pub fn supported() -> bool {
    (cfg!(windows) && !crate::msix::packaged()) || cfg!(target_os = "linux")
}

/// Crée sur le bureau un raccourci « <instance> - Clover » ; renvoie son chemin.
#[tauri::command]
pub fn create_desktop_shortcut(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    if !supported() {
        return Err("Les raccourcis sur le bureau ne sont pas disponibles sur ce système.".into());
    }
    let instance = instances::resolve(&state.snapshot(), Some(&id)).map_err(|e| e.to_string())?;
    let desktop = app.path().desktop_dir().map_err(|e| format!("Bureau introuvable : {e}"))?;
    let executable = executable().map_err(|e| format!("Launcher introuvable : {e}"))?;
    let name = file_name(&format!("{} - Clover", instance.name));
    let path = write(&desktop, &name, &executable, &instance.id, &instance.name).map_err(|e| format!("Raccourci non créé : {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// AppImage : le chemin monté change à chaque lancement, celui du fichier est dans `APPIMAGE`.
fn executable() -> std::io::Result<PathBuf> {
    match std::env::var_os("APPIMAGE") {
        Some(image) if cfg!(target_os = "linux") => Ok(PathBuf::from(image)),
        _ => std::env::current_exe(),
    }
}

/// Nom de fichier sans caractères interdits par Windows ni séparateurs.
pub(crate) fn file_name(name: &str) -> String {
    let clean: String = name.chars().map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '_' } else { c }).collect();
    clean.trim().trim_end_matches('.').to_owned()
}

#[cfg(windows)]
fn write(desktop: &Path, name: &str, executable: &Path, id: &str, title: &str) -> std::io::Result<PathBuf> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let path = desktop.join(format!("{name}.lnk"));
    // Chaînes PowerShell entre apostrophes : seule l'apostrophe se double.
    let quote = |text: &str| format!("'{}'", text.replace('\'', "''"));
    let directory = executable.parent().unwrap_or(executable);
    let script = format!(
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut({}); $s.TargetPath = {}; $s.Arguments = {}; $s.WorkingDirectory = {}; $s.IconLocation = {}; $s.Description = {}; $s.Save()",
        quote(&path.to_string_lossy()),
        quote(&executable.to_string_lossy()),
        quote(&format!("{PLAY_ARG} {id}")),
        quote(&directory.to_string_lossy()),
        quote(&format!("{},0", executable.to_string_lossy())),
        quote(&format!("Jouer à {title} avec le Clover Launcher")),
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()?;
    if !output.status.success() || !path.is_file() {
        return Err(std::io::Error::other(String::from_utf8_lossy(&output.stderr).trim().to_owned()));
    }
    Ok(path)
}

#[cfg(not(windows))]
fn write(desktop: &Path, name: &str, executable: &Path, id: &str, title: &str) -> std::io::Result<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    let path = desktop.join(format!("{name}.desktop"));
    std::fs::create_dir_all(desktop)?;
    std::fs::write(&path, desktop_entry(title, executable, id))?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
    Ok(path)
}

/// Entrée `.desktop` ; `Exec` suit les règles de citation de la spécification freedesktop.
#[cfg_attr(windows, allow(dead_code))]
fn desktop_entry(title: &str, executable: &Path, id: &str) -> String {
    let mut quoted = String::from('"');
    for c in executable.to_string_lossy().chars() {
        if matches!(c, '"' | '`' | '$' | '\\') {
            quoted.push('\\');
        }
        quoted.push(c);
    }
    quoted.push('"');
    let line = |text: &str| text.replace(['\n', '\r'], " ");
    format!(
        "[Desktop Entry]\nType=Application\nName={}\nComment={}\nExec={quoted} {PLAY_ARG} {id}\nTerminal=false\nCategories=Game;\n",
        line(title),
        line(&format!("Jouer à {title} avec le Clover Launcher")),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_only_a_well_formed_instance_request() {
        let args = |list: &[&str]| list.iter().map(|arg| (*arg).to_owned()).collect::<Vec<_>>();
        let id = "instance-0123456789abcdef0123456789abcdef";
        let instance = |id: &str| Some(Request::Instance(id.into()));
        assert_eq!(requested(&args(&["clover-launcher.exe", "--play", id])), instance(id));
        assert_eq!(requested(&args(&["clover-launcher.exe", "--play", "clover"])), instance("clover"));
        assert_eq!(requested(&args(&["clover-launcher.exe", "--play", "../../etc"])), None);
        assert_eq!(requested(&args(&["clover-launcher.exe", "--minimized"])), None);
        let request = LaunchRequest::default();
        assert!(request.take_from(&args(&["x", "--play", id])));
        assert_eq!(request.0.lock().unwrap().take(), instance(id));
    }

    #[test]
    fn reads_only_play_links() {
        let mode = |id: &str| Some(Request::Mode(id.into()));
        assert_eq!(from_url("clover://play/bedwars"), mode("bedwars"));
        assert_eq!(from_url("clover://play/bedwars/"), mode("bedwars"));
        assert_eq!(from_url("clover://play"), Some(Request::Instance("clover".into())));
        assert_eq!(from_url("clover://play/"), Some(Request::Instance("clover".into())));
        assert_eq!(from_url("clover://play/bed%2Fwars"), None);
        assert_eq!(from_url("clover://play/BedWars"), None);
        assert_eq!(from_url("clover://play/a/b"), None);
        assert_eq!(from_url("clover://open"), None);
        assert_eq!(from_url("https://play/bedwars"), None);
        let args = ["C:\\Clover\\clover-launcher.exe".to_owned(), "clover://play/skypvp".to_owned()];
        assert_eq!(requested(&args), mode("skypvp"));
        assert!(LaunchRequest::default().take_url("clover://play/practice"));
        assert!(!LaunchRequest::default().take_url("clover://"));
    }

    #[test]
    fn shortcut_names_and_entries_are_safe() {
        assert_eq!(file_name("PvP: 1.21 / test? - Clover"), "PvP_ 1.21 _ test_ - Clover");
        let entry = desktop_entry("Survie\n[x]", Path::new("/opt/Clover $HOME/clover"), "clover");
        assert!(entry.contains("Name=Survie [x]\n"));
        assert!(entry.contains("Exec=\"/opt/Clover \\$HOME/clover\" --play clover\n"));
    }
}
