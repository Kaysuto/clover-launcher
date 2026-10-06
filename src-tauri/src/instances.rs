//! Instances persistées ; téléchargements mutualisés, données de jeu et mods résolus ici.
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::{game, AppState};
use game::{GameError, Paths};

pub const BUILTIN: &str = "clover";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Clover,
    Vanilla,
    Fabric,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub minecraft: Option<String>,
    pub loader: Option<String>,
    #[serde(default)]
    pub separate: bool,
    pub memory_mb: Option<u64>,
    #[serde(default)]
    pub disabled_mods: Vec<String>,
    pub enabled_mods: Option<Vec<String>>,
    pub last_played: Option<u64>,
}

impl Instance {
    pub fn builtin() -> Self {
        Self {
            id: BUILTIN.into(),
            name: "Clover Games".into(),
            kind: Kind::Clover,
            minecraft: None,
            loader: None,
            separate: false,
            memory_mb: None,
            disabled_mods: vec![],
            enabled_mods: None,
            last_played: None,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceInput {
    pub name: String,
    pub kind: Kind,
    pub minecraft: Option<String>,
    pub loader: Option<String>,
    pub separate: bool,
    pub memory_mb: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    #[serde(flatten)]
    pub instance: Instance,
    pub game_dir: String,
    pub installed: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameVersion {
    pub id: String,
    pub snapshot: bool,
    pub released: String,
}

pub fn validate_version_id(id: &str) -> game::Result<()> {
    if id.is_empty()
        || id.len() > 100
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'_'))
        || id.starts_with('.')
    {
        return Err(GameError::InvalidVersion(
            "identifiant de version invalide".into(),
        ));
    }
    Ok(())
}

fn validate_instance_id(id: &str) -> game::Result<()> {
    if id == BUILTIN
        || id
            .strip_prefix("instance-")
            .is_some_and(|tail| tail.len() == 32 && tail.bytes().all(|c| c.is_ascii_hexdigit()))
    {
        return Ok(());
    }
    Err(GameError::InvalidVersion(
        "identifiant d'instance invalide".into(),
    ))
}

pub fn resolve(stored: &crate::store::Stored, id: Option<&str>) -> game::Result<Instance> {
    let id = id
        .or(stored.selected_instance.as_deref())
        .unwrap_or(BUILTIN);
    validate_instance_id(id)?;
    if id == BUILTIN {
        return Ok(Instance::builtin());
    }
    stored
        .instances
        .iter()
        .find(|entry| entry.id == id)
        .cloned()
        .ok_or_else(|| GameError::InvalidVersion("instance introuvable".into()))
}

pub fn paths(mut paths: Paths, instance: &Instance) -> game::Result<Paths> {
    validate_instance_id(&instance.id)?;
    if instance.id != BUILTIN {
        let dir = paths.root.join("instances").join(&instance.id);
        if instance.separate {
            paths.game = dir.join("game");
        }
        paths.personal_mods = dir.join("personal-mods");
        paths.logs = dir.join("logs");
        paths.game_output = paths.logs.join("game-output.log");
        paths.quick_play_log = dir.join("quick-play.json");
    }
    paths.mods = paths.game.join("mods");
    Ok(paths)
}

/// Le launcher peut avoir été fermé tandis que Java continue : la console seule ne suffit pas.
pub fn managed_game_running(root: &std::path::Path) -> bool {
    let system = sysinfo::System::new_all();
    system.processes().values().any(|process| {
        process.exe().is_some_and(|exe| {
            let name = exe.file_stem().unwrap_or_default().to_string_lossy();
            (name.eq_ignore_ascii_case("java") || name.eq_ignore_ascii_case("javaw"))
                && exe.starts_with(root.join("runtimes"))
        })
    })
}

pub async fn versions(root: &std::path::Path) -> game::Result<Vec<GameVersion>> {
    let cache = root.join("instance-versions.json");
    match game::install::version_manifest(&game::download::client()).await {
        Ok(index) => {
            let versions: Vec<_> = index
                .versions
                .into_iter()
                .filter(|entry| {
                    matches!(entry.kind.as_str(), "release" | "snapshot")
                        && (entry.release_time.as_str() >= "2023-06-07" || matches!(entry.id.as_str(), "1.8.9" | "1.12.2" | "1.16.5" | "1.17.1" | "1.18.2" | "1.19.4"))
                })
                .filter(|entry| validate_version_id(&entry.id).is_ok())
                .map(|entry| GameVersion {
                    id: entry.id,
                    snapshot: entry.kind == "snapshot",
                    released: entry.release_time,
                })
                .collect();
            std::fs::create_dir_all(root)?;
            std::fs::write(cache, serde_json::to_vec(&versions)?)?;
            Ok(versions)
        }
        Err(error) => std::fs::read(cache)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .ok_or(error),
    }
}

#[derive(Deserialize)]
struct FabricEntry {
    loader: FabricLoader,
}
#[derive(Deserialize)]
struct FabricLoader {
    version: String,
    stable: bool,
}

pub async fn loaders(root: &std::path::Path, minecraft: &str) -> game::Result<Vec<String>> {
    validate_version_id(minecraft)?;
    let cache = root
        .join("versions")
        .join(format!("fabric-loaders-{minecraft}.json"));
    let response = async {
        let entries: Vec<FabricEntry> = game::download::client()
            .get(format!(
                "https://meta.fabricmc.net/v2/versions/loader/{minecraft}"
            ))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok::<_, GameError>(
            entries
                .into_iter()
                .filter(|entry| entry.loader.stable)
                .map(|entry| entry.loader.version)
                .filter(|id| validate_version_id(id).is_ok())
                .collect::<Vec<_>>(),
        )
    }
    .await;
    match response {
        Ok(loaders) => {
            std::fs::create_dir_all(cache.parent().expect("versions"))?;
            std::fs::write(cache, serde_json::to_vec(&loaders)?)?;
            Ok(loaders)
        }
        Err(error) => std::fs::read(cache)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .ok_or(error),
    }
}

async fn validate_input(root: &std::path::Path, input: &mut InstanceInput) -> game::Result<()> {
    input.name = input.name.trim().to_owned();
    if input.name.is_empty()
        || input.name.chars().count() > 64
        || input.name.chars().any(char::is_control)
    {
        return Err(GameError::InvalidVersion(
            "choisis un nom de 1 à 64 caractères".into(),
        ));
    }
    if input
        .memory_mb
        .is_some_and(|mb| !(1024..=65536).contains(&mb))
    {
        return Err(GameError::InvalidVersion(
            "mémoire comprise entre 1 et 64 Go".into(),
        ));
    }
    if input.kind == Kind::Clover {
        input.minecraft = None;
        input.loader = None;
        return Ok(());
    }
    let minecraft = input
        .minecraft
        .as_deref()
        .ok_or_else(|| GameError::InvalidVersion("choisis une version Minecraft".into()))?;
    validate_version_id(minecraft)?;
    if !versions(root)
        .await?
        .iter()
        .any(|entry| entry.id == minecraft)
    {
        return Err(GameError::InvalidVersion(
            "version non prise en charge".into(),
        ));
    }
    if input.kind == Kind::Fabric {
        let loader = input
            .loader
            .as_deref()
            .ok_or_else(|| GameError::InvalidVersion("choisis une version Fabric".into()))?;
        if !loaders(root, minecraft)
            .await?
            .iter()
            .any(|version| version == loader)
        {
            return Err(GameError::InvalidVersion(
                "loader Fabric incompatible".into(),
            ));
        }
    } else {
        input.loader = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_instances(
    app: AppHandle,
    state: State<'_, AppState>,
) -> game::Result<Vec<Entry>> {
    let stored = state.snapshot();
    let manifest = game::catalogue(&app).await.ok();
    let mut builtin = Instance::builtin();
    builtin.last_played = stored.clover_last_played;
    std::iter::once(builtin)
        .chain(stored.instances)
        .map(|mut instance| {
            let paths = paths(Paths::new(&app)?, &instance)?;
            if instance.kind == Kind::Clover {
                instance.minecraft = manifest.as_ref().map(|m| m.minecraft.version.clone());
                instance.loader = manifest.as_ref().map(|m| m.fabric.loader.clone());
            }
            let installed = instance
                .minecraft
                .as_ref()
                .is_some_and(|id| paths.versions.join(id).join(format!("{id}.jar")).is_file());
            Ok(Entry {
                instance,
                installed,
                game_dir: paths.game.to_string_lossy().into_owned(),
            })
        })
        .collect()
}

/// Octets à télécharger avant de jouer à `minecraft` (annoncés à la création d'une instance).
#[tauri::command]
pub async fn download_size(minecraft: String, app: AppHandle) -> game::Result<u64> {
    game::install::download_size(&game::download::client(), &Paths::new(&app)?, &minecraft).await
}

#[tauri::command]
pub async fn instance_versions(state: State<'_, AppState>) -> game::Result<Vec<GameVersion>> {
    versions(&state.root).await
}

#[tauri::command]
pub async fn fabric_loaders(
    minecraft: String,
    state: State<'_, AppState>,
) -> game::Result<Vec<String>> {
    loaders(&state.root, &minecraft).await
}

#[tauri::command]
pub async fn save_instance(
    id: Option<String>,
    mut input: InstanceInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if id.as_deref() == Some(BUILTIN) {
        return Err("L'instance Clover intégrée se règle dans les paramètres du launcher.".into());
    }
    validate_input(&state.root, &mut input)
        .await
        .map_err(|e| e.to_string())?;
    let mut instance = match id {
        Some(ref id) => resolve(&state.snapshot(), Some(id)).map_err(|e| e.to_string())?,
        None => Instance {
            id: format!("instance-{:032x}", rand::random::<u128>()),
            ..Instance::builtin()
        },
    };
    instance.name = input.name;
    instance.kind = input.kind;
    instance.minecraft = input.minecraft;
    instance.loader = input.loader;
    instance.separate = input.separate;
    instance.memory_mb = input.memory_mb;
    let id = instance.id.clone();
    state.update(|stored| {
        if let Some(existing) = stored
            .instances
            .iter_mut()
            .find(|existing| existing.id == id)
        {
            *existing = instance;
        } else {
            stored.instances.push(instance);
        }
        stored.selected_instance = Some(id.clone());
    })?;
    Ok(id)
}

#[tauri::command]
pub fn select_instance(id: String, state: State<'_, AppState>) -> Result<(), String> {
    resolve(&state.snapshot(), Some(&id)).map_err(|e| e.to_string())?;
    state.update(|stored| stored.selected_instance = Some(id))
}

#[tauri::command]
pub fn set_instances_view(expert: bool, state: State<'_, AppState>) -> Result<(), String> {
    state.update(|stored| stored.expert_instances = expert)
}

#[tauri::command]
pub fn remove_instance(id: String, state: State<'_, AppState>) -> Result<(), String> {
    if id == BUILTIN {
        return Err("L'instance Clover intégrée ne peut pas être retirée.".into());
    }
    resolve(&state.snapshot(), Some(&id)).map_err(|e| e.to_string())?;
    state.update(|stored| {
        stored.instances.retain(|entry| entry.id != id);
        if stored.selected_instance.as_deref() == Some(&id) {
            stored.selected_instance = None;
        }
    })
}

#[tauri::command]
pub fn open_instance_folder(
    id: String,
    folder: String,
    world: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let instance = resolve(&state.snapshot(), Some(&id)).map_err(|e| e.to_string())?;
    let paths = paths(Paths::new(&app).map_err(|e| e.to_string())?, &instance)
        .map_err(|e| e.to_string())?;
    let path = match folder.as_str() {
        "game" => paths.game,
        "mods" => paths.personal_mods,
        "logs" => paths.logs,
        "saves" | "resourcepacks" | "shaderpacks" | "screenshots" => paths.game.join(&folder),
        // Les datapacks sont rangés dans chaque monde.
        "datapacks" => paths.game.join("saves"),
        _ => return Err("Dossier inconnu.".into()),
    };
    // Dossier d'un monde précis (`saves/<monde>`, ou ses `datapacks/`).
    let path = match (folder.as_str(), world) {
        ("saves", Some(world)) => game::content::world_dir(&path, &world).map_err(|e| e.to_string())?,
        ("datapacks", Some(world)) => game::content::world_dir(&path, &world).map_err(|e| e.to_string())?.join("datapacks"),
        (_, None) => path,
        _ => return Err("Dossier inconnu.".into()),
    };
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Monde, pack, datapack ou capture d'écran du dossier de jeu d'une instance.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentEntry {
    /// Nom du fichier ou du dossier.
    pub name: String,
    /// Nom du projet Modrinth d'un pack publié, affiché à la place du fichier.
    pub title: Option<String>,
    /// Logo d'un pack : celui du projet Modrinth, sinon son `pack.png` (adresse `data:`).
    pub icon: Option<String>,
    /// Monde d'un datapack.
    pub world: Option<String>,
    /// Pack chargé par le jeu ; un pack désactivé attend dans `.disabled/` (voir `DISABLED`).
    pub enabled: bool,
    pub size: u64,
    pub modified: Option<u64>,
    /// Chemin de l'image (icône du monde, capture), ouverte à l'interface par le protocole `asset`.
    pub image: Option<String>,
    /// Fiche d'un monde (mode, difficulté, version…), lue dans son `level.dat`.
    pub level: Option<game::world::WorldInfo>,
    /// Empreinte de l'archive d'un pack, pour Modrinth.
    #[serde(skip)]
    sha512: Option<String>,
}

fn modified(path: &std::path::Path) -> Option<u64> {
    let time = std::fs::metadata(path).and_then(|meta| meta.modified()).ok()?;
    Some(time.duration_since(UNIX_EPOCH).ok()?.as_secs())
}

fn size(path: &std::path::Path) -> u64 {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() => std::fs::read_dir(path)
            .map(|entries| entries.flatten().map(|entry| size(&entry.path())).sum())
            .unwrap_or(0),
        Ok(meta) => meta.len(),
        Err(_) => 0,
    }
}

/// `saves` : dossiers ayant un `level.dat` ; packs : `.zip` ou dossiers ; `screenshots` : `.png`.
/// Sous-dossier des packs désactivés. Minecraft et Iris ne chargent que les archives et les dossiers
/// de pack posés directement dans leur dossier : celui-ci, sans `pack.mcmeta` ni `shaders/`, est
/// ignoré. Contrairement à un suffixe `.disabled`, il marche aussi pour les packs dépliés, et le
/// nom du pack ne change pas (Minecraft le retrouve sélectionné à sa réactivation).
const DISABLED: &str = ".disabled";

/// Packs, actifs puis désactivés, de `dir` (dossier `folder` du jeu, ou `datapacks/` d'un monde).
fn packs(dir: &std::path::Path, folder: &str, world: Option<&str>) -> Vec<ContentEntry> {
    let mut list = content(dir, folder, world, true);
    list.extend(content(&dir.join(DISABLED), folder, world, false));
    list
}

/// Contenu de `dir` (dossier `folder` du jeu, ou `datapacks/` d'un monde pour `world`) ; fichiers et
/// dossiers cachés exclus (`.disabled/`, copies provisoires).
fn content(dir: &std::path::Path, folder: &str, world: Option<&str>, enabled: bool) -> Vec<ContentEntry> {
    let Ok(entries) = std::fs::read_dir(dir) else { return vec![] };
    entries
        .flatten()
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let extension = path.extension().map(|e| e.to_string_lossy().to_lowercase());
            let pack = path.is_dir() || extension.as_deref() == Some("zip");
            let image = match folder {
                "saves" if path.join("level.dat").is_file() => Some(path.join("icon.png")).filter(|icon| icon.is_file()),
                "resourcepacks" | "shaderpacks" if pack => None,
                // Un datapack déplié se reconnaît à son `pack.mcmeta`.
                "datapacks" if extension.as_deref() == Some("zip") || path.join("pack.mcmeta").is_file() => None,
                "screenshots" if extension.as_deref() == Some("png") => Some(path.clone()),
                _ => return None,
            };
            let packs = matches!(folder, "resourcepacks" | "shaderpacks" | "datapacks");
            let stamp = if folder == "saves" { path.join("level.dat") } else { path.clone() };
            let level = (folder == "saves").then(|| game::world::read(&path)).flatten();
            Some(ContentEntry {
                name,
                title: None,
                icon: packs.then(|| game::content::pack_icon(&path)).flatten(),
                world: world.map(str::to_owned),
                enabled,
                size: size(&path),
                // Dernière partie notée par le jeu : une copie du dossier ne la change pas.
                modified: level.as_ref().and_then(|level| level.last_played).or_else(|| modified(&stamp)),
                image: image.map(|image| image.to_string_lossy().into_owned()),
                level,
                sha512: packs.then(|| game::content::archive_hash(&path)).flatten(),
            })
        })
        .collect()
}

/// Liste d'un onglet de l'instance : les datapacks sont ceux de tous les mondes.
fn folder_content(game_dir: &std::path::Path, folder: &str) -> Vec<ContentEntry> {
    let mut list = if folder == "datapacks" {
        let saves = game_dir.join("saves");
        std::fs::read_dir(&saves)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|world| world.path().join("level.dat").is_file())
            .flat_map(|world| {
                let name = world.file_name().to_string_lossy().into_owned();
                packs(&world.path().join("datapacks"), "datapacks", Some(&name))
            })
            .collect()
    } else if matches!(folder, "resourcepacks" | "shaderpacks") {
        packs(&game_dir.join(folder), folder, None)
    } else {
        content(&game_dir.join(folder), folder, None, true)
    };
    list.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.name.cmp(&b.name)));
    list
}

/// Élément d'un onglet désigné par l'interface : nom simple, dans le dossier attendu (datapack :
/// dans un monde existant) et présent sur le disque.
fn content_path(game_dir: &std::path::Path, folder: &str, name: &str, world: Option<&str>, enabled: bool) -> Result<std::path::PathBuf, String> {
    let plain = |value: &str| !value.is_empty() && !value.starts_with('.') && !value.contains(['/', '\\', ':']) && value.len() <= 255;
    if !plain(name) {
        return Err("Nom de fichier invalide.".into());
    }
    let mut dir = match (folder, world) {
        ("datapacks", Some(world)) => game::content::world_dir(&game_dir.join("saves"), world).map_err(|e| e.to_string())?.join("datapacks"),
        ("saves" | "resourcepacks" | "shaderpacks" | "screenshots", None) => game_dir.join(folder),
        _ => return Err("Dossier inconnu.".into()),
    };
    if !enabled {
        dir.push(DISABLED);
    }
    let path = dir.join(name);
    if std::fs::symlink_metadata(&path).is_err() {
        return Err(format!("« {name} » n'existe plus : la liste va être actualisée."));
    }
    Ok(path)
}

/// Active ou désactive un pack de ressources, un shader ou un datapack (déplacé dans ou hors de
/// `.disabled/`). Un pack ouvert par le jeu sous Windows ne peut pas bouger : l'erreur le dit.
#[tauri::command]
pub fn set_content_enabled(
    id: String,
    folder: String,
    name: String,
    world: Option<String>,
    enabled: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !matches!(folder.as_str(), "resourcepacks" | "shaderpacks" | "datapacks") {
        return Err("Seuls les packs s'activent et se désactivent.".into());
    }
    let instance = resolve(&state.snapshot(), Some(&id)).map_err(|e| e.to_string())?;
    let game_dir = paths(Paths::new(&app).map_err(|e| e.to_string())?, &instance).map_err(|e| e.to_string())?.game;
    let from = content_path(&game_dir, &folder, &name, world.as_deref(), !enabled)?;
    move_pack(&from, enabled)
}

/// Sort `from` de `.disabled/` (`enabled`) ou l'y range, sans écraser un pack du même nom.
fn move_pack(from: &std::path::Path, enabled: bool) -> Result<(), String> {
    let (Some(parent), Some(name)) = (from.parent(), from.file_name()) else { return Err("Dossier inconnu.".into()) };
    let to_dir = if enabled { parent.parent().ok_or("Dossier inconnu.")?.to_path_buf() } else { parent.join(DISABLED) };
    let to = to_dir.join(name);
    let name = name.to_string_lossy();
    if to.exists() {
        return Err(format!("Un autre « {name} » existe déjà : renomme l'un des deux dans le dossier."));
    }
    std::fs::create_dir_all(&to_dir).map_err(|e| e.to_string())?;
    std::fs::rename(from, &to).map_err(|e| format!("Impossible de déplacer « {name} » : il est peut-être utilisé par le jeu ({e})."))
}

/// Met un élément d'un onglet à la corbeille du système (récupérable). Un monde n'est jamais
/// supprimé pendant une partie lancée par Clover : le jeu l'écrit peut-être.
#[tauri::command]
pub async fn trash_content(
    id: String,
    folder: String,
    name: String,
    world: Option<String>,
    enabled: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if folder == "saves" && (app.state::<game::console::Console>().running() || managed_game_running(&state.root)) {
        return Err("Ferme Minecraft avant de supprimer un monde.".into());
    }
    let instance = resolve(&state.snapshot(), Some(&id)).map_err(|e| e.to_string())?;
    let game_dir = paths(Paths::new(&app).map_err(|e| e.to_string())?, &instance).map_err(|e| e.to_string())?.game;
    let path = content_path(&game_dir, &folder, &name, world.as_deref(), enabled)?;
    tauri::async_runtime::spawn_blocking(move || trash::delete(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Impossible de mettre « {name} » à la corbeille : {e}"))
}

#[tauri::command]
pub async fn instance_content(
    id: String,
    folder: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<ContentEntry>, String> {
    if !matches!(folder.as_str(), "saves" | "datapacks" | "resourcepacks" | "shaderpacks" | "screenshots") {
        return Err("Dossier inconnu.".into());
    }
    let instance = resolve(&state.snapshot(), Some(&id)).map_err(|e| e.to_string())?;
    let dir = paths(Paths::new(&app).map_err(|e| e.to_string())?, &instance)
        .map_err(|e| e.to_string())?
        .game;
    // Un monde de plusieurs Go se mesure fichier par fichier : hors du fil de l'interface.
    let mut list = tauri::async_runtime::spawn_blocking(move || folder_content(&dir, &folder))
        .await
        .map_err(|e| e.to_string())?;
    // Comme « Mes mods » : un pack publié sur Modrinth prend le nom et le logo de son projet.
    let hashes: Vec<String> = list.iter().filter_map(|entry| entry.sha512.clone()).collect::<HashSet<_>>().into_iter().collect();
    let projects = game::content::identify_archives(&game::download::client(), hashes).await;
    for entry in &mut list {
        if let Some(project) = entry.sha512.as_ref().and_then(|hash| projects.get(hash)) {
            entry.title = Some(project.title.clone());
            entry.icon = project.icon_url.clone().or(entry.icon.take());
        }
    }
    // Seules ces images sont lisibles par l'interface, rien d'autre du disque.
    let scope = app.asset_protocol_scope();
    for image in list.iter().filter_map(|entry| entry.image.as_ref()) {
        scope.allow_file(image).map_err(|e| e.to_string())?;
    }
    Ok(list)
}

/// Instance choisie, ses dossiers et sa version de Minecraft (celle du manifeste pour Clover).
pub async fn game_context(app: &AppHandle, stored: &crate::store::Stored) -> game::Result<(Instance, Paths, String)> {
    let instance = resolve(stored, None)?;
    let paths = paths(Paths::new(app)?, &instance)?;
    let minecraft = match instance.kind {
        Kind::Clover => game::catalogue(app).await?.minecraft.version,
        _ => instance.minecraft.clone().ok_or_else(|| GameError::InvalidVersion("version absente".into()))?,
    };
    Ok((instance, paths, minecraft))
}

/// Crée une instance Fabric séparée à partir d'un modpack Modrinth et la choisit ; renvoie son
/// identifiant. En cas d'échec, rien ne reste : ni l'instance, ni ses fichiers.
#[tauri::command]
pub async fn install_modpack(project: String, app: AppHandle, state: State<'_, AppState>) -> game::Result<String> {
    let http = game::download::client();
    let base = Paths::new(&app)?;
    let staging = base.root.join("downloads").join("modpacks");
    let (archive, index) = game::content::fetch_modpack(&http, &project, &staging).await?;
    let mut input = InstanceInput { name: index.name.chars().take(64).collect(), kind: Kind::Fabric, minecraft: None, loader: None, separate: true, memory_mb: None };
    let (minecraft, loader) = index.versions()?;
    (input.minecraft, input.loader) = (Some(minecraft), Some(loader));
    validate_input(&state.root, &mut input).await?;
    let instance = Instance {
        id: format!("instance-{:032x}", rand::random::<u128>()),
        name: input.name,
        kind: Kind::Fabric,
        minecraft: input.minecraft,
        loader: input.loader,
        separate: true,
        ..Instance::builtin()
    };
    let paths = paths(base, &instance)?;
    let progress = |done, total| {
        let _ = app.emit("modpack-progress", (done, total));
    };
    let result = game::content::install_modpack(&http, &archive, &index, &paths.game, &paths.personal_mods, &progress).await;
    let _ = std::fs::remove_file(&archive);
    if let Err(e) = result {
        let _ = std::fs::remove_dir_all(state.root.join("instances").join(&instance.id));
        return Err(e);
    }
    let id = instance.id.clone();
    state
        .update(|stored| {
            stored.instances.push(instance);
            stored.selected_instance = Some(id.clone());
        })
        .map_err(|e| GameError::Io(std::io::Error::other(e)))?;
    Ok(id)
}

pub async fn mod_context(
    app: &AppHandle,
    stored: &crate::store::Stored,
) -> game::Result<(
    Paths,
    String,
    Vec<String>,
    Option<game::manifest::Manifest>,
    HashSet<String>,
)> {
    let instance = resolve(stored, None)?;
    let paths = paths(Paths::new(app)?, &instance)?;
    if instance.kind == Kind::Vanilla {
        return Err(GameError::InvalidVersion(
            "Vanilla ne charge pas de mods : choisis une instance Fabric ou Clover".into(),
        ));
    }
    let manifest = if instance.kind == Kind::Clover {
        Some(game::catalogue(app).await?)
    } else {
        None
    };
    let minecraft = manifest
        .as_ref()
        .map(|m| m.minecraft.version.clone())
        .or(instance.minecraft)
        .ok_or_else(|| GameError::InvalidVersion("version absente".into()))?;
    let disabled = if instance.id == BUILTIN {
        stored.disabled_personal_mods.clone()
    } else {
        instance.disabled_mods
    };
    let enabled = if instance.id == BUILTIN {
        stored.settings.enabled_mods.clone()
    } else {
        instance.enabled_mods
    }
    .map(|ids| ids.into_iter().collect())
    .unwrap_or_else(|| {
        manifest
            .as_ref()
            .map_or_else(HashSet::new, |m| m.default_mods())
    });
    Ok((paths, minecraft, disabled, manifest, enabled))
}

pub fn disabled_mut<'a>(
    stored: &'a mut crate::store::Stored,
    id: &str,
) -> Option<&'a mut Vec<String>> {
    if id == BUILTIN {
        return Some(&mut stored.disabled_personal_mods);
    }
    stored
        .instances
        .iter_mut()
        .find(|entry| entry.id == id)
        .map(|entry| &mut entry.disabled_mods)
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub async fn play_personal(
    app: &AppHandle,
    session: &crate::auth::Session,
    options: game::LaunchOptions,
    instance: &Instance,
    on_join: impl Fn(crate::store::RecentServer) + Send + 'static,
) -> game::Result<()> {
    use tauri::Emitter;
    let paths = paths(Paths::new(app)?, instance)?;
    let minecraft = instance
        .minecraft
        .as_deref()
        .ok_or_else(|| GameError::InvalidVersion("version absente".into()))?;
    let http = game::download::client();
    let loader = if instance.kind == Kind::Fabric {
        Some(
            instance
                .loader
                .as_deref()
                .ok_or_else(|| GameError::InvalidVersion("loader Fabric absent".into()))?,
        )
    } else {
        None
    };
    let installation =
        game::install::install_version(&http, &paths, minecraft, loader, &|progress| {
            let _ = app.emit("install-progress", progress);
        })
        .await?;
    let personal = if instance.kind == Kind::Fabric {
        game::personal::loadable(
            &paths.personal_mods,
            &options.disabled_personal_mods,
            minecraft,
        )
    } else {
        vec![]
    };
    game::mods::sync_personal(&paths.mods, &personal).await?;
    game::launch::spawn(app, &paths, installation, session, None, &options, on_join).await
}

#[tauri::command]
pub fn set_instance_catalogue(mods: Vec<String>, state: State<'_, AppState>) -> Result<(), String> {
    let instance = resolve(&state.snapshot(), None).map_err(|e| e.to_string())?;
    state.update(|stored| {
        if let Some(entry) = stored
            .instances
            .iter_mut()
            .find(|entry| entry.id == instance.id)
        {
            entry.enabled_mods = Some(mods);
        } else {
            stored.settings.enabled_mods = Some(mods);
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packs_are_disabled_in_place_and_paths_stay_inside_the_game() {
        let game = std::env::temp_dir().join(format!("clover-content-toggle-{}", rand::random::<u64>()));
        let write = |path: std::path::PathBuf| {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, "x").unwrap();
        };
        write(game.join("resourcepacks/Faithful.zip"));
        write(game.join("resourcepacks/Déplié/pack.mcmeta"));
        write(game.join("saves/Monde/level.dat"));
        write(game.join("saves/Monde/datapacks/terralith.zip"));
        write(game.join("saves/Monde/datapacks/notes.txt"));

        let pack = content_path(&game, "resourcepacks", "Déplié", None, true).unwrap();
        move_pack(&pack, false).unwrap();
        let datapack = content_path(&game, "datapacks", "terralith.zip", Some("Monde"), true).unwrap();
        move_pack(&datapack, false).unwrap();
        assert!(game.join("resourcepacks/.disabled/Déplié/pack.mcmeta").is_file());
        assert!(game.join("saves/Monde/datapacks/.disabled/terralith.zip").is_file());

        let listed = |folder: &str| folder_content(&game, folder).into_iter().map(|entry| (entry.name, entry.enabled)).collect::<Vec<_>>();
        let mut packs = listed("resourcepacks");
        packs.sort();
        assert_eq!(packs, [("Déplié".to_owned(), false), ("Faithful.zip".to_owned(), true)]);
        assert_eq!(listed("datapacks"), [("terralith.zip".to_owned(), false)]);

        // Réactivé, puis refus d'écraser un pack revenu sous le même nom.
        move_pack(&content_path(&game, "resourcepacks", "Déplié", None, false).unwrap(), true).unwrap();
        move_pack(&content_path(&game, "resourcepacks", "Déplié", None, true).unwrap(), false).unwrap();
        write(game.join("resourcepacks/Déplié/pack.mcmeta"));
        assert!(move_pack(&content_path(&game, "resourcepacks", "Déplié", None, false).unwrap(), true).is_err());

        for (folder, name, world) in [("resourcepacks", "../saves", None), ("resourcepacks", ".disabled", None), ("datapacks", "terralith.zip", Some("..")), ("mods", "a.jar", None), ("resourcepacks", "absent.zip", None)] {
            assert!(content_path(&game, folder, name, world, true).is_err(), "{folder} {name}");
        }
        std::fs::remove_dir_all(game).unwrap();
    }

    #[test]
    #[ignore = "nécessite un jeu lancé depuis Clover encore ouvert"]
    fn detects_existing_managed_game_after_launcher_exit() {
        let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap();
        assert!(managed_game_running(&std::path::PathBuf::from(home).join(".cloverlauncher")));
    }

    #[tokio::test]
    #[ignore = "métadonnées officielles Mojang et Fabric, réseau requis"]
    async fn official_versions_and_fabric_metadata() {
        let root = std::env::temp_dir().join(format!("clover-instance-metadata-{}", rand::random::<u64>()));
        let list = versions(&root).await.unwrap();
        assert!(list.iter().any(|v| v.id == "1.20.1" && !v.snapshot));
        assert!(list.iter().any(|v| v.id == "1.8.9"));
        let compatible = loaders(&root, "1.20.1").await.unwrap();
        assert!(!compatible.is_empty());
        assert!(compatible.iter().all(|id| validate_version_id(id).is_ok()));
        let mut input = InstanceInput { name: "Fabric réseau".into(), kind: Kind::Fabric, minecraft: Some("1.20.1".into()), loader: Some(compatible[0].clone()), separate: false, memory_mb: None };
        validate_input(&root, &mut input).await.unwrap();
        input.loader = Some("0.0.0-invalid".into());
        assert!(validate_input(&root, &mut input).await.is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn old_store_keeps_clover_and_worlds_in_place() {
        let stored: crate::store::Stored =
            serde_json::from_str(r#"{"settings":{"memoryGb":8}}"#).unwrap();
        assert_eq!(resolve(&stored, None).unwrap().id, BUILTIN);
        assert!(stored.instances.is_empty());
        assert!(!stored.expert_instances);
    }
    #[test]
    fn untrusted_identifiers_never_become_paths() {
        for id in ["../game", "C:\\game", "/tmp", ".", "", "26.2/../x"] {
            assert!(validate_version_id(id).is_err());
        }
        assert!(validate_instance_id("instance-../game").is_err());
        assert!(validate_version_id("26.2").is_ok());
    }
    #[test]
    fn selection_must_reference_a_persisted_instance() {
        let mut stored = crate::store::Stored::default();
        let instance = Instance {
            id: "instance-0123456789abcdef0123456789abcdef".into(),
            ..Instance::builtin()
        };
        stored.selected_instance = Some(instance.id.clone());
        assert!(resolve(&stored, None).is_err());
        stored.instances.push(instance);
        assert!(resolve(&stored, None).is_ok());
        let id = stored.selected_instance.clone().unwrap();
        disabled_mut(&mut stored, &id).unwrap().push("a.jar".into());
        assert!(stored.disabled_personal_mods.is_empty());
        assert_eq!(stored.instances[0].disabled_mods, ["a.jar"]);
    }

    #[test]
    fn folders_share_downloads_but_never_mod_sources() {
        let root = std::env::temp_dir().join("clover-instance-paths");
        let clover = paths(Paths::from_root(root.clone()), &Instance::builtin()).unwrap();
        let mut instance = Instance {
            id: "instance-0123456789abcdef0123456789abcdef".into(),
            ..Instance::builtin()
        };
        let shared = paths(Paths::from_root(root.clone()), &instance).unwrap();
        assert_eq!(clover.game, shared.game);
        assert_ne!(clover.personal_mods, shared.personal_mods);
        instance.separate = true;
        let isolated = paths(Paths::from_root(root), &instance).unwrap();
        assert_ne!(isolated.game, shared.game);
        assert_eq!(isolated.personal_mods, shared.personal_mods);
        assert_eq!(isolated.libraries, clover.libraries);
        assert_eq!(isolated.assets, clover.assets);
        assert_eq!(isolated.runtimes, clover.runtimes);
        assert_ne!(isolated.quick_play_log, clover.quick_play_log);
    }

    #[tokio::test]
    async fn clover_input_cannot_override_signed_versions() {
        let mut input = InstanceInput {
            name: " Mon Clover ".into(),
            kind: Kind::Clover,
            minecraft: Some("../bad".into()),
            loader: Some("bad".into()),
            separate: true,
            memory_mb: Some(4096),
        };
        validate_input(&std::env::temp_dir(), &mut input)
            .await
            .unwrap();
        assert_eq!(input.name, "Mon Clover");
        assert!(input.minecraft.is_none() && input.loader.is_none());
        input.memory_mb = Some(0);
        assert!(validate_input(&std::env::temp_dir(), &mut input)
            .await
            .is_err());
    }
}
