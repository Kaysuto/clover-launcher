mod auth;
mod game;
mod history;
mod import;
mod instances;
mod msix;
mod presence;
mod site;
mod skins;
mod status;
mod storage;
mod store;
mod update;
#[cfg(windows)]
mod tray_popup;

/// Mode interne sans interface ni connexion : suit seulement la fenêtre du jeu lancé.
pub fn run_game_window_helper() -> bool {
    game::window_title::run_helper()
}

use std::path::PathBuf;
use std::sync::Mutex as SyncMutex;

use presence::Presence;
use serde::Serialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager, State, WindowEvent};
use tauri_plugin_window_state::StateFlags;
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

/// Argument ajouté au démarrage avec l'ordinateur : le launcher démarre sans fenêtre.
const MINIMIZED_ARG: &str = "--minimized";

/// Session du compte actif. Le jeton Minecraft reste côté Rust ; l'interface ne voit que le profil.
#[derive(Default)]
struct CurrentSession(Mutex<Option<auth::Session>>);

#[derive(Default)]
struct LaunchGate(Mutex<()>);

struct TrayMenu {
    _menu: Menu<tauri::Wry>,
    play: MenuItem<tauri::Wry>,
    navigation: Vec<MenuItem<tauri::Wry>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrayState {
    available: bool,
    can_play: bool,
}

impl TrayMenu {
    fn snapshot(&self) -> tauri::Result<TrayState> {
        Ok(TrayState { available: self.navigation[0].is_enabled()?, can_play: self.play.is_enabled()? })
    }
}

#[tauri::command]
fn tray_state(menu: State<'_, TrayMenu>) -> Result<TrayState, String> {
    menu.snapshot().map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_tray_menu(app: AppHandle) {
    if let Some(window) = app.get_webview_window("tray-menu") {
        let _ = window.hide();
    }
}

fn handle_tray_action(app: &AppHandle, action: &str) -> Result<(), String> {
    let state = app.state::<TrayMenu>().snapshot().map_err(|e| e.to_string())?;
    match action {
        "open" | "quit" => {}
        "play" if state.available && state.can_play => {}
        "instances" | "settings" if state.available => {}
        _ => return Err("Ce raccourci est indisponible pour le moment.".into()),
    }
    hide_tray_menu(app.clone());
    if action == "quit" {
        app.exit(0);
    } else {
        show_main_window(app);
        if action != "open" {
            if let Some(window) = app.get_webview_window("main") {
                window.emit("tray-action", action).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn tray_menu_action(app: AppHandle, action: String) -> Result<(), String> {
    handle_tray_action(&app, &action)
}

/// The tray follows the existing interface state; launching still goes through `play`.
#[tauri::command]
fn set_tray_state(app: AppHandle, menu: State<'_, TrayMenu>, available: bool, can_play: bool) -> Result<(), String> {
    menu.play.set_enabled(available && can_play).map_err(|e| e.to_string())?;
    for item in &menu.navigation {
        item.set_enabled(available).map_err(|e| e.to_string())?;
    }
    if let Some(window) = app.get_webview_window("tray-menu") {
        window.emit("tray-state", menu.snapshot().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Réglages et comptes (`launcher.json`), enregistrés à chaque modification.
struct AppState {
    stored: SyncMutex<store::Stored>,
    path: PathBuf,
    root: PathBuf,
}

impl AppState {
    fn snapshot(&self) -> store::Stored {
        self.stored.lock().expect("réglages").clone()
    }

    fn update<R>(&self, change: impl FnOnce(&mut store::Stored) -> R) -> Result<R, String> {
        let mut stored = self.stored.lock().expect("réglages");
        let mut next = stored.clone();
        let result = change(&mut next);
        next.save(&self.path).map_err(|e| format!("Impossible d'enregistrer les réglages : {e}"))?;
        *stored = next;
        Ok(result)
    }

    /// Retient un serveur rejoint en jeu ; n'écrit le fichier que si l'historique change.
    fn remember_server(&self, server: store::RecentServer) {
        let mut stored = self.stored.lock().expect("réglages");
        if stored.remember_server(server) {
            if let Err(e) = stored.save(&self.path) {
                eprintln!("[store] serveur récent non enregistré : {e}");
            }
        }
    }
}

fn account_ref(profile: &auth::Profile) -> store::AccountRef {
    store::AccountRef { uuid: profile.uuid.clone(), name: profile.name.clone(), skin_url: profile.skin.as_ref().map(|skin| skin.url.clone()) }
}

/// Session du compte actif, reprise par Discord (tête du joueur en petite image).
async fn activate(current: &CurrentSession, presence: &Presence, session: Option<auth::Session>) {
    let player = session.as_ref().map(|s| presence::Player { uuid: s.profile.uuid.clone(), name: s.profile.name.clone() });
    *current.0.lock().await = session;
    presence.set_player(player).await;
}

#[tauri::command]
fn get_stored(state: State<'_, AppState>) -> store::Stored {
    state.snapshot()
}

/// Rouvre la session du compte actif (et reprend le compte de la toute première version).
#[tauri::command]
async fn restore_session(state: State<'_, AppState>, current: State<'_, CurrentSession>, presence: State<'_, Presence>) -> Result<Option<auth::Profile>, String> {
    let active = state.snapshot().active_account;
    let session = match active {
        Some(uuid) => auth::restore(&uuid).await,
        None => auth::migrate_legacy(),
    }
    .inspect_err(|e| eprintln!("[auth] échec de la reconnexion : {e}"))
    .map_err(|e| e.to_string())?;
    eprintln!("[auth] reconnexion : {}", session.as_ref().map_or("aucun compte", |s| s.profile.name.as_str()));
    if let Some(session) = &session {
        state.update(|stored| stored.upsert_account(account_ref(&session.profile)))?;
    }
    let profile = session.as_ref().map(|s| s.profile.clone());
    activate(&current, &presence, session).await;
    Ok(profile)
}

/// Ajoute un compte. Le premier ajouté devient le compte actif.
#[tauri::command]
async fn login(app: AppHandle, state: State<'_, AppState>, current: State<'_, CurrentSession>, presence: State<'_, Presence>) -> Result<auth::Profile, String> {
    let session = auth::login(&app).await.inspect_err(|e| eprintln!("[auth] échec de la connexion : {e}")).map_err(|e| e.to_string())?;
    let profile = session.profile.clone();
    eprintln!("[auth] connecté : {} ({})", profile.name, profile.uuid);
    let active = state.update(|stored| {
        stored.upsert_account(account_ref(&profile));
        stored.active_account.clone()
    })?;
    if active.as_deref() == Some(profile.uuid.as_str()) {
        activate(&current, &presence, Some(session)).await;
    }
    Ok(profile)
}

#[tauri::command]
async fn use_account(uuid: String, state: State<'_, AppState>, current: State<'_, CurrentSession>, presence: State<'_, Presence>) -> Result<auth::Profile, String> {
    let session = auth::restore(&uuid).await.map_err(|e| e.to_string())?.ok_or("Ce compte doit se reconnecter.")?;
    state.update(|stored| stored.active_account = Some(uuid))?;
    let profile = session.profile.clone();
    activate(&current, &presence, Some(session)).await;
    Ok(profile)
}

/// Retire un compte ; renvoie le profil du compte actif qui le remplace, s'il y en a un.
#[tauri::command]
async fn remove_account(uuid: String, state: State<'_, AppState>, current: State<'_, CurrentSession>, presence: State<'_, Presence>) -> Result<Option<auth::Profile>, String> {
    auth::logout(&uuid).map_err(|e| e.to_string())?;
    let active = state.update(|stored| {
        stored.remove_account(&uuid);
        stored.active_account.clone()
    })?;
    let session = match active {
        Some(active) => auth::restore(&active).await.map_err(|e| e.to_string())?,
        None => None,
    };
    let profile = session.as_ref().map(|s| s.profile.clone());
    activate(&current, &presence, session).await;
    Ok(profile)
}

/// Enregistre les réglages et applique ceux qui agissent hors de l'interface.
#[tauri::command]
async fn save_settings(settings: store::Settings, app: AppHandle, state: State<'_, AppState>, presence: State<'_, Presence>) -> Result<(), String> {
    let previous = state.update(|stored| std::mem::replace(&mut stored.settings, settings.clone()))?;
    if previous.discord_presence != settings.discord_presence {
        presence.set_enabled(settings.discord_presence).await;
    }
    if previous.start_with_system != settings.start_with_system {
        let enabled = settings.start_with_system;
        if msix::packaged() {
            tauri::async_runtime::spawn_blocking(move || msix::set_start_with_system(enabled)).await.map_err(|e| e.to_string())??;
        } else {
            let autolaunch = app.autolaunch();
            let result = if enabled { autolaunch.enable() } else { autolaunch.disable() };
            result.map_err(|e| format!("Démarrage avec l'ordinateur impossible : {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn finish_onboarding(state: State<'_, AppState>) -> Result<(), String> {
    state.update(|stored| stored.onboarded = true)
}

#[tauri::command]
async fn get_catalogue(app: AppHandle) -> Result<game::manifest::Manifest, game::GameError> {
    game::catalogue(&app).await
}

#[tauri::command]
async fn server_status(host: String) -> status::ServerStatus {
    status::ping(&host).await
}

#[tauri::command]
async fn site_feed() -> site::Feed {
    site::feed().await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    total_memory_gb: u64,
    auto_memory_gb: u64,
    java: Option<String>,
    launcher: &'static str,
    /// Paquet du Microsoft Store : mises à jour par le Store, démarrage par la tâche du paquet.
    store: bool,
}

#[tauri::command]
fn system_info(app: AppHandle) -> Result<SystemInfo, String> {
    let paths = game::Paths::new(&app).map_err(|e| e.to_string())?;
    Ok(SystemInfo {
        total_memory_gb: (game::total_memory_mb() as f64 / 1024.0).round() as u64,
        auto_memory_gb: game::auto_memory_mb() / 1024,
        java: game::installed_java(&paths),
        launcher: env!("CARGO_PKG_VERSION"),
        store: msix::packaged(),
    })
}

#[tauri::command]
async fn storage_usage(state: State<'_, AppState>) -> Result<storage::Usage, String> {
    let root = state.root.clone();
    tauri::async_runtime::spawn_blocking(move || storage::usage(&root)).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn clean_storage(state: State<'_, AppState>) -> Result<u64, String> {
    let root = state.root.clone();
    tauri::async_runtime::spawn_blocking(move || storage::clean(&root)).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn open_game_dir(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let game = state.root.join("game");
    std::fs::create_dir_all(&game).map_err(|e| e.to_string())?;
    app.opener().open_path(game.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Sortie du jeu après l'entrée `after` (0 : tout ce qui est gardé), pour la console et l'écran
/// de plantage.
#[tauri::command]
fn game_console(after: u64, console: State<'_, game::console::Console>) -> game::console::Snapshot {
    console.since(after)
}

/// Bouton « Effacer » de la console ; `logs/game-output.log` reste complet.
#[tauri::command]
fn clear_game_console(console: State<'_, game::console::Console>) {
    console.clear();
}

/// Nouvelle version du launcher sur le CDN ; `None` si celle-ci est la dernière.
#[tauri::command]
async fn check_update(app: AppHandle, pending: State<'_, update::PendingUpdate>) -> Result<Option<update::UpdateInfo>, String> {
    update::check(&app, &pending).await.inspect_err(|e| eprintln!("[update] {e}"))
}

/// Installe la version trouvée par `check_update` puis relance le launcher. Pas pendant une
/// partie : le launcher fermé, la console et le suivi des serveurs rejoints s'arrêteraient.
#[tauri::command]
async fn install_update(app: AppHandle, pending: State<'_, update::PendingUpdate>, console: State<'_, game::console::Console>) -> Result<(), String> {
    if console.running() {
        return Err("Ferme Minecraft avant de mettre à jour le launcher.".into());
    }
    update::install(&app, &pending).await.inspect_err(|e| eprintln!("[update] {e}"))
}

#[tauri::command]
fn open_logs_dir(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let stored = state.snapshot();
    let last = instances::resolve(&stored, stored.last_launched_instance.as_deref().or(Some(instances::BUILTIN))).unwrap_or_else(|_| instances::Instance::builtin());
    let logs = instances::paths(game::Paths::new(&app).map_err(|e| e.to_string())?, &last).map_err(|e| e.to_string())?.logs;
    std::fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
    app.opener().open_path(logs.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct SkinLists {
    library: Vec<skins::SkinEntry>,
    defaults: Vec<skins::SkinEntry>,
}

#[tauri::command]
async fn list_skins(app: AppHandle, state: State<'_, AppState>) -> Result<SkinLists, String> {
    let root = state.root.clone();
    let manifest = game::catalogue(&app).await.ok();
    tauri::async_runtime::spawn_blocking(move || {
        let client_jar = manifest
            .map(|manifest| {
                let version = manifest.minecraft.version;
                root.join("versions").join(&version).join(format!("{version}.jar"))
            });
        SkinLists { library: skins::library(&root), defaults: skins::defaults(client_jar.as_deref()) }
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn add_skin(bytes: Vec<u8>, name: String, model: String, state: State<'_, AppState>) -> Result<skins::SkinEntry, skins::SkinError> {
    skins::add(&state.root, &bytes, &name, &model)
}

#[tauri::command]
fn rename_skin(id: String, name: String, state: State<'_, AppState>) -> Result<String, skins::SkinError> {
    skins::rename(&state.root, &id, &name)
}

#[tauri::command]
fn remove_skin(id: String, state: State<'_, AppState>) -> Result<(), skins::SkinError> {
    skins::remove(&state.root, &id)
}

#[tauri::command]
async fn list_personal_mods(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<game::personal::PersonalMod>, game::GameError> {
    let (paths, minecraft, disabled, _, _) = instances::mod_context(&app, &state.snapshot()).await?;
    Ok(game::personal::list(&game::download::client(), &paths.personal_mods, &disabled, &minecraft).await)
}

/// Recherche sur Modrinth pour la version de Minecraft de l'instance choisie. Les mods marquent
/// ceux que le catalogue Clover fournit déjà.
#[tauri::command]
async fn search_modrinth(kind: game::modrinth::Kind, query: String, offset: u32, app: AppHandle, state: State<'_, AppState>) -> Result<game::modrinth::SearchPage, game::GameError> {
    let http = game::download::client();
    if kind != game::modrinth::Kind::Mod {
        let (_, _, minecraft) = instances::game_context(&app, &state.snapshot()).await?;
        return game::modrinth::search(&http, kind, &query, &minecraft, offset).await;
    }
    let (_, minecraft, _, manifest, enabled) = instances::mod_context(&app, &state.snapshot()).await?;
    let mut page = game::modrinth::search(&http, kind, &query, &minecraft, offset).await?;
    if let Some(manifest) = manifest { page.mark_provided(&manifest.mods_to_install(&enabled)); }
    Ok(page)
}

/// Pack de ressources, shader ou datapack (dans le monde `world`) pour l'instance choisie ;
/// renvoie le nom du fichier. Un shader sur une instance Fabric installe aussi Iris.
#[tauri::command]
async fn install_modrinth_content(kind: game::modrinth::Kind, project: String, world: Option<String>, app: AppHandle, state: State<'_, AppState>) -> Result<String, game::GameError> {
    use game::modrinth::Kind;
    let http = game::download::client();
    let (instance, paths, minecraft) = instances::game_context(&app, &state.snapshot()).await?;
    let dir = match kind {
        Kind::Resourcepack => paths.game.join("resourcepacks"),
        Kind::Shader if instance.kind == instances::Kind::Vanilla => {
            return Err(game::GameError::InvalidVersion("les shaders demandent Iris : choisis une instance Fabric ou Clover".into()));
        }
        Kind::Shader => paths.game.join("shaderpacks"),
        Kind::Datapack => {
            let world = world.ok_or_else(|| game::GameError::InvalidVersion("choisis un monde".into()))?;
            game::content::world_dir(&paths.game.join("saves"), &world)?.join("datapacks")
        }
        Kind::Mod | Kind::Modpack => return Err(game::GameError::InvalidVersion("type de contenu inattendu".into())),
    };
    let filename = game::content::install_archive(&http, &dir, kind, &project, &minecraft).await?;
    if kind == Kind::Shader && instance.kind == instances::Kind::Fabric {
        game::personal::install(&http, &paths.personal_mods, "iris", &minecraft, &[]).await?;
    }
    Ok(filename)
}

/// Page Modrinth d'un mod du catalogue ou de « Mes mods ». Si le catalogue a une description en
/// français pour ce mod, elle remplace celle de Modrinth.
#[tauri::command]
async fn modrinth_project(project: String, app: AppHandle) -> Result<game::modrinth::Project, game::GameError> {
    let mut page = game::modrinth::project(&game::download::client(), &project).await?;
    let manifest = game::catalogue(&app).await.ok();
    if let Some(body) = manifest.as_ref().and_then(|manifest| manifest.mods.iter().find(|m| m.id == page.slug)).and_then(|m| m.body.as_deref()) {
        page.description_html = game::modrinth::description_html(body);
    }
    Ok(page)
}

/// Installe un mod trouvé sur Modrinth (et ses dépendances) dans « Mes mods ».
#[tauri::command]
async fn install_modrinth_mod(project: String, app: AppHandle, state: State<'_, AppState>) -> Result<Vec<String>, game::GameError> {
    let (paths, minecraft, _, manifest, enabled) = instances::mod_context(&app, &state.snapshot()).await?;
    let provided = manifest.as_ref().map(|m| m.mods_to_install(&enabled).into_iter().filter_map(|m| m.file.as_ref().map(|f| f.sha512.clone())).collect::<Vec<_>>()).unwrap_or_default();
    game::personal::install(&game::download::client(), &paths.personal_mods, &project, &minecraft, &provided).await
}

/// Corps brut : les octets du `.jar` ; en-tête `x-filename` : son nom, encodé pour l'URL.
#[tauri::command]
fn add_personal_mod(app: AppHandle, state: State<'_, AppState>, request: tauri::ipc::Request<'_>) -> Result<(), game::GameError> {
    let name = request
        .headers()
        .get("x-filename")
        .and_then(|value| value.to_str().ok())
        .and_then(|encoded| url::form_urlencoded::parse(format!("n={encoded}").as_bytes()).next().map(|(_, name)| name.into_owned()))
        .unwrap_or_default();
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err(game::GameError::NotAMod(name)) };
    let instance = instances::resolve(&state.snapshot(), None)?;
    if instance.kind == instances::Kind::Vanilla { return Err(game::GameError::NotAMod("Vanilla ne charge pas de mods".into())); }
    game::personal::add(&instances::paths(game::Paths::new(&app)?, &instance)?.personal_mods, &name, bytes)
}

#[tauri::command]
fn remove_personal_mod(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let instance = instances::resolve(&state.snapshot(), None).map_err(|e| e.to_string())?;
    let paths = instances::paths(game::Paths::new(&app).map_err(|e| e.to_string())?, &instance).map_err(|e| e.to_string())?;
    game::personal::remove(&paths.personal_mods, &id).map_err(|e| e.to_string())?;
    state.update(|stored| { if let Some(disabled) = instances::disabled_mut(stored, &instance.id) { disabled.retain(|name| *name != id); } })
}

#[tauri::command]
fn set_personal_mod_enabled(id: String, enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    let instance = instances::resolve(&state.snapshot(), None).map_err(|e| e.to_string())?;
    state.update(|stored| {
        if let Some(disabled) = instances::disabled_mut(stored, &instance.id) {
            disabled.retain(|name| *name != id);
            if !enabled { disabled.push(id); }
        }
    })
}

/// Dépendances obligatoires des mods ajoutés à la main (`files`), téléchargées depuis Modrinth si ni
/// « Mes mods » ni la sélection Clover ne les fournissent.
#[tauri::command]
async fn install_personal_dependencies(files: Vec<String>, app: AppHandle, state: State<'_, AppState>) -> Result<game::personal::Resolved, game::GameError> {
    let (paths, minecraft, _, manifest, enabled) = instances::mod_context(&app, &state.snapshot()).await?;
    let provided = manifest.as_ref().map(|m| m.mods_to_install(&enabled).into_iter().filter_map(|m| m.file.as_ref().map(|f| f.sha512.clone())).collect::<Vec<_>>()).unwrap_or_default();
    game::personal::install_dependencies(&game::download::client(), &paths.personal_mods, &files, &minecraft, &provided).await
}

/// Remplace un mod du joueur par sa version pour Minecraft du serveur, trouvée sur Modrinth.
#[tauri::command]
async fn update_personal_mod(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let snapshot = state.snapshot();
    let instance = instances::resolve(&snapshot, None).map_err(|e| e.to_string())?;
    let (paths, minecraft, _, _, _) = instances::mod_context(&app, &snapshot).await.map_err(|e| e.to_string())?;
    let http = game::download::client();
    let new = game::personal::update(&http, &paths.personal_mods, &id, &minecraft).await.map_err(|e| e.to_string())?;
    // Le nouveau fichier garde l'état activé ou désactivé de l'ancien.
    state.update(|stored| {
        if let Some(disabled) = instances::disabled_mut(stored, &instance.id) {
            for name in disabled.iter_mut().filter(|name| **name == id) { name.clone_from(&new); }
        }
    })
}

/// Applique un skin (et une cape) au compte actif ; seul appel à l'API de skins de Mojang.
#[tauri::command]
async fn apply_skin(
    texture: String,
    model: String,
    cape: Option<String>,
    state: State<'_, AppState>,
    current: State<'_, CurrentSession>,
) -> Result<auth::Profile, String> {
    let mut guard = current.0.lock().await;
    let session = guard.as_ref().ok_or("Aucun compte connecté.")?;
    let updated = skins::apply(session, &texture, &model, cape.as_deref()).await.map_err(|e| e.to_string())?;
    let profile = updated.profile.clone();
    state.update(|stored| stored.upsert_account(account_ref(&profile)))?;
    *guard = Some(updated);
    Ok(profile)
}

#[tauri::command]
async fn play(
    app: AppHandle,
    state: State<'_, AppState>,
    current: State<'_, CurrentSession>,
    presence: State<'_, Presence>,
    mode: Option<String>,
    server: Option<String>,
    instance_id: Option<String>,
) -> Result<(), game::GameError> {
    let gate = app.state::<LaunchGate>();
    let _guard = gate.0.try_lock().map_err(|_| game::GameError::AlreadyRunning)?;
    if app.state::<game::console::Console>().running() || instances::managed_game_running(&state.root) {
        return Err(game::GameError::AlreadyRunning);
    }
    let session = current.0.lock().await.clone().ok_or(game::GameError::NotSignedIn)?;
    let stored = state.snapshot();
    let instance = instances::resolve(&stored, instance_id.as_deref())?;
    // L'interface ne propose que des serveurs du journal Quick Play : rien d'autre n'est lancé.
    let destination = match server {
        Some(address) if stored.recent_servers.iter().any(|known| known.address == address) => game::Destination::Server(address),
        Some(_) => return Err(game::GameError::UnknownServer),
        None => game::Destination::Mode(mode),
    };
    let clover = instance.kind == instances::Kind::Clover && matches!(destination, game::Destination::Mode(_));
    let settings = stored.settings;
    let options = game::LaunchOptions {
        memory_mb: instance.memory_mb.or_else(|| (!settings.memory_auto).then(|| u64::from(settings.memory_gb) * 1024)),
        java_args: settings.java_args.split_whitespace().map(str::to_owned).collect(),
        fullscreen: settings.fullscreen,
        enabled_mods: (if instance.id == instances::BUILTIN { settings.enabled_mods.as_ref() } else { instance.enabled_mods.as_ref() }).map(|mods| mods.iter().cloned().collect()),
        disabled_personal_mods: if instance.id == instances::BUILTIN { stored.disabled_personal_mods } else { instance.disabled_mods.clone() },
    };
    let handle = app.clone();
    let on_join = move |server: store::RecentServer| {
        handle.state::<history::History>().join(&server.address);
        handle.state::<AppState>().remember_server(server);
    };
    let result = if instance.kind == instances::Kind::Clover {
        game::play(&app, &session, options, destination, on_join, &instance).await
    } else {
        instances::play_personal(&app, &session, options, &instance, on_join).await
    };
    result
        .inspect(|()| eprintln!("[game] Minecraft lancé"))
        .inspect_err(|e| eprintln!("[game] échec du lancement : {e}"))?;
    app.state::<history::History>().begin(&instance.id);
    let _ = state.update(|stored| {
        stored.last_launched_instance = Some(instance.id.clone());
        if instance.id == instances::BUILTIN { stored.clover_last_played = Some(instances::now()); }
        if let Some(entry) = stored.instances.iter_mut().find(|entry| entry.id == instance.id) { entry.last_played = Some(instances::now()); }
    });
    presence.set_state(presence::State::playing_now(clover)).await;

    if let Some(window) = app.get_webview_window("main") {
        match settings.on_launch.as_str() {
            "minimize" => {
                let _ = window.minimize();
            }
            "quit" if settings.keep_in_tray => {
                let _ = window.hide();
            }
            "quit" => app.exit(0),
            _ => {}
        }
    }
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // En premier : une seconde instance réaffiche la fenêtre existante puis se ferme.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![MINIMIZED_ARG])))
        // Taille, position et état agrandi retrouvés d'une ouverture à l'autre. Sans `VISIBLE` : la
        // fenêtre reste cachée au démarrage avec l'ordinateur.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_denylist(&["tray-menu"])
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .build(),
        )
        .manage(CurrentSession::default())
        .manage(LaunchGate::default())
        .manage(history::History::default())
        .manage(import::Detected::default())
        .manage(Presence::default())
        .manage(update::PendingUpdate::default())
        .setup(|app| {
            let paths = game::Paths::new(app.handle())?;
            let root = paths.root.clone();
            let path = store::path(&root);
            let mut stored = store::Stored::load(&path);
            let last = instances::resolve(&stored, stored.last_launched_instance.as_deref().or(Some(instances::BUILTIN))).unwrap_or_else(|_| instances::Instance::builtin());
            let paths = instances::paths(paths, &last)?;
            // Partie jouée launcher fermé : son dernier serveur est resté dans le journal du jeu.
            if let Some(server) = game::quick_play::last_server(&paths.quick_play_log) {
                if stored.remember_server(server) {
                    let _ = stored.save(&path);
                }
            }
            let discord = stored.settings.discord_presence;
            app.manage(AppState { stored: SyncMutex::new(stored), path, root });
            app.manage(game::console::Console::resume(&paths.game_output));

            // Navigation and play reuse the main window's actions; left click still opens it.
            let open = MenuItem::with_id(app, "open", "Ouvrir le Clover Launcher", true, None::<&str>)?;
            let play = MenuItem::with_id(app, "play", "Jouer (instance sélectionnée)", false, None::<&str>)?;
            let instances = MenuItem::with_id(app, "instances", "Instances", false, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Paramètres", false, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &separator, &play, &instances, &settings, &quit_separator, &quit])?;
            app.manage(TrayMenu { _menu: menu.clone(), play, navigation: vec![instances, settings] });
            #[cfg(windows)]
            let custom_popup = match tray_popup::create(app.handle()) {
                Ok(()) => true,
                Err(error) => {
                    eprintln!("[tray] menu personnalisé indisponible : {error}");
                    false
                }
            };
            #[cfg(not(windows))]
            let custom_popup = false;
            let mut tray = TrayIconBuilder::with_id("main").tooltip("Clover Launcher").show_menu_on_left_click(false);
            if !custom_popup {
                tray = tray.menu(&menu);
            }
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| {
                if let Err(error) = handle_tray_action(app, event.id.as_ref()) {
                    eprintln!("[tray] action non transmise : {error}");
                }
            })
            .on_tray_icon_event(move |tray, event| {
                if let TrayIconEvent::Click { button, button_state: MouseButtonState::Up, position, .. } = event {
                    match button {
                        MouseButton::Left => show_main_window(tray.app_handle()),
                        MouseButton::Right if custom_popup => {
                            #[cfg(windows)]
                            if let Err(error) = tray_popup::show(tray.app_handle(), position) {
                                eprintln!("[tray] menu non ouvert : {error}");
                            }
                            #[cfg(not(windows))]
                            let _ = position;
                        }
                        _ => {}
                    }
                }
            })
            .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                // Fermer la fenêtre la range dans la zone de notification si le réglage le demande.
                let handle = app.handle().clone();
                let hide_target = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        if handle.state::<AppState>().snapshot().settings.keep_in_tray {
                            api.prevent_close();
                            let _ = hide_target.hide();
                        } else {
                            handle.exit(0);
                        }
                    }
                });
                let at_login = std::env::args().any(|arg| arg == MINIMIZED_ARG) || msix::started_by_startup_task();
                if !at_login {
                    window.show()?;
                }
            }

            // Minecraft fermé : retour à « Dans le launcher ».
            let handle = app.handle().clone();
            app.listen("game-exited", move |event| {
                let code = serde_json::from_str(event.payload()).unwrap_or(None);
                handle.state::<history::History>().finish(&handle.state::<AppState>().root, code);
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    handle.state::<Presence>().set_state(presence::State::Launcher).await;
                });
            });
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let presence = handle.state::<Presence>();
                presence.set_state(presence::State::Launcher).await;
                presence.set_enabled(discord).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_stored,
            set_tray_state,
            tray_state,
            tray_menu_action,
            hide_tray_menu,
            restore_session,
            login,
            use_account,
            remove_account,
            save_settings,
            finish_onboarding,
            get_catalogue,
            server_status,
            site_feed,
            system_info,
            storage_usage,
            clean_storage,
            open_game_dir,
            game_console,
            clear_game_console,
            open_logs_dir,
            list_skins,
            add_skin,
            rename_skin,
            remove_skin,
            apply_skin,
            list_personal_mods,
            add_personal_mod,
            remove_personal_mod,
            set_personal_mod_enabled,
            update_personal_mod,
            install_personal_dependencies,
            search_modrinth,
            modrinth_project,
            install_modrinth_mod,
            play,
            instances::list_instances,
            instances::install_modpack,
            install_modrinth_content,
            instances::instance_content,
            instances::set_content_enabled,
            instances::trash_content,
            history::play_history,
            instances::instance_versions,
            instances::fabric_loaders,
            instances::save_instance,
            instances::select_instance,
            instances::set_instances_view,
            instances::remove_instance,
            instances::open_instance_folder,
            instances::set_instance_catalogue,
            import::detect_installations,
            import::import_installation,
            check_update,
            install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
