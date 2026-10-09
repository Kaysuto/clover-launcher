//! Import depuis les autres launchers.
//!
//! Détecte les installations du launcher officiel, de Modrinth App, de Prism Launcher / MultiMC et
//! de CurseForge, puis copie dans le dossier de l'instance Clover ce que le joueur choisit. Copie
//! seule : les autres launchers ne sont jamais modifiés. Seuls leurs fichiers de profils et de jeu
//! sont lus, jamais leurs comptes ni leurs jetons (`launcher_accounts*.json`,
//! `launcher_msa_credentials*`, `accounts.json`, `app.db`). Les mods du catalogue, reconnus par
//! leur empreinte, sont activés par l'interface plutôt que copiés ; les autres mods Fabric sont
//! copiés dans « Mes mods » de l'instance Clover, avec les réglages des mods (`config/`).
//!
//! Une installation Vanilla, Fabric, Forge ou NeoForge peut aussi devenir une nouvelle instance
//! personnelle (`import_as_instance`) : même version, dossier séparé, tous les mods faits pour son
//! loader copiés.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::game::servers_dat;
use crate::{game, instances, AppState};

/// Dernière détection, gardée pour la session : une nouvelle recherche ne relit que les mods
/// ajoutés ou modifiés et ne demande à Modrinth que les empreintes inconnues.
#[derive(Default)]
pub struct Detected(Mutex<Cache>);

#[derive(Default)]
pub struct Cache {
    /// Installations trouvées : l'import n'accepte que celles-ci.
    installations: Vec<Found>,
    /// Mods déjà lus, par fichier.
    mods: HashMap<PathBuf, (Stamp, ModFile)>,
    /// Réponses de Modrinth par empreinte : projet, ou `None` pour un fichier qu'il ne connaît pas.
    projects: HashMap<String, Option<String>>,
}

#[derive(Clone)]
struct Found {
    dir: PathBuf,
    name: String,
    game: Game,
    /// Mods à copier dans « Mes mods ».
    personal: Vec<String>,
    /// Mods du catalogue à activer : ils comptent comme présents pour les dépendances.
    catalogue: Vec<String>,
    /// Mods faits pour le loader de l'installation (fichiers) : ceux d'une nouvelle instance créée
    /// par l'import.
    loader_mods: Vec<String>,
}

/// Taille et date de modification : un `.jar` qui n'a pas changé n'est pas relu.
type Stamp = (u64, Option<SystemTime>);

fn stamp(path: &Path) -> Option<Stamp> {
    let metadata = fs::metadata(path).ok()?;
    Some((metadata.len(), metadata.modified().ok()))
}

struct Source {
    launcher: &'static str,
    name: String,
    game: Game,
    /// Dossier du jeu (`options.txt`, `saves/`…).
    dir: PathBuf,
}

/// Ce que l'autre launcher dit du jeu d'une installation, quand il le dit.
#[derive(Clone, Debug, Default, PartialEq)]
struct Game {
    minecraft: Option<String>,
    /// « Fabric », « Quilt », « Forge » ou « NeoForge » ; `None` sans loader.
    loader: Option<String>,
    /// Version du loader : reprise par une nouvelle instance si elle est encore publiée.
    loader_version: Option<String>,
}

impl Game {
    fn new(minecraft: Option<&str>, loader: Option<&str>, loader_version: Option<&str>) -> Self {
        let owned = |value: Option<&str>| value.filter(|value| !value.is_empty()).map(str::to_owned);
        Self { minecraft: owned(minecraft), loader: owned(loader), loader_version: owned(loader_version) }
    }
}

/// Ce qu'une installation contient, ou ce qu'un import a copié. Mêmes noms que le front.
#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Content {
    options: bool,
    servers: usize,
    resource_packs: usize,
    shader_packs: usize,
    screenshots: usize,
    worlds: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueMod {
    id: String,
    name: String,
}

/// Installation trouvée. Mêmes noms que le type `DetectedInstance` du front.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    id: String,
    launcher: &'static str,
    name: String,
    minecraft: Option<String>,
    loader: Option<String>,
    path: String,
    content: Content,
    /// Version du loader dans l'autre launcher.
    loader_version: Option<String>,
    /// Mods du catalogue reconnus par leur empreinte et pas encore activés.
    catalogue_mods: Vec<CatalogueMod>,
    /// Autres mods Fabric : copiés dans « Mes mods » si le joueur le demande.
    personal_mods: Vec<String>,
    /// Mods faits pour un autre loader que Fabric : pas repris dans l'instance Clover intégrée.
    other_mods: Vec<String>,
    /// Mods faits pour le loader de l'installation, catalogue compris : ceux copiés dans une
    /// nouvelle instance.
    loader_mods: Vec<String>,
}

/// Éléments cochés dans l'interface. `options` reprend aussi les réglages des mods (`config/`) ;
/// `mods` (mods du catalogue) est activé par l'interface, il ne sert ici qu'aux dépendances.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Choices {
    options: bool,
    mods: bool,
    personal_mods: bool,
    servers: bool,
    resource_packs: bool,
    shader_packs: bool,
    screenshots: bool,
    worlds: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    #[serde(flatten)]
    copied: Content,
    /// Mods copiés dans « Mes mods ».
    mods: usize,
    /// Dépendances obligatoires de ces mods téléchargées depuis Modrinth.
    dependencies: usize,
    /// Dépendances sans version pour Minecraft du serveur : les mods qui les demandent planteront.
    missing_dependencies: usize,
    /// Modrinth injoignable : les dépendances n'ont pas pu être vérifiées.
    dependencies_unchecked: bool,
    /// Entrées déjà présentes chez Clover sous le même nom : gardées telles quelles.
    kept: usize,
}

// ── Emplacements ────────────────────────────────────────────────────────────────

/// Emplacements par défaut des launchers ; `data` est `%APPDATA%`, `~/Library/Application Support`
/// ou `~/.local/share`.
fn sources(home: &Path, data: &Path) -> Vec<Source> {
    let mut found = Vec::new();
    let official = if cfg!(windows) {
        data.join(".minecraft")
    } else if cfg!(target_os = "macos") {
        data.join("minecraft")
    } else {
        home.join(".minecraft")
    };
    official_sources(&official, &mut found);
    for app in ["ModrinthApp", "com.modrinth.theseus"] {
        modrinth_sources(&data.join(app).join("profiles"), &mut found);
    }
    prism_sources("Prism Launcher", &data.join("PrismLauncher"), "prismlauncher.cfg", &mut found);
    prism_sources(
        "Prism Launcher",
        &home.join(".var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher"),
        "prismlauncher.cfg",
        &mut found,
    );
    prism_sources("MultiMC", &data.join("multimc"), "multimc.cfg", &mut found);
    for base in [home.join("curseforge"), home.join("Documents").join("curseforge")] {
        curseforge_sources(&base.join("minecraft").join("Instances"), &mut found);
    }
    found
}

#[derive(Deserialize)]
struct LauncherProfiles {
    #[serde(default)]
    profiles: HashMap<String, OfficialProfile>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfficialProfile {
    #[serde(default)]
    name: String,
    #[serde(default)]
    last_version_id: String,
    game_dir: Option<PathBuf>,
    #[serde(default)]
    last_used: String,
}

/// Launcher officiel : `.minecraft`, plus un dossier par installation qui en a choisi un autre.
/// Seuls les profils de `launcher_profiles.json` sont gardés ; les comptes sont ailleurs.
fn official_sources(root: &Path, found: &mut Vec<Source>) {
    if !root.is_dir() {
        return;
    }
    let mut profiles: Vec<OfficialProfile> = read_json::<LauncherProfiles>(&root.join("launcher_profiles.json"))
        .map(|file| file.profiles.into_values().collect())
        .unwrap_or_default();
    // Le profil joué en dernier donne la version affichée (dates ISO 8601 : ordre lexical).
    profiles.sort_by(|a, b| b.last_used.cmp(&a.last_used));
    let default = profiles.iter().find(|profile| profile.game_dir.as_deref().is_none_or(|dir| dir == root));
    let game = default.map(|profile| parse_version_id(&profile.last_version_id)).unwrap_or_default();
    found.push(Source { launcher: "Launcher officiel", name: "Installation par défaut".into(), game, dir: root.to_path_buf() });
    let mut seen = HashSet::from([root.to_path_buf()]);
    for profile in &profiles {
        let Some(dir) = profile.game_dir.as_ref().filter(|dir| dir.is_dir()) else { continue };
        if !seen.insert(dir.clone()) {
            continue;
        }
        let name = if profile.name.is_empty() { profile.last_version_id.clone() } else { profile.name.clone() };
        found.push(Source { launcher: "Launcher officiel", name, game: parse_version_id(&profile.last_version_id), dir: dir.clone() });
    }
}

/// `lastVersionId` du launcher officiel : « 1.21.4 », « fabric-loader-0.16.10-1.21.4 »,
/// « 1.20.1-forge-47.2.0 », « neoforge-21.1.77 », « latest-release »…
fn parse_version_id(id: &str) -> Game {
    for (prefix, loader) in [("fabric-loader-", "Fabric"), ("quilt-loader-", "Quilt")] {
        if let Some(rest) = id.strip_prefix(prefix) {
            let (version, minecraft) = rest.split_once('-').map_or((Some(rest), None), |(version, minecraft)| (Some(version), Some(minecraft)));
            return Game::new(minecraft, Some(loader), version);
        }
    }
    if let Some((minecraft, version)) = id.split_once("-forge") {
        return Game::new(Some(minecraft), Some("Forge"), Some(version.trim_start_matches('-')));
    }
    if let Some(version) = id.strip_prefix("neoforge-") {
        // La version de NeoForge dit celle de Minecraft : 21.1.77 pour 1.21.1.
        return Game { minecraft: game::forge::neoforge_minecraft(version), ..Game::new(None, Some("NeoForge"), Some(version)) };
    }
    if id.is_empty() || id.starts_with("latest-") {
        return Game::default();
    }
    Game::new(Some(id), None, None)
}

/// Modrinth App : un dossier par profil. Version et loader sont dans `app.db`, qui garde aussi les
/// comptes : il n'est pas ouvert, le journal du jeu suffit (`log_hint`).
fn modrinth_sources(profiles: &Path, found: &mut Vec<Source>) {
    for dir in subdirs(profiles) {
        found.push(Source { launcher: "Modrinth App", name: file_name(&dir), game: Game::default(), dir });
    }
}

#[derive(Deserialize)]
struct PrismPack {
    components: Vec<PrismComponent>,
}

#[derive(Deserialize)]
struct PrismComponent {
    uid: String,
    version: Option<String>,
}

/// Prism Launcher et MultiMC : `instances/<id>/` (ou `InstanceDir` de leur configuration), avec
/// `instance.cfg` (nom) et `mmc-pack.json` (composants) ; le jeu est dans `.minecraft/` ou
/// `minecraft/`. Les comptes (`accounts.json`) ne sont pas lus.
fn prism_sources(launcher: &'static str, root: &Path, config: &str, found: &mut Vec<Source>) {
    let custom = fs::read_to_string(root.join(config)).ok().and_then(|text| ini_value(&text, "InstanceDir"));
    // Un chemin absolu remplace `root` dans `join`.
    let instances = custom.map_or_else(|| root.join("instances"), |dir| root.join(dir));
    for dir in subdirs(&instances) {
        let Ok(cfg) = fs::read_to_string(dir.join("instance.cfg")) else { continue };
        let Some(game) = [".minecraft", "minecraft"].iter().map(|name| dir.join(name)).find(|path| path.is_dir()) else { continue };
        let pack = read_json::<PrismPack>(&dir.join("mmc-pack.json")).map(|pack| pack.components).unwrap_or_default();
        let minecraft = pack.iter().find(|c| c.uid == "net.minecraft").and_then(|c| c.version.clone());
        let loader = pack.iter().find_map(|c| {
            let loader = match c.uid.as_str() {
                "net.fabricmc.fabric-loader" => "Fabric",
                "org.quiltmc.quilt-loader" => "Quilt",
                "net.minecraftforge" => "Forge",
                "net.neoforged" => "NeoForge",
                _ => return None,
            };
            Some((loader, c.version.as_deref()))
        });
        let name = ini_value(&cfg, "name").unwrap_or_else(|| file_name(&dir));
        let (loader, version) = loader.unzip();
        found.push(Source { launcher, name, game: Game::new(minecraft.as_deref(), loader, version.flatten()), dir: game });
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CurseForgeInstance {
    name: Option<String>,
    game_version: Option<String>,
    base_mod_loader: Option<CurseForgeLoader>,
}

#[derive(Deserialize)]
struct CurseForgeLoader {
    /// « fabric-0.16.10-1.21.4 », « forge-47.2.0 », « neoforge-21.1.77 ».
    name: String,
}

/// CurseForge : `Instances/<nom>/`, décrit par `minecraftinstance.json` ; le jeu est le dossier
/// lui-même.
fn curseforge_sources(instances: &Path, found: &mut Vec<Source>) {
    for dir in subdirs(instances) {
        let Some(meta) = read_json::<CurseForgeInstance>(&dir.join("minecraftinstance.json")) else { continue };
        let loader = meta.base_mod_loader.as_ref().and_then(|loader| {
            let (kind, version) = loader.name.split_once('-')?;
            let kind = match kind {
                "fabric" => "Fabric",
                "quilt" => "Quilt",
                "forge" => "Forge",
                "neoforge" => "NeoForge",
                _ => return None,
            };
            // Fabric et Quilt : version du loader puis de Minecraft (« 0.16.10-1.21.4 »).
            let version = if matches!(kind, "Fabric" | "Quilt") { version.split_once('-').map_or(version, |(loader, _)| loader) } else { version };
            Some((kind, version))
        });
        let name = meta.name.clone().unwrap_or_else(|| file_name(&dir));
        let (loader, version) = loader.unzip();
        found.push(Source { launcher: "CurseForge", name, game: Game::new(meta.game_version.as_deref(), loader, version), dir });
    }
}

/// En tête du journal du jeu : « Loading Minecraft 26.2 with Fabric Loader 0.19.5 » sous Fabric
/// et Quilt ; arguments `--fml.mcVersion` et `--fml.neoForgeVersion` (ou `--fml.forgeVersion`)
/// sous NeoForge et Forge.
fn log_hint(dir: &Path) -> Option<Game> {
    let mut head = Vec::new();
    fs::File::open(dir.join("logs").join("latest.log")).ok()?.take(64 * 1024).read_to_end(&mut head).ok()?;
    let head = String::from_utf8_lossy(&head);
    if let Some(line) = head.lines().find_map(|line| line.split_once("Loading Minecraft ").map(|(_, rest)| rest)) {
        let (minecraft, loader) = line.split_once(" with ").unwrap_or((line, ""));
        let minecraft = minecraft.trim();
        // « Fabric Loader 0.19.5 » : nom, puis version.
        let mut words = loader.split_whitespace();
        let (loader, version) = (words.next(), words.nth(1));
        return (!minecraft.is_empty()).then(|| Game::new(Some(minecraft), loader, version));
    }
    let minecraft = fml_argument(&head, "mcVersion")?;
    let (loader, version) = [("NeoForge", "neoForgeVersion"), ("Forge", "forgeVersion")].into_iter().find_map(|(loader, key)| Some((loader, fml_argument(&head, key)?))).unzip();
    Some(Game::new(Some(&minecraft), loader, version.as_deref()))
}

/// Valeur de `--fml.<key>` dans la ligne de commande que Forge et NeoForge écrivent au journal
/// (« --fml.mcVersion, 1.21.1 »).
fn fml_argument(log: &str, key: &str) -> Option<String> {
    let (_, rest) = log.split_once(&format!("--fml.{key}"))?;
    let value: String = rest.trim_start_matches([',', ' ', '=']).chars().take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+')).collect();
    (!value.is_empty()).then_some(value)
}

fn ini_value(text: &str, key: &str) -> Option<String> {
    text.lines()
        .find_map(|line| line.trim().strip_prefix(key)?.strip_prefix('=').map(str::trim))
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn file_name(path: &Path) -> String {
    path.file_name().unwrap_or_default().to_string_lossy().into_owned()
}

/// Sous-dossiers réels (pas de lien), hors dossiers techniques (`.tmp`, `_MMC_TEMP`…), triés.
fn subdirs(dir: &Path) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(dir) else { return Vec::new() };
    let mut dirs: Vec<PathBuf> = read
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with(['.', '_']))
        .map(|entry| entry.path())
        .collect();
    dirs.sort();
    dirs
}

// ── Contenu d'un dossier de jeu ─────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum Folder {
    ResourcePacks,
    ShaderPacks,
    Screenshots,
    Worlds,
}

impl Folder {
    fn name(self) -> &'static str {
        match self {
            Self::ResourcePacks => "resourcepacks",
            Self::ShaderPacks => "shaderpacks",
            Self::Screenshots => "screenshots",
            Self::Worlds => "saves",
        }
    }

    /// Entrées que le jeu reconnaît. Les `<pack>.txt` d'Iris (réglages d'un shader) ne comptent
    /// pas : ils sont copiés avec leur pack.
    fn entries(self, game: &Path) -> Vec<PathBuf> {
        let Ok(read) = fs::read_dir(game.join(self.name())) else { return Vec::new() };
        let mut entries: Vec<PathBuf> = read
            .flatten()
            .filter_map(|entry| {
                let kind = entry.file_type().ok()?;
                let path = entry.path();
                let zip = path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("zip"));
                let png = path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("png"));
                let accepted = match self {
                    Self::ResourcePacks | Self::ShaderPacks => kind.is_dir() || (kind.is_file() && zip),
                    Self::Screenshots => kind.is_file() && png,
                    Self::Worlds => kind.is_dir() && path.join("level.dat").is_file(),
                };
                accepted.then_some(path)
            })
            .collect();
        entries.sort();
        entries
    }
}

fn content(game: &Path) -> Content {
    let servers = fs::read(game.join("servers.dat")).ok().and_then(|bytes| servers_dat::entries(&bytes).map(|list| list.iter().filter(|entry| !servers_dat::hidden(entry)).count()));
    Content {
        options: game.join("options.txt").is_file(),
        servers: servers.unwrap_or(0),
        resource_packs: Folder::ResourcePacks.entries(game).len(),
        shader_packs: Folder::ShaderPacks.entries(game).len(),
        screenshots: Folder::Screenshots.entries(game).len(),
        worlds: Folder::Worlds.entries(game).len(),
    }
}

fn jars(game: &Path) -> Vec<PathBuf> {
    jars_in(&game.join("mods"))
}

fn jars_in(dir: &Path) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(dir) else { return Vec::new() };
    read.flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("jar")))
        .collect()
}

#[derive(Clone)]
struct ModFile {
    name: String,
    sha512: String,
    /// Loader pour lequel le `.jar` est fait (« Fabric », « Forge »…), `None` s'il ne le dit pas.
    loader: Option<&'static str>,
}

struct Scan {
    source: Source,
    content: Content,
    mods: Vec<ModFile>,
}

/// Avancement de la recherche (évènement `import-scan`), pour l'animation de l'écran d'import.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum ScanEvent<'a> {
    /// Installation à reprendre trouvée ; ses `mods` vont être lus (empreintes).
    Installation { launcher: &'a str, name: &'a str, mods: usize },
    /// Empreintes envoyées à Modrinth pour reconnaître les mods.
    Identify { mods: usize },
}

/// Installations qui ont quelque chose à reprendre, hors dossiers du Clover Launcher lui-même.
/// `found` est appelé pour chacune, avant la lecture de ses mods (la partie lente). `known` : mods
/// déjà lus, remplacé par ceux de cette recherche (les fichiers disparus en sortent).
fn scan(home: &Path, data: &Path, clover: &Path, known: &mut HashMap<PathBuf, (Stamp, ModFile)>, found: &dyn Fn(&Source, usize)) -> Vec<Scan> {
    let clover = fs::canonicalize(clover).unwrap_or_else(|_| clover.to_path_buf());
    let mut seen = HashSet::new();
    let mut read = HashMap::new();
    let scans = sources(home, data)
        .into_iter()
        .filter(|source| {
            let dir = fs::canonicalize(&source.dir).unwrap_or_else(|_| source.dir.clone());
            !dir.starts_with(&clover) && seen.insert(dir)
        })
        .filter_map(|mut source| {
            let content = content(&source.dir);
            let jars = jars(&source.dir);
            if content == Content::default() && jars.is_empty() {
                return None;
            }
            found(&source, jars.len());
            let mods: Vec<ModFile> = jars
                .into_iter()
                .filter_map(|jar| {
                    let stamp = stamp(&jar)?;
                    let file = match known.remove(&jar) {
                        Some((before, file)) if before == stamp => file,
                        _ => ModFile { name: file_name(&jar), sha512: game::personal::sha512(&jar).ok()?, loader: game::personal::jar_loader(&jar) },
                    };
                    read.insert(jar, (stamp, file.clone()));
                    Some(file)
                })
                .collect();
            if source.game.minecraft.is_none() {
                if let Some(hint) = log_hint(&source.dir) {
                    // Le loader annoncé par l'autre launcher prime sur celui du journal.
                    if source.game.loader.is_some() {
                        source.game.minecraft = hint.minecraft;
                    } else {
                        source.game = hint;
                    }
                }
            }
            Some(Scan { source, content, mods })
        })
        .collect();
    *known = read;
    scans
}

/// Projet Modrinth d'un mod du catalogue, lu dans l'URL de son fichier
/// (`cdn.modrinth.com/data/<projet>/versions/…`).
fn catalogue_project(entry: &game::manifest::Mod) -> Option<&str> {
    entry.file.as_ref()?.url.strip_prefix("https://cdn.modrinth.com/data/")?.split('/').next()
}

// ── Copie ───────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum Task {
    Entry(Folder),
    /// Réglages d'un mod (`config/<entrée>`).
    Config,
    /// Mod copié dans « Mes mods ».
    Mod,
}

/// Copie dans `target` (dossier du jeu) et `personal` (« Mes mods ») ce qui est choisi ; `mods` :
/// fichiers de `source/mods` à reprendre. Chaque entrée arrive complète ou pas du tout : un import
/// interrompu se relance sans doublon, les entrées déjà présentes sont gardées.
fn import(source: &Path, target: &Path, personal: &Path, mods: &[String], choices: &Choices, progress: &dyn Fn(f64)) -> io::Result<Imported> {
    let mut imported = Imported::default();
    fs::create_dir_all(target)?;
    if choices.options && source.join("options.txt").is_file() {
        let destination = target.join("options.txt");
        if destination.is_file() {
            fs::copy(&destination, backup(&destination))?;
        }
        copy_atomically(&source.join("options.txt"), &destination, &mut |_| {})?;
        imported.copied.options = true;
    }
    if choices.servers {
        imported.copied.servers = merge_servers(&source.join("servers.dat"), &target.join("servers.dat"))?;
    }

    let folders = [
        (choices.resource_packs, Folder::ResourcePacks),
        (choices.shader_packs, Folder::ShaderPacks),
        (choices.screenshots, Folder::Screenshots),
        (choices.worlds, Folder::Worlds),
    ];
    let mut tasks = Vec::new();
    for (folder, entry) in folders.into_iter().filter(|(chosen, _)| *chosen).flat_map(|(_, folder)| folder.entries(source).into_iter().map(move |entry| (folder, entry))) {
        let destination = target.join(folder.name()).join(entry.file_name().unwrap_or_default());
        if destination.exists() {
            imported.kept += 1;
        } else {
            tasks.push((Task::Entry(folder), entry, destination));
        }
    }
    // Les réglages déjà présents chez Clover (un mod du catalogue déjà lancé) sont gardés.
    if choices.options {
        for entry in config_entries(source) {
            let destination = target.join("config").join(entry.file_name().unwrap_or_default());
            if !destination.exists() {
                tasks.push((Task::Config, entry, destination));
            }
        }
    }
    if choices.personal_mods {
        // Même mod Fabric sous un autre nom de fichier (autre version) : déjà dans « Mes mods ».
        let mut present: HashSet<String> = jars_in(personal).iter().filter_map(|jar| game::personal::fabric_id(jar)).collect();
        for name in mods {
            let (entry, destination) = (source.join("mods").join(name), personal.join(name));
            let fresh = game::personal::fabric_id(&entry).is_none_or(|id| present.insert(id));
            if !fresh || destination.exists() {
                imported.kept += 1;
            } else {
                tasks.push((Task::Mod, entry, destination));
            }
        }
    }

    let sized: Vec<_> = tasks
        .into_iter()
        .map(|(task, entry, destination)| {
            let bytes = size(&entry);
            (task, entry, destination, bytes)
        })
        .collect();
    let total = sized.iter().map(|(.., bytes)| bytes).sum::<u64>().max(1);
    let mut reported = 0;
    let mut report = |done: u64| {
        let percent = done * 100 / total;
        if percent != reported {
            reported = percent;
            progress(done as f64 / total as f64);
        }
    };
    let mut done = 0;
    for (task, entry, destination, bytes) in sized {
        fs::create_dir_all(destination.parent().unwrap_or(target))?;
        // Avancement fichier par fichier : un gros monde ne fige pas la barre jusqu'à sa fin.
        let mut copied = 0;
        copy_atomically(&entry, &destination, &mut |file| {
            copied += file;
            report(done + copied.min(bytes));
        })?;
        if task == Task::Entry(Folder::ShaderPacks) {
            let (settings, copy) = (with_suffix(&entry, ".txt"), with_suffix(&destination, ".txt"));
            if settings.is_file() && !copy.exists() {
                copy_atomically(&settings, &copy, &mut |_| {})?;
            }
        }
        match task {
            Task::Entry(Folder::ResourcePacks) => imported.copied.resource_packs += 1,
            Task::Entry(Folder::ShaderPacks) => imported.copied.shader_packs += 1,
            Task::Entry(Folder::Screenshots) => imported.copied.screenshots += 1,
            Task::Entry(Folder::Worlds) => imported.copied.worlds += 1,
            Task::Config => imported.copied.options = true,
            Task::Mod => imported.mods += 1,
        }
        // Taille mesurée avant la copie : `session.lock` et les liens, non copiés, y comptent.
        done += bytes;
        report(done);
    }
    Ok(imported)
}

/// Entrées de `config/` (fichiers et dossiers, sans lien), hors fichiers cachés.
fn config_entries(game: &Path) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(game.join("config")) else { return Vec::new() };
    let mut entries: Vec<PathBuf> = read
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file() || kind.is_dir()))
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        .map(|entry| entry.path())
        .collect();
    entries.sort();
    entries
}

/// Ajoute à la liste Clover les serveurs qu'elle n'a pas encore (même adresse) et renvoie leur
/// nombre. Une liste Clover illisible est gardée en `.bak` puis remplacée.
fn merge_servers(source: &Path, target: &Path) -> io::Result<usize> {
    let Ok(incoming) = fs::read(source) else { return Ok(0) };
    let Some(incoming) = servers_dat::entries(&incoming) else { return Ok(0) };
    let existing = fs::read(target).unwrap_or_default();
    let current = if existing.is_empty() {
        Vec::new()
    } else if let Some(current) = servers_dat::entries(&existing) {
        current
    } else {
        fs::copy(target, backup(target))?;
        Vec::new()
    };
    let mut known: HashSet<String> = current.iter().filter_map(|entry| servers_dat::address(entry)).collect();
    // Les entrées masquées ne servent qu'au jeu (connexions directes) : elles ne sont pas reprises.
    let added: Vec<&[u8]> = incoming
        .into_iter()
        .filter(|entry| !servers_dat::hidden(entry))
        .filter(|entry| servers_dat::address(entry).is_none_or(|address| known.insert(address)))
        .collect();
    if added.is_empty() {
        return Ok(0);
    }
    let merged: Vec<&[u8]> = current.into_iter().chain(added.iter().copied()).collect();
    write_atomically(target, &servers_dat::write(&merged))?;
    Ok(added.len())
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    name.into()
}

fn backup(path: &Path) -> PathBuf {
    with_suffix(path, ".bak")
}

/// Fichier ou dossier copié à côté sous un nom provisoire, puis renommé.
/// `copied` reçoit la taille de chaque fichier copié.
fn copy_atomically(source: &Path, destination: &Path, copied: &mut dyn FnMut(u64)) -> io::Result<()> {
    let temporary = destination.with_file_name(format!(".{}.clover-import", file_name(destination)));
    let _ = fs::remove_dir_all(&temporary);
    let _ = fs::remove_file(&temporary);
    let result = if source.is_dir() { copy_files(source, &temporary, copied) } else { fs::copy(source, &temporary).map(copied) };
    let result = result.and_then(|()| fs::rename(&temporary, destination));
    if result.is_err() {
        let _ = fs::remove_dir_all(&temporary);
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn write_atomically(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let temporary = with_suffix(path, ".tmp");
    fs::write(&temporary, bytes)?;
    fs::rename(temporary, path)
}

/// Copie récursive sans suivre les liens. `session.lock` (verrou d'un monde ouvert, inutile
/// ailleurs) est laissé de côté.
/// Copie récursive, sans les verrous de monde (`session.lock`) d'un jeu ouvert.
pub(crate) fn copy_tree(source: &Path, destination: &Path) -> io::Result<()> {
    copy_files(source, destination, &mut |_| {})
}

fn copy_files(source: &Path, destination: &Path, copied: &mut dyn FnMut(u64)) -> io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let to = destination.join(entry.file_name());
        if kind.is_dir() {
            copy_files(&entry.path(), &to, copied)?;
        } else if kind.is_file() && entry.file_name() != "session.lock" {
            copied(fs::copy(entry.path(), to)?);
        }
    }
    Ok(())
}

fn size(path: &Path) -> u64 {
    let Ok(metadata) = fs::symlink_metadata(path) else { return 0 };
    if !metadata.is_dir() {
        return metadata.len();
    }
    fs::read_dir(path).map(|read| read.flatten().map(|entry| size(&entry.path())).sum()).unwrap_or(0)
}

// ── Commandes ───────────────────────────────────────────────────────────────────

fn path_error(error: tauri::Error) -> String {
    format!("Dossier personnel introuvable : {error}")
}

/// Recherche les installations des autres launchers. Les mods sont identifiés sur Modrinth en une
/// requête ; sans réseau ni catalogue, ils sont tous proposés pour « Mes mods ». Ce que la
/// recherche précédente a déjà lu ou identifié n'est pas refait.
#[tauri::command]
pub async fn detect_installations(app: AppHandle, state: State<'_, AppState>, detected: State<'_, Detected>) -> Result<Vec<Installation>, String> {
    let home = app.path().home_dir().map_err(path_error)?;
    let data = app.path().data_dir().map_err(path_error)?;
    let root = state.root.clone();
    let handle = app.clone();
    let (mut known, mut projects) = {
        let mut cache = detected.0.lock().expect("import");
        (std::mem::take(&mut cache.mods), std::mem::take(&mut cache.projects))
    };
    let (scans, known) = tauri::async_runtime::spawn_blocking(move || {
        let scans = scan(&home, &data, &root, &mut known, &|source, mods| {
            let _ = handle.emit("import-scan", ScanEvent::Installation { launcher: source.launcher, name: &source.name, mods });
        });
        (scans, known)
    })
    .await
    .map_err(|e| e.to_string())?;

    let manifest = game::catalogue(&app).await.ok();
    let enabled: HashSet<String> = match (state.snapshot().settings.enabled_mods, &manifest) {
        (Some(mods), _) => mods.into_iter().collect(),
        (None, Some(manifest)) => manifest.default_mods(),
        (None, None) => HashSet::new(),
    };
    let by_project: HashMap<&str, &game::manifest::Mod> =
        manifest.iter().flat_map(|manifest| &manifest.mods).filter_map(|entry| Some((catalogue_project(entry)?, entry))).collect();
    let unknown: Vec<String> =
        scans.iter().flat_map(|scan| &scan.mods).map(|file| &file.sha512).filter(|hash| !projects.contains_key(*hash)).cloned().collect::<HashSet<_>>().into_iter().collect();
    if !unknown.is_empty() && !by_project.is_empty() {
        let _ = app.emit("import-scan", ScanEvent::Identify { mods: unknown.len() });
        match game::modrinth::identify(&game::download::client(), unknown.clone()).await {
            Ok(mut identified) => {
                for hash in unknown {
                    let project = identified.remove(&hash).map(|version| version.project_id);
                    projects.insert(hash, project);
                }
            }
            Err(e) => eprintln!("[import] Modrinth injoignable pour identifier les mods : {e}"),
        }
    }

    let mut dirs = Vec::new();
    let mut installations = Vec::new();
    for Scan { source, content, mods } in scans {
        let mut catalogue_mods: Vec<CatalogueMod> = Vec::new();
        let (mut personal, mut other_mods) = (Vec::new(), Vec::new());
        for file in &mods {
            match projects.get(&file.sha512).and_then(Option::as_deref).and_then(|project| by_project.get(project)) {
                // Dépendance cachée, mod indisponible ou déjà activé : rien à proposer.
                Some(entry) if entry.hidden || !entry.available || enabled.contains(&entry.id) => {}
                Some(entry) if catalogue_mods.iter().any(|known| known.id == entry.id) => {}
                Some(entry) => catalogue_mods.push(CatalogueMod { id: entry.id.clone(), name: entry.name.clone() }),
                None if file.loader == Some("Fabric") => personal.push(file.name.clone()),
                None => other_mods.push(file.name.trim_end_matches(".jar").to_owned()),
            }
        }
        personal.sort_by_key(|name| name.to_lowercase());
        other_mods.sort_by_key(|name| name.to_lowercase());
        let mut loader_mods: Vec<String> =
            mods.iter().filter(|file| file.loader.is_some() && file.loader == source.game.loader.as_deref()).map(|file| file.name.clone()).collect();
        loader_mods.sort_by_key(|name| name.to_lowercase());
        let path = source.dir.to_string_lossy().into_owned();
        let catalogue = catalogue_mods.iter().map(|entry| entry.id.clone()).collect();
        dirs.push(Found {
            dir: source.dir,
            name: source.name.clone(),
            game: source.game.clone(),
            personal: personal.clone(),
            catalogue,
            loader_mods: loader_mods.clone(),
        });
        installations.push(Installation {
            id: path.clone(),
            launcher: source.launcher,
            name: source.name,
            minecraft: source.game.minecraft,
            loader: source.game.loader,
            path,
            content,
            loader_version: source.game.loader_version,
            catalogue_mods,
            personal_mods: personal.iter().map(|name| name.trim_end_matches(".jar").to_owned()).collect(),
            other_mods,
            loader_mods: loader_mods.iter().map(|name| name.trim_end_matches(".jar").to_owned()).collect(),
        });
    }
    *detected.0.lock().expect("import") = Cache { installations: dirs, mods: known, projects };
    Ok(installations)
}

/// Copie les éléments choisis d'une installation détectée dans le dossier et « Mes mods » de
/// l'instance Clover intégrée ; les mods copiés sont activés, comme un mod ajouté à la main, et
/// leurs dépendances obligatoires manquantes sont téléchargées. Refusé tant qu'un jeu lancé par
/// Clover est ouvert : il réécrirait ces fichiers en quittant. Avancement : évènement
/// `import-progress` (0 à 1).
fn found(detected: &Detected, id: &str) -> Result<Found, String> {
    detected.0.lock().expect("import").installations.iter().find(|found| found.dir.to_string_lossy() == id).cloned().ok_or_else(|| "Installation introuvable : relance la recherche.".into())
}

/// Type d'instance Clover pour le loader d'une installation : l'import reprend Vanilla, Fabric,
/// Forge et NeoForge.
fn instance_kind(loader: Option<&str>) -> Result<instances::Kind, String> {
    let Some(loader) = loader else { return Ok(instances::Kind::Vanilla) };
    match loader.to_ascii_lowercase().as_str() {
        "fabric" => Ok(instances::Kind::Fabric),
        "forge" => Ok(instances::Kind::Forge),
        "neoforge" => Ok(instances::Kind::NeoForge),
        _ => Err(format!("Instance {loader} : l'import reprend Vanilla, Fabric, Forge et NeoForge. Crée une instance à la main puis ajoute-y ses mods.")),
    }
}

/// Version du loader d'une nouvelle instance : celle de l'autre launcher si elle est encore publiée
/// (les anciennes de Forge portent un suffixe : `11.15.1.2318-1.8.9`), sinon la première proposée.
fn pick_loader(versions: &[String], wanted: Option<&str>) -> Option<String> {
    wanted
        .and_then(|wanted| versions.iter().find(|version| *version == wanted || version.strip_prefix(wanted).is_some_and(|rest| rest.starts_with('-'))))
        .or(versions.first())
        .cloned()
}

/// Crée une instance personnelle à partir d'une installation détectée : même version de Minecraft
/// et du loader (la proposée d'abord si la sienne n'est plus publiée), dossier séparé, puis copie
/// des éléments choisis ; les mods faits pour son loader vont dans les mods de l'instance, avec
/// leurs dépendances obligatoires. Aucun jeu ne tourne dans ce nouveau dossier : possible même
/// pendant une partie. Renvoie son identifiant.
#[tauri::command]
pub async fn import_as_instance(id: String, choices: Choices, app: AppHandle, state: State<'_, AppState>, detected: State<'_, Detected>) -> Result<String, String> {
    let found = found(&detected, &id)?;
    let kind = instance_kind(found.game.loader.as_deref())?;
    let minecraft = found.game.minecraft.clone().ok_or("Version de Minecraft inconnue pour cette installation : crée l'instance à la main.")?;
    let mod_loader = kind.mod_loader();
    let loader = match mod_loader {
        Some(_) => {
            let versions = instances::kind_loaders(&state.root, kind, &minecraft).await.map_err(|e| e.to_string())?;
            let label = found.game.loader.as_deref().unwrap_or_default();
            Some(pick_loader(&versions, found.game.loader_version.as_deref()).ok_or_else(|| format!("Aucune version de {label} pour Minecraft {minecraft}."))?)
        }
        None => None,
    };
    let name: String = found.name.trim().chars().take(64).collect();
    let mut input = instances::InstanceInput { name: if name.is_empty() { "Instance importée".into() } else { name }, kind, minecraft: Some(minecraft.clone()), loader, separate: true, memory_mb: None };
    instances::validate_input(&state.root, &mut input).await.map_err(|e| format!("{} : {e}", found.name))?;
    let instance = instances::Instance {
        id: format!("instance-{:032x}", rand::random::<u128>()),
        name: input.name,
        kind,
        minecraft: input.minecraft,
        loader: input.loader,
        separate: true,
        ..instances::Instance::builtin()
    };
    let paths = instances::paths(game::Paths::new(&app).map_err(|e| e.to_string())?, &instance).map_err(|e| e.to_string())?;
    let mods = if mod_loader.is_some() && choices.personal_mods { found.loader_mods.clone() } else { vec![] };
    let handle = app.clone();
    let (source, game_dir, personal, copied) = (found.dir.clone(), paths.game.clone(), paths.personal_mods.clone(), mods.clone());
    let result = tauri::async_runtime::spawn_blocking(move || {
        import(&source, &game_dir, &personal, &copied, &choices, &|ratio| {
            let _ = handle.emit("import-progress", ratio);
        })
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Err(e) = result {
        let _ = fs::remove_dir_all(state.root.join("instances").join(&instance.id));
        return Err(format!("Copie interrompue : {e}"));
    }
    if let Some(mod_loader) = mod_loader.filter(|_| !mods.is_empty()) {
        if let Err(e) = game::personal::install_dependencies(&game::download::client(), &paths.personal_mods, &mods, &minecraft, mod_loader, &[]).await {
            eprintln!("[import] dépendances non vérifiées : {e}");
        }
    }
    let id = instance.id.clone();
    state.update(|stored| {
        stored.instances.push(instance);
        stored.selected_instance = Some(id.clone());
    })?;
    Ok(id)
}

#[tauri::command]
pub async fn import_installation(id: String, choices: Choices, app: AppHandle, state: State<'_, AppState>, detected: State<'_, Detected>) -> Result<Imported, String> {
    const GAME_OPEN: &str = "Ferme Minecraft avant d'importer : le jeu réécrirait ces fichiers en quittant.";
    let found = found(&detected, &id)?;
    let gate = app.state::<crate::LaunchGate>();
    let _guard = gate.0.try_lock().map_err(|_| GAME_OPEN)?;
    if app.state::<game::games::Games>().any_running() || instances::managed_game_running(&state.root) {
        return Err(GAME_OPEN.into());
    }
    let paths = instances::paths(game::Paths::new(&app).map_err(|e| e.to_string())?, &instances::Instance::builtin()).map_err(|e| e.to_string())?;
    let handle = app.clone();
    let (game_dir, personal, mods) = (paths.game.clone(), paths.personal_mods.clone(), found.personal.clone());
    let copy_mods = choices.personal_mods;
    let activate = choices.mods;
    let mut imported = tauri::async_runtime::spawn_blocking(move || {
        import(&found.dir, &game_dir, &personal, &mods, &choices, &|ratio| {
            let _ = handle.emit("import-progress", ratio);
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Copie interrompue : {e}"))?;

    // Les dépendances restées dans l'autre launcher (souvent des mods du catalogue cachés, comme
    // Fabric API) : la sélection Clover, avec les mods que l'interface va activer, les fournit déjà.
    if copy_mods && !found.personal.is_empty() {
        let manifest = game::catalogue(&app).await.map_err(|e| e.to_string())?;
        let mut enabled: HashSet<String> = state.snapshot().settings.enabled_mods.map_or_else(|| manifest.default_mods(), |mods| mods.into_iter().collect());
        if activate {
            enabled.extend(found.catalogue.iter().cloned());
        }
        let provided: Vec<String> = manifest.mods_to_install(&enabled).into_iter().filter_map(|entry| entry.file.as_ref().map(|file| file.sha512.clone())).collect();
        match game::personal::install_dependencies(&game::download::client(), &paths.personal_mods, &found.personal, &manifest.minecraft.version, game::personal::ModLoader::Fabric, &provided).await {
            Ok(resolved) => {
                imported.dependencies = resolved.added.len();
                imported.missing_dependencies = resolved.missing.len();
            }
            Err(e) => {
                eprintln!("[import] dépendances non vérifiées : {e}");
                imported.dependencies_unchecked = true;
            }
        }
    }
    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("clover-import-{name}-{}", rand::random::<u64>()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path, bytes: impl AsRef<[u8]>) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }

    /// Entrée de `servers.dat` : `name`, `ip`, et `hidden` si demandé.
    fn server(name: &str, ip: &str, hidden: bool) -> Vec<u8> {
        let mut out = Vec::new();
        for (key, value) in [("name", name), ("ip", ip)] {
            out.push(8);
            out.extend_from_slice(&(key.len() as u16).to_be_bytes());
            out.extend_from_slice(key.as_bytes());
            out.extend_from_slice(&(value.len() as u16).to_be_bytes());
            out.extend_from_slice(value.as_bytes());
        }
        if hidden {
            out.extend_from_slice(&[1, 0, 6]);
            out.extend_from_slice(b"hidden");
            out.push(1);
        }
        out.push(0);
        out
    }

    /// `.jar` Fabric minimal (`fabric.mod.json` avec son identifiant), ou d'un autre loader.
    fn jar(fabric_id: Option<&str>) -> Vec<u8> {
        use std::io::Write;
        let mut writer = zip::ZipWriter::new(io::Cursor::new(Vec::new()));
        let (name, body) = match fabric_id {
            Some(id) => ("fabric.mod.json", format!(r#"{{"id":"{id}","version":"1.0.0"}}"#)),
            None => ("META-INF/mods.toml", String::new()),
        };
        writer.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
        writer.write_all(body.as_bytes()).unwrap();
        writer.finish().unwrap().into_inner()
    }

    fn servers_dat(entries: &[Vec<u8>]) -> Vec<u8> {
        servers_dat::write(&entries.iter().map(Vec::as_slice).collect::<Vec<_>>())
    }

    #[test]
    fn version_ids_of_the_official_launcher() {
        assert_eq!(parse_version_id("1.21.4"), Game::new(Some("1.21.4"), None, None));
        assert_eq!(parse_version_id("fabric-loader-0.16.10-1.21.4"), Game::new(Some("1.21.4"), Some("Fabric"), Some("0.16.10")));
        assert_eq!(parse_version_id("fabric-loader-0.19.5-26.2-rc-2"), Game::new(Some("26.2-rc-2"), Some("Fabric"), Some("0.19.5")));
        assert_eq!(parse_version_id("quilt-loader-0.26.0-1.20.1"), Game::new(Some("1.20.1"), Some("Quilt"), Some("0.26.0")));
        assert_eq!(parse_version_id("1.20.1-forge-47.2.0"), Game::new(Some("1.20.1"), Some("Forge"), Some("47.2.0")));
        assert_eq!(parse_version_id("neoforge-21.1.77"), Game::new(Some("1.21.1"), Some("NeoForge"), Some("21.1.77")));
        assert_eq!(parse_version_id("latest-release"), Game::default());
    }

    #[test]
    fn forge_and_neoforge_versions_from_the_game_log() {
        let dir = temp("log-hint");
        let log = dir.join("logs/latest.log");
        write(&log, "[main/INFO] [cpw.mods.modlauncher.Launcher/MODLAUNCHER]: ModLauncher running: args [--username, Joueur, --version, 1.20.1-forge-47.2.0, --accessToken, ❄❄❄❄❄❄❄❄, --launchTarget, forgeclient, --fml.forgeVersion, 47.2.0, --fml.mcVersion, 1.20.1, --fml.forgeGroup, net.minecraftforge, --fml.mcpVersion, 20230612.114412]\n");
        assert_eq!(log_hint(&dir), Some(Game::new(Some("1.20.1"), Some("Forge"), Some("47.2.0"))));
        write(&log, "ModLauncher running: args [--fml.neoForgeVersion, 21.1.77, --fml.fmlVersion, 4.0.24, --fml.mcVersion, 1.21.1, --fml.neoFormVersion, 20240808.144430]\n");
        assert_eq!(log_hint(&dir), Some(Game::new(Some("1.21.1"), Some("NeoForge"), Some("21.1.77"))));
        write(&log, "[19:44:37] [main/INFO]: Loading Minecraft 26.2 with Fabric Loader 0.19.5\n");
        assert_eq!(log_hint(&dir), Some(Game::new(Some("26.2"), Some("Fabric"), Some("0.19.5"))));
        write(&log, "[19:44:37] [main/INFO]: Setting user: Joueur\n");
        assert_eq!(log_hint(&dir), None);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn new_instances_keep_the_loader_version_while_it_is_published() {
        let versions = ["47.4.0", "47.2.0", "11.15.1.2318-1.8.9"].map(str::to_owned);
        assert_eq!(pick_loader(&versions, Some("47.2.0")).as_deref(), Some("47.2.0"));
        assert_eq!(pick_loader(&versions, Some("11.15.1.2318")).as_deref(), Some("11.15.1.2318-1.8.9"));
        assert_eq!(pick_loader(&versions, Some("47.1.0")).as_deref(), Some("47.4.0"));
        assert_eq!(pick_loader(&versions, None).as_deref(), Some("47.4.0"));
        assert_eq!(pick_loader(&[], Some("47.2.0")), None);
        assert_eq!(instance_kind(Some("NeoForge")), Ok(instances::Kind::NeoForge));
        assert!(instance_kind(Some("Quilt")).is_err());
    }

    #[test]
    fn servers_are_counted_merged_and_deduplicated() {
        let source = temp("servers-source");
        let target = temp("servers-target");
        write(&source.join("servers.dat"), servers_dat(&[server("Hypixel", "mc.hypixel.net", false), server("Clover", "PLAY.clovergames.fr", false), server("", "1.2.3.4", true)]));
        write(&target.join("servers.dat"), servers_dat(&[server("Clover Games", "play.clovergames.fr", false)]));
        assert_eq!(content(&source).servers, 2);

        assert_eq!(merge_servers(&source.join("servers.dat"), &target.join("servers.dat")).unwrap(), 1);
        let merged = fs::read(target.join("servers.dat")).unwrap();
        let entries = servers_dat::entries(&merged).unwrap();
        let addresses: Vec<_> = entries.iter().filter_map(|entry| servers_dat::address(entry)).collect();
        assert_eq!(addresses, ["play.clovergames.fr", "mc.hypixel.net"]);
        // Relancé, l'import n'ajoute rien.
        assert_eq!(merge_servers(&source.join("servers.dat"), &target.join("servers.dat")).unwrap(), 0);
        assert!(servers_dat::entries(b"\x0a\x00\x00\x09\x00").is_none());
    }

    #[test]
    fn detects_each_launcher_without_reading_accounts() {
        let home = temp("home");
        let data = home.join("data");
        let official = if cfg!(windows) { data.join(".minecraft") } else if cfg!(target_os = "macos") { data.join("minecraft") } else { home.join(".minecraft") };
        let custom = home.join("pvp");
        let profiles = serde_json::json!({ "profiles": {
            "a": { "name": "", "lastVersionId": "latest-release", "lastUsed": "2026-01-01T00:00:00.000Z" },
            "b": { "name": "PvP", "lastVersionId": "fabric-loader-0.16.10-1.21.4", "gameDir": custom, "lastUsed": "2026-02-01T00:00:00.000Z" },
        }});
        write(&official.join("launcher_profiles.json"), profiles.to_string());
        write(&official.join("options.txt"), "version:4903\n");
        write(&official.join("logs/latest.log"), "[19:44:37] [main/INFO]: Loading Minecraft 26.2 with Fabric Loader 0.19.5\n");
        write(&custom.join("saves/Monde/level.dat"), "x");
        write(&custom.join("shaderpacks/Complementary.zip"), "x");
        write(&custom.join("shaderpacks/Complementary.zip.txt"), "x");

        write(&data.join("ModrinthApp/profiles/Fabulously Optimized/mods/sodium.jar"), jar(Some("sodium")));
        write(&data.join("ModrinthApp/profiles/Fabulously Optimized/mods/create.jar"), jar(None));
        write(&data.join("ModrinthApp/profiles/Empty/logs/latest.log"), "");

        let prism = data.join("PrismLauncher/instances/skyblock");
        write(&prism.join("instance.cfg"), "[General]\nname=Skyblock\n");
        write(&prism.join("mmc-pack.json"), r#"{"components":[{"uid":"net.minecraft","version":"1.20.1"},{"uid":"net.fabricmc.fabric-loader","version":"0.15.0"}]}"#);
        write(&prism.join(".minecraft/screenshots/a.png"), "x");
        write(&prism.join(".minecraft/screenshots/notes.txt"), "x");
        write(&data.join("PrismLauncher/instances/_MMC_TEMP/instance.cfg"), "name=temp");

        let curse = home.join("curseforge/minecraft/Instances/All the Mods");
        write(&curse.join("minecraftinstance.json"), r#"{"name":"All the Mods","gameVersion":"1.21.1","baseModLoader":{"name":"neoforge-21.1.77"}}"#);
        write(&curse.join("resourcepacks/Faithful.zip"), "x");

        let clover = home.join(".cloverlauncher");
        let announced = Mutex::new(Vec::new());
        let mut known = HashMap::new();
        let found = scan(&home, &data, &clover, &mut known, &|source, mods| announced.lock().unwrap().push((source.name.clone(), mods)));
        // Annoncées avant la lecture des mods ; « Empty » (journal seul) ne l'est pas.
        let announced = announced.into_inner().unwrap();
        assert_eq!(announced.len(), found.len());
        assert!(announced.contains(&("Fabulously Optimized".into(), 2)));
        let summary: Vec<_> = found.iter().map(|scan| (scan.source.launcher, scan.source.name.as_str(), scan.source.game.clone())).collect();
        assert_eq!(
            summary,
            [
                ("Launcher officiel", "Installation par défaut", Game::new(Some("26.2"), Some("Fabric"), Some("0.19.5"))),
                ("Launcher officiel", "PvP", Game::new(Some("1.21.4"), Some("Fabric"), Some("0.16.10"))),
                ("Modrinth App", "Fabulously Optimized", Game::default()),
                ("Prism Launcher", "Skyblock", Game::new(Some("1.20.1"), Some("Fabric"), Some("0.15.0"))),
                ("CurseForge", "All the Mods", Game::new(Some("1.21.1"), Some("NeoForge"), Some("21.1.77"))),
            ]
        );
        assert_eq!(found[1].content, Content { worlds: 1, shader_packs: 1, ..Content::default() });
        let loaders: Vec<_> = found[2].mods.iter().map(|file| (file.name.as_str(), file.loader)).collect();
        assert_eq!(loaders.len(), 2);
        assert!(loaders.contains(&("sodium.jar", Some("Fabric"))) && loaders.contains(&("create.jar", Some("Forge"))));
        assert_eq!(found[3].content.screenshots, 1);

        // Nouvelle recherche : un mod inchangé n'est pas relu (empreinte gardée), un ajout l'est et
        // un fichier retiré sort du cache.
        let modrinth = data.join("ModrinthApp/profiles/Fabulously Optimized/mods");
        let sodium = modrinth.join("sodium.jar");
        let entry = known.get_mut(&sodium).unwrap();
        entry.1.sha512 = "gardée".into();
        write(&modrinth.join("lithium.jar"), jar(Some("lithium")));
        fs::remove_file(modrinth.join("create.jar")).unwrap();
        let again = scan(&home, &data, &clover, &mut known, &|_, _| {});
        let hashes: HashMap<_, _> = again[2].mods.iter().map(|file| (file.name.as_str(), file.sha512.as_str())).collect();
        assert_eq!(hashes["sodium.jar"], "gardée");
        assert_eq!(hashes["lithium.jar"].len(), 128);
        assert_eq!(known.len(), 2);
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn import_copies_whole_entries_and_keeps_existing_ones() {
        let source = temp("import-source");
        let target = temp("import-target");
        write(&source.join("options.txt"), "fov:0.5\n");
        write(&source.join("saves/Monde/level.dat"), "nouveau");
        write(&source.join("saves/Monde/session.lock"), "verrou");
        write(&source.join("saves/Monde/region/r.0.0.mca"), "région");
        write(&source.join("saves/Ancien/level.dat"), "importé");
        write(&source.join("shaderpacks/Complementary.zip"), "shader");
        write(&source.join("shaderpacks/Complementary.zip.txt"), "réglages");
        write(&source.join("screenshots/a.png"), "capture");
        write(&source.join("config/zoomify.json"), "{\"zoom\":4}");
        write(&source.join("config/sodium-options.json"), "importé");
        write(&source.join("config/xaero/minimap.txt"), "carte");
        write(&source.join("mods/zoomify.jar"), jar(Some("zoomify")));
        write(&source.join("mods/xaero-1.2.jar"), jar(Some("xaerominimap")));
        write(&source.join("mods/appleskin.jar"), jar(Some("appleskin")));
        write(&target.join("options.txt"), "fov:0.0\n");
        write(&target.join("saves/Ancien/level.dat"), "Clover");
        write(&target.join("config/sodium-options.json"), "Clover");
        let personal = target.join("personal-mods");
        write(&personal.join("xaero-1.0.jar"), jar(Some("xaerominimap")));
        write(&personal.join("appleskin.jar"), jar(Some("appleskin")));

        let choices = Choices { options: true, mods: true, personal_mods: true, servers: true, resource_packs: true, shader_packs: true, screenshots: false, worlds: true };
        let mods = ["zoomify.jar", "xaero-1.2.jar", "appleskin.jar"].map(str::to_owned);
        let ratios = Mutex::new(Vec::new());
        let imported = import(&source, &target, &personal, &mods, &choices, &|ratio| ratios.lock().unwrap().push(ratio)).unwrap();

        assert_eq!(imported.copied, Content { options: true, worlds: 1, shader_packs: 1, ..Content::default() });
        // Monde « Ancien », Xaero (autre version déjà là) et AppleSkin (même fichier).
        assert_eq!(imported.kept, 3);
        assert_eq!(imported.mods, 1);
        assert!(personal.join("zoomify.jar").is_file() && !personal.join("xaero-1.2.jar").exists());
        assert_eq!(fs::read_to_string(target.join("config/zoomify.json")).unwrap(), "{\"zoom\":4}");
        assert_eq!(fs::read_to_string(target.join("config/xaero/minimap.txt")).unwrap(), "carte");
        assert_eq!(fs::read_to_string(target.join("config/sodium-options.json")).unwrap(), "Clover");
        assert_eq!(fs::read_to_string(target.join("options.txt")).unwrap(), "fov:0.5\n");
        assert_eq!(fs::read_to_string(target.join("options.txt.bak")).unwrap(), "fov:0.0\n");
        assert_eq!(fs::read_to_string(target.join("saves/Ancien/level.dat")).unwrap(), "Clover");
        assert_eq!(fs::read_to_string(target.join("saves/Monde/region/r.0.0.mca")).unwrap(), "région");
        assert!(!target.join("saves/Monde/session.lock").exists());
        assert_eq!(fs::read_to_string(target.join("shaderpacks/Complementary.zip.txt")).unwrap(), "réglages");
        assert!(!target.join("screenshots").exists());
        assert!(fs::read_dir(target.join("saves")).unwrap().flatten().all(|entry| !entry.file_name().to_string_lossy().starts_with('.')));
        let ratios = ratios.into_inner().unwrap();
        assert!(ratios.windows(2).all(|pair| pair[0] < pair[1]), "avancement non croissant : {ratios:?}");
        assert_eq!(ratios.last().copied(), Some(1.0));
        // Les fichiers de l'autre launcher sont intacts.
        assert_eq!(fs::read_to_string(source.join("saves/Monde/session.lock")).unwrap(), "verrou");
        fs::remove_dir_all(source).unwrap();
        fs::remove_dir_all(target).unwrap();
    }
}
