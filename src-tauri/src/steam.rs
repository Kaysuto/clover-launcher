//! « Ajouter à Steam » : raccourci « jeu non-Steam » dans
//! `userdata/<compte>/config/shortcuts.vdf` de chaque compte Steam du poste, avec les images de la
//! bibliothèque dans `config/grid/`. Steam n'a pas d'API pour cela et réécrit ce fichier en
//! quittant : rien n'est modifié tant qu'il est ouvert. Les autres raccourcis ne sont jamais touchés ;
//! un fichier illisible fait renoncer plutôt que risquer de les perdre.

use std::path::{Path, PathBuf};

use serde::Serialize;

const APP_NAME: &str = "Clover Games";
/// Images de la bibliothèque (scripts/steam-art.py) : suffixes de fichier attendus par Steam.
const ART: [(&str, &[u8]); 5] = [
    ("p.png", include_bytes!("../assets/steam/portrait.png")),
    (".png", include_bytes!("../assets/steam/header.png")),
    ("_hero.png", include_bytes!("../assets/steam/hero.png")),
    ("_logo.png", include_bytes!("../assets/steam/logo.png")),
    ("_icon.png", include_bytes!("../assets/steam/icon.png")),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    /// Steam n'est pas installé (aucun compte dans `userdata/`).
    Absent,
    /// Steam est ouvert : il écraserait le fichier en quittant.
    Running,
    Ready,
    /// Raccourci écrit, Steam fermé : il le chargera à sa prochaine ouverture.
    Added,
    /// Raccourci écrit et Steam ouvert : il l'a chargé en démarrant (rien n'est écrit pendant qu'il
    /// tourne), le raccourci est dans la bibliothèque.
    Listed,
}

// ── KeyValues binaires de Steam ─────────────────────────────────────────────────

const MAP: u8 = 0;
const STRING: u8 = 1;
const INT: u8 = 2;
const END: u8 = 8;

#[derive(Debug, Clone, PartialEq)]
enum Value {
    Map(Vec<(Vec<u8>, Value)>),
    Str(Vec<u8>),
    /// Valeur de taille fixe gardée telle quelle (entier, flottant, couleur…), avec son type.
    Fixed(u8, Vec<u8>),
}

struct Reader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Reader<'_> {
    fn byte(&mut self) -> Option<u8> {
        let byte = *self.bytes.get(self.pos)?;
        self.pos += 1;
        Some(byte)
    }

    fn cstring(&mut self) -> Option<Vec<u8>> {
        let end = self.bytes.get(self.pos..)?.iter().position(|&byte| byte == 0)?;
        let text = self.bytes[self.pos..self.pos + end].to_vec();
        self.pos += end + 1;
        Some(text)
    }

    fn fixed(&mut self, size: usize) -> Option<Vec<u8>> {
        let slice = self.bytes.get(self.pos..self.pos.checked_add(size)?)?.to_vec();
        self.pos += size;
        Some(slice)
    }

    /// Entrées d'une table jusqu'à sa fin (`END`).
    fn map(&mut self, depth: u8) -> Option<Vec<(Vec<u8>, Value)>> {
        if depth > 16 {
            return None;
        }
        let mut entries = Vec::new();
        loop {
            let kind = self.byte()?;
            if kind == END {
                return Some(entries);
            }
            let key = self.cstring()?;
            let value = match kind {
                MAP => Value::Map(self.map(depth + 1)?),
                STRING => Value::Str(self.cstring()?),
                // Entier, flottant, pointeur, couleur : 4 octets ; entiers 64 bits : 8.
                INT | 3 | 4 | 6 => Value::Fixed(kind, self.fixed(4)?),
                7 | 10 => Value::Fixed(kind, self.fixed(8)?),
                _ => return None,
            };
            entries.push((key, value));
        }
    }
}

fn parse(bytes: &[u8]) -> Option<Vec<(Vec<u8>, Value)>> {
    let mut reader = Reader { bytes, pos: 0 };
    let root = reader.map(0)?;
    (reader.pos == bytes.len()).then_some(root)
}

fn write_map(out: &mut Vec<u8>, entries: &[(Vec<u8>, Value)]) {
    for (key, value) in entries {
        let kind = match value {
            Value::Map(_) => MAP,
            Value::Str(_) => STRING,
            Value::Fixed(kind, _) => *kind,
        };
        out.push(kind);
        out.extend_from_slice(key);
        out.push(0);
        match value {
            Value::Map(entries) => write_map(out, entries),
            Value::Str(text) => {
                out.extend_from_slice(text);
                out.push(0);
            }
            Value::Fixed(_, bytes) => out.extend_from_slice(bytes),
        }
    }
    out.push(END);
}

fn serialize(root: &[(Vec<u8>, Value)]) -> Vec<u8> {
    let mut out = Vec::new();
    write_map(&mut out, root);
    out
}

fn text(value: Option<&Value>) -> String {
    match value {
        Some(Value::Str(bytes)) => String::from_utf8_lossy(bytes).into_owned(),
        _ => String::new(),
    }
}

fn field<'a>(entries: &'a [(Vec<u8>, Value)], name: &str) -> Option<&'a Value> {
    entries.iter().find(|(key, _)| key.eq_ignore_ascii_case(name.as_bytes())).map(|(_, value)| value)
}

// ── Raccourci du launcher ───────────────────────────────────────────────────────

/// Comment Steam lance le launcher : exécutable, dossier, options.
#[derive(Debug, Clone)]
struct Target {
    exe: String,
    start_dir: String,
    launch_options: String,
}

fn quoted(path: &Path) -> String {
    format!("\"{}\"", path.display())
}

/// Le launcher installé ; paquet du Store : son alias, l'exécutable étant dans un dossier protégé.
fn target() -> Option<Target> {
    #[cfg(windows)]
    if let Some(aumid) = crate::msix::app_user_model_id() {
        let explorer = std::env::var_os("WINDIR").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Windows")).join("explorer.exe");
        return Some(Target { exe: quoted(&explorer), start_dir: String::new(), launch_options: format!("shell:AppsFolder\\{aumid}") });
    }
    // AppImage : l'exécutable courant vit dans un montage temporaire.
    let exe = std::env::var_os("APPIMAGE").map(PathBuf::from).or_else(|| std::env::current_exe().ok())?;
    let start_dir = exe.parent().map(quoted).unwrap_or_default();
    Some(Target { exe: quoted(&exe), start_dir, launch_options: String::new() })
}

/// Identifiant de raccourci calculé comme Steam : CRC32 de l'exécutable et du nom, bit haut levé.
fn app_id(target: &Target) -> u32 {
    crc32fast::hash(format!("{}{APP_NAME}", target.exe).as_bytes()) | 0x8000_0000
}

fn is_ours(entries: &[(Vec<u8>, Value)]) -> bool {
    let exe = text(field(entries, "Exe")).to_ascii_lowercase();
    let options = text(field(entries, "LaunchOptions"));
    text(field(entries, "AppName")) == APP_NAME && (exe.contains("clover-launcher") || exe.contains("clover launcher") || options.contains("CloverLauncher"))
}

fn shortcut(target: &Target, id: u32, icon: &Path) -> Value {
    let string = |key: &str, value: &str| (key.as_bytes().to_vec(), Value::Str(value.as_bytes().to_vec()));
    let int = |key: &str, value: u32| (key.as_bytes().to_vec(), Value::Fixed(INT, value.to_le_bytes().to_vec()));
    Value::Map(vec![
        int("appid", id),
        string("AppName", APP_NAME),
        string("Exe", &target.exe),
        string("StartDir", &target.start_dir),
        string("icon", &icon.display().to_string()),
        string("ShortcutPath", ""),
        string("LaunchOptions", &target.launch_options),
        int("IsHidden", 0),
        int("AllowDesktopConfig", 1),
        int("AllowOverlay", 1),
        int("OpenVR", 0),
        int("Devkit", 0),
        string("DevkitGameID", ""),
        int("DevkitOverrideAppID", 0),
        int("LastPlayTime", 0),
        string("FlatpakAppID", ""),
        (b"tags".to_vec(), Value::Map(Vec::new())),
    ])
}

/// Raccourcis d'un fichier, sans ceux du launcher ; `None` si le fichier est illisible.
fn others(bytes: &[u8]) -> Option<Vec<Value>> {
    if bytes.is_empty() {
        return Some(Vec::new());
    }
    let root = parse(bytes)?;
    let Some(Value::Map(list)) = field(&root, "shortcuts") else { return None };
    Some(list.iter().map(|(_, value)| value.clone()).filter(|value| !matches!(value, Value::Map(entries) if is_ours(entries))).collect())
}

/// Fichier complet, raccourcis renumérotés à partir de 0.
fn file(shortcuts: Vec<Value>) -> Vec<u8> {
    let list = shortcuts.into_iter().enumerate().map(|(index, value)| (index.to_string().into_bytes(), value)).collect();
    serialize(&[(b"shortcuts".to_vec(), Value::Map(list))])
}

fn contains_ours(bytes: &[u8]) -> bool {
    parse(bytes).is_some_and(|root| matches!(field(&root, "shortcuts"), Some(Value::Map(list)) if list.iter().any(|(_, value)| matches!(value, Value::Map(entries) if is_ours(entries)))))
}

// ── Steam du poste ──────────────────────────────────────────────────────────────

fn steam_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    #[cfg(windows)]
    if let Some(path) = registry_steam_path() {
        dirs.push(path);
    }
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from) {
        if cfg!(windows) {
            dirs.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
        } else if cfg!(target_os = "macos") {
            dirs.push(home.join("Library/Application Support/Steam"));
        } else {
            dirs.extend([home.join(".steam/steam"), home.join(".local/share/Steam"), home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam")]);
        }
    }
    dirs
}

#[cfg(windows)]
fn registry_steam_path() -> Option<PathBuf> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let wide = |text: &str| text.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (key, name) = (wide(r"Software\Valve\Steam"), wide("SteamPath"));
    let mut buffer = vec![0u16; 1024];
    let mut size = (buffer.len() * 2) as u32;
    // SAFETY: tampon et taille cohérents, chaînes terminées par zéro.
    let status = unsafe { RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buffer.as_mut_ptr().cast(), &mut size) };
    if status != 0 {
        return None;
    }
    let length = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    Some(PathBuf::from(String::from_utf16_lossy(&buffer[..length])))
}

/// Dossiers `config/` des comptes Steam (`userdata/<identifiant numérique>/config`).
fn account_configs() -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    // Chemin canonique pour repérer un même Steam sous deux noms ; le chemin d'origine pour écrire
    // (le préfixe des chemins étendus de Windows ne serait pas compris par Steam dans `icon`).
    steam_dirs()
        .into_iter()
        .map(|dir| dir.join("userdata"))
        .filter(|userdata| std::fs::canonicalize(userdata).is_ok_and(|canonical| seen.insert(canonical)))
        .flat_map(|userdata| std::fs::read_dir(userdata).into_iter().flatten().flatten())
        .filter(|entry| entry.file_name().to_string_lossy().bytes().all(|c| c.is_ascii_digit()) && entry.file_name() != "0")
        .map(|entry| entry.path().join("config"))
        .collect()
}

fn steam_running() -> bool {
    let system = sysinfo::System::new_with_specifics(sysinfo::RefreshKind::nothing().with_processes(sysinfo::ProcessRefreshKind::nothing()));
    system.processes().values().any(|process| {
        let name = process.name().to_string_lossy().to_ascii_lowercase();
        matches!(name.trim_end_matches(".exe"), "steam" | "steam_osx")
    })
}

pub fn status() -> State {
    let configs = account_configs();
    if configs.is_empty() {
        State::Absent
    } else if configs.iter().any(|config| std::fs::read(config.join("shortcuts.vdf")).is_ok_and(|bytes| contains_ours(&bytes))) {
        if steam_running() {
            State::Listed
        } else {
            State::Added
        }
    } else if steam_running() {
        State::Running
    } else {
        State::Ready
    }
}

fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    std::fs::write(&temporary, bytes)?;
    std::fs::rename(temporary, path)
}

/// Ajoute (`add`) ou retire le raccourci dans `config` (un compte Steam).
fn update(config: &Path, target: Option<&Target>) -> Result<(), String> {
    let path = config.join("shortcuts.vdf");
    let bytes = std::fs::read(&path).unwrap_or_default();
    let previous: Vec<u32> = parse(&bytes)
        .and_then(|root| match field(&root, "shortcuts") {
            Some(Value::Map(list)) => Some(
                list.iter()
                    .filter_map(|(_, value)| match value {
                        Value::Map(entries) if is_ours(entries) => match field(entries, "appid") {
                            Some(Value::Fixed(INT, raw)) => raw.as_slice().try_into().ok().map(u32::from_le_bytes),
                            _ => None,
                        },
                        _ => None,
                    })
                    .collect(),
            ),
            _ => None,
        })
        .unwrap_or_default();
    let mut shortcuts = others(&bytes).ok_or_else(|| format!("{} est illisible : rien n'a été modifié.", path.display()))?;
    let grid = config.join("grid");
    for id in previous {
        for (suffix, _) in ART {
            let _ = std::fs::remove_file(grid.join(format!("{id}{suffix}")));
        }
    }
    if let Some(target) = target {
        let id = app_id(target);
        for (suffix, image) in ART {
            write_atomically(&grid.join(format!("{id}{suffix}")), image).map_err(|e| e.to_string())?;
        }
        shortcuts.push(shortcut(target, id, &grid.join(format!("{id}_icon.png"))));
    }
    if !bytes.is_empty() {
        let mut backup = path.as_os_str().to_owned();
        backup.push(".bak");
        std::fs::copy(&path, backup).map_err(|e| e.to_string())?;
    }
    write_atomically(&path, &file(shortcuts)).map_err(|e| e.to_string())
}

fn apply(add: bool) -> Result<State, String> {
    if steam_running() {
        return Err("Steam est ouvert : ferme-le (Steam › Quitter), puis réessaie.".into());
    }
    let configs = account_configs();
    if configs.is_empty() {
        return Err("Steam n'est pas installé sur cet ordinateur.".into());
    }
    let target = if add { Some(target().ok_or("Emplacement du launcher introuvable.")?) } else { None };
    for config in configs {
        update(&config, target.as_ref())?;
    }
    Ok(status())
}

#[tauri::command]
pub fn steam_status() -> State {
    status()
}

#[tauri::command]
pub fn steam_add() -> Result<State, String> {
    apply(true)
}

#[tauri::command]
pub fn steam_remove() -> Result<State, String> {
    apply(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn other_game() -> Value {
        let int = |key: &str, value: u32| (key.as_bytes().to_vec(), Value::Fixed(INT, value.to_le_bytes().to_vec()));
        Value::Map(vec![
            int("appid", 0x9234_5678),
            (b"AppName".to_vec(), Value::Str(b"Autre jeu".to_vec())),
            (b"Exe".to_vec(), Value::Str(br#""C:\Jeux\autre.exe""#.to_vec())),
            (b"LastPlayTime".to_vec(), Value::Fixed(INT, 1_790_000_000u32.to_le_bytes().to_vec())),
            (b"Score".to_vec(), Value::Fixed(7, 42u64.to_le_bytes().to_vec())),
            (b"tags".to_vec(), Value::Map(vec![(b"0".to_vec(), Value::Str(b"Favoris".to_vec()))])),
        ])
    }

    #[test]
    fn binary_keyvalues_round_trip() {
        let bytes = file(vec![other_game()]);
        assert_eq!(bytes.last(), Some(&END));
        assert_eq!(&bytes[..11], b"\x00shortcuts\x00");
        assert_eq!(serialize(&parse(&bytes).unwrap()), bytes);
        assert!(parse(&bytes[..bytes.len() - 1]).is_none());
        assert!(parse(b"\x00shortcuts\x00\x05x\x00").is_none());
    }

    #[test]
    fn adds_and_removes_only_our_shortcut() {
        let config = std::env::temp_dir().join(format!("clover-steam-{}", rand::random::<u64>())).join("config");
        std::fs::create_dir_all(&config).unwrap();
        let original = file(vec![other_game()]);
        std::fs::write(config.join("shortcuts.vdf"), &original).unwrap();
        let target = Target { exe: r#""C:\Users\joueur\AppData\Local\Clover Launcher\clover-launcher.exe""#.into(), start_dir: r#""C:\Users\joueur\AppData\Local\Clover Launcher\""#.into(), launch_options: String::new() };

        update(&config, Some(&target)).unwrap();
        update(&config, Some(&target)).unwrap();
        let bytes = std::fs::read(config.join("shortcuts.vdf")).unwrap();
        let root = parse(&bytes).unwrap();
        let Some(Value::Map(list)) = field(&root, "shortcuts") else { panic!("liste attendue") };
        assert_eq!(list.len(), 2, "ajouté une seule fois");
        assert_eq!(list[0].1, other_game());
        assert_eq!(list[1].0, b"1");
        let id = app_id(&target);
        assert!(id & 0x8000_0000 != 0);
        assert!(config.join(format!("grid/{id}p.png")).is_file() && config.join(format!("grid/{id}_hero.png")).is_file());
        assert!(contains_ours(&bytes));

        update(&config, None).unwrap();
        assert_eq!(std::fs::read(config.join("shortcuts.vdf")).unwrap(), original);
        assert!(!config.join(format!("grid/{id}p.png")).exists());
        assert_eq!(std::fs::read(config.join("shortcuts.vdf.bak")).unwrap(), bytes);

        // Fichier illisible : rien n'est écrit.
        std::fs::write(config.join("shortcuts.vdf"), b"\x00shortcuts\x00\x05").unwrap();
        assert!(update(&config, Some(&target)).is_err());
        assert_eq!(std::fs::read(config.join("shortcuts.vdf")).unwrap(), b"\x00shortcuts\x00\x05");
        std::fs::remove_dir_all(config.parent().unwrap()).unwrap();
    }

    #[test]
    #[ignore = "Steam installé sur le poste"]
    fn finds_this_steam() {
        println!("{:?} {:?}", account_configs(), status());
    }
}
