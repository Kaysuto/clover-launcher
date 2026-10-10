mod auth;
mod crash;
mod discover;
mod game;
mod history;
mod import;
mod instances;
mod location;
mod machine;
mod msix;
mod notifications;
mod player_name;
mod profile;
mod presence;
mod shortcut;
mod site;
mod skins;
mod status;
mod steam;
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
    crash::set(settings.crash_reports, settings.beta_channel);
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

/// « Rétablir les réglages recommandés » de l'instance Clover Games : préréglages du niveau de la
/// machine, anciens fichiers gardés en `.bak`. Pas pendant une partie : le jeu réécrirait
/// `options.txt` en quittant. Renvoie les fichiers écrits.
#[tauri::command]
async fn reset_recommended(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    if app.state::<game::games::Games>().any_running() || instances::managed_game_running(&state.root) {
        return Err("Ferme Minecraft avant de rétablir les réglages.".into());
    }
    let manifest = game::catalogue(&app).await.map_err(|e| e.to_string())?;
    if manifest.presets.is_empty() {
        return Err("Aucun réglage recommandé n'est encore publié.".into());
    }
    let paths = instances::paths(game::Paths::new(&app).map_err(|e| e.to_string())?, &instances::Instance::builtin()).map_err(|e| e.to_string())?;
    game::apply_presets(&paths, &manifest, &manifest.minecraft.version, true).map_err(|e| e.to_string())
}

/// Retient la version de Minecraft du serveur ; renvoie l'ancienne si elle change (à annoncer).
#[tauri::command]
fn note_server_version(version: String, state: State<'_, AppState>) -> Result<Option<String>, String> {
    state.update(|stored| {
        let previous = stored.server_minecraft.replace(version.clone());
        previous.filter(|previous| *previous != version)
    })
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

/// Page Actualités : blog de Clover Games et annonces officielles de Minecraft.
#[tauri::command]
async fn news_page() -> site::NewsPage {
    site::news_page().await
}

/// Article du blog de Clover Games, lu dans le launcher.
#[tauri::command]
async fn blog_article(slug: String) -> Result<site::BlogArticle, String> {
    site::blog_article(&slug).await
}

/// Note de version Minecraft complète.
#[tauri::command]
async fn minecraft_article(id: String) -> Result<site::MinecraftArticle, String> {
    site::minecraft_article(&id).await
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
    /// Icône de zone de notification visible (GNOME sans AppIndicator : non).
    tray: bool,
    /// Raccourcis d'instance sur le bureau possibles (Windows hors Store, Linux).
    desktop_shortcuts: bool,
    /// Profil de la machine et niveau des réglages recommandés.
    machine: &'static machine::Profile,
    /// DSN et version pour les rapports de plantage de l'interface (avec l'accord du joueur).
    crash: crash::Reporting,
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
        tray: tray_supported(),
        desktop_shortcuts: shortcut::supported(),
        machine: machine::profile(),
        crash: crash::reporting(),
    })
}

/// Versions (dossiers de `versions/`) des instances : Clover suit le manifeste. `None` si l'une
/// n'est pas connue ou qu'un jeu Clover est ouvert : aucune version n'est alors supprimable.
async fn kept_versions(app: &AppHandle, state: &AppState) -> Option<std::collections::HashSet<String>> {
    if app.state::<game::games::Games>().any_running() || instances::managed_game_running(&state.root) {
        return None;
    }
    let manifest = game::catalogue(app).await.ok()?;
    let clover = (manifest.minecraft.version.clone(), Some(manifest.fabric.loader.clone()));
    let mut keep = std::collections::HashSet::new();
    for instance in state.snapshot().instances {
        let (minecraft, loader) = match instance.kind {
            instances::Kind::Clover => clover.clone(),
            _ => (instance.minecraft?, instance.loader),
        };
        if let Some(loader) = loader {
            keep.insert(format!("fabric-loader-{loader}-{minecraft}"));
        }
        keep.insert(minecraft);
    }
    keep.insert(format!("fabric-loader-{}-{}", clover.1.unwrap_or_default(), clover.0));
    keep.insert(clover.0);
    Some(keep)
}

/// `retention_days` : réglage affiché, pas encore forcément enregistré (`logRetentionDays`).
#[tauri::command]
async fn storage_usage(retention_days: u32, app: AppHandle, state: State<'_, AppState>) -> Result<storage::Usage, String> {
    let keep = kept_versions(&app, &state).await;
    let (root, retention) = (state.root.clone(), storage::retention(retention_days));
    tauri::async_runtime::spawn_blocking(move || storage::usage(&root, keep.as_ref(), retention)).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn clean_storage(retention_days: u32, app: AppHandle, state: State<'_, AppState>) -> Result<u64, String> {
    let keep = kept_versions(&app, &state).await;
    let (root, retention) = (state.root.clone(), storage::retention(retention_days));
    tauri::async_runtime::spawn_blocking(move || storage::clean(&root, keep.as_ref(), retention)).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn open_game_dir(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let game = state.root.join("game");
    std::fs::create_dir_all(&game).map_err(|e| e.to_string())?;
    app.opener().open_path(game.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Sortie du jeu de l'instance après l'entrée `after` (0 : tout ce qui est gardé), pour la
/// console et l'écran de plantage.
#[tauri::command]
fn game_console(instance: String, after: u64, games: State<'_, game::games::Games>) -> game::console::Snapshot {
    games.snapshot(&instance, after)
}

/// « Partager » de la console et de l'écran de plantage : publie le journal sur mclo.gs et
/// renvoie l'adresse de sa page.
#[tauri::command]
async fn share_log(log: String, current: State<'_, CurrentSession>) -> Result<String, game::GameError> {
    let token = current.0.lock().await.as_ref().map(|session| session.minecraft_token.clone());
    game::share::upload(&game::download::client(), &log, token.as_deref()).await
}

/// Bouton « Effacer » de la console ; `logs/game-output.log` reste complet.
#[tauri::command]
fn clear_game_console(instance: String, games: State<'_, game::games::Games>) {
    if let Some(game) = games.find(&instance) {
        game.console.clear();
    }
}

/// Instances dont le jeu, lancé par ce launcher, est ouvert.
#[tauri::command]
fn running_games(games: State<'_, game::games::Games>) -> Vec<String> {
    games.running()
}

/// « Fermer le jeu » : demandé comme par la croix de la fenêtre (le monde ouvert est sauvegardé) ;
/// avec `force`, le processus est tué. `false` si la fenêtre du jeu n'est pas encore ouverte.
#[tauri::command]
fn stop_game(instance: String, force: bool, games: State<'_, game::games::Games>) -> Result<bool, String> {
    let game = games.find(&instance).filter(|game| game.running()).ok_or("Ce jeu est déjà fermé.")?;
    if force {
        game.kill();
        return Ok(true);
    }
    let pid = game.pid().ok_or("Processus du jeu inconnu : force la fermeture.")?;
    game::window_title::close(pid).map_err(|e| format!("Fermeture impossible : {e}"))
}

/// Nouvelle version du launcher sur le CDN ; `None` si celle-ci est la dernière.
#[tauri::command]
async fn check_update(app: AppHandle, pending: State<'_, update::PendingUpdate>) -> Result<Option<update::UpdateInfo>, String> {
    update::check(&app, &pending).await.inspect_err(|e| eprintln!("[update] {e}"))
}

/// Installe la version trouvée par `check_update` puis relance le launcher. Pas pendant une
/// partie : le launcher fermé, la console et le suivi des serveurs rejoints s'arrêteraient.
#[tauri::command]
async fn install_update(app: AppHandle, pending: State<'_, update::PendingUpdate>, games: State<'_, game::games::Games>) -> Result<(), String> {
    if games.any_running() {
        return Err("Ferme Minecraft avant de mettre à jour le launcher.".into());
    }
    update::install(&app, &pending).await.inspect_err(|e| eprintln!("[update] {e}"))
}

#[derive(Serialize)]
struct SkinLists {
    library: Vec<skins::SkinEntry>,
}

#[tauri::command]
async fn list_skins(state: State<'_, AppState>) -> Result<SkinLists, String> {
    let root = state.root.clone();
    tauri::async_runtime::spawn_blocking(move || SkinLists { library: skins::library(&root) })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn add_skin(bytes: Vec<u8>, name: String, model: String, state: State<'_, AppState>) -> Result<skins::SkinEntry, skins::SkinError> {
    skins::add(&state.root, &bytes, &name, &model)
}

/// Ajoute à la bibliothèque un skin de la Découverte ou porté par un joueur.
#[tauri::command]
async fn add_remote_skin(texture: String, name: String, model: String, state: State<'_, AppState>) -> Result<skins::SkinEntry, skins::SkinError> {
    skins::add_remote(&state.root, &texture, &name, &model).await
}

/// Enregistre un skin en .png là où le joueur le choisit ; `None` s'il annule.
#[tauri::command]
async fn export_skin(texture: String, name: String, app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let bytes = skins::png(&texture).await.map_err(|e| e.to_string())?;
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title("Exporter le skin").set_file_name(skins::file_name(&name)).add_filter("Image PNG", &["png"]).blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(path) = chosen.and_then(|path| path.into_path().ok()) else { return Ok(None) };
    std::fs::write(&path, bytes).map_err(|e| format!("Impossible d'enregistrer le skin : {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Corps brut : une image PNG (carte de profil) ; en-tête `x-filename` : nom proposé, encodé pour
/// l'URL. Enregistrée là où le joueur le choisit ; `None` s'il annule.
#[tauri::command]
async fn save_png(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("Image manquante.".into()) };
    if bytes.len() > 8 * 1024 * 1024 || !bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Err("Ce n'est pas une image PNG.".into());
    }
    let bytes = bytes.clone();
    let name = request
        .headers()
        .get("x-filename")
        .and_then(|value| value.to_str().ok())
        .and_then(|encoded| url::form_urlencoded::parse(format!("n={encoded}").as_bytes()).next().map(|(_, name)| name.into_owned()))
        .unwrap_or_default();
    let file = skins::file_name(&name);
    let chosen = tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_title("Enregistrer la carte").set_file_name(file).add_filter("Image PNG", &["png"]).blocking_save_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(path) = chosen.and_then(|path| path.into_path().ok()) else { return Ok(None) };
    std::fs::write(&path, bytes).map_err(|e| format!("Impossible d'enregistrer l'image : {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Découverte : étiquettes de skins de laby.net.
#[tauri::command]
async fn discover_tags() -> Result<Vec<discover::SkinTag>, String> {
    discover::tags().await
}

/// Découverte : une page de skins de laby.net.
#[tauri::command]
async fn discover_skins(input: String, order: String, offset: u32) -> Result<Vec<discover::CommunitySkin>, String> {
    discover::skins(&input, &order, offset).await
}

/// Découverte : capes officielles (capes.me).
#[tauri::command]
async fn discover_capes() -> Result<Vec<discover::CatalogueCape>, String> {
    discover::capes().await
}

/// Découverte : joueurs vus avec une cape (laby.net).
#[tauri::command]
async fn cape_wearers(laby_id: String) -> Result<discover::CapeWearers, String> {
    discover::cape_wearers(&laby_id).await
}

/// Découverte : skin et cape actuels d'un joueur (Mojang).
#[tauri::command]
async fn player_look(name: String) -> Result<Option<discover::PlayerLook>, String> {
    discover::player(&name).await
}

#[tauri::command]
fn rename_skin(id: String, name: String, state: State<'_, AppState>) -> Result<String, skins::SkinError> {
    skins::rename(&state.root, &id, &name)
}

#[tauri::command]
fn set_skin_model(id: String, model: String, state: State<'_, AppState>) -> Result<(), skins::SkinError> {
    skins::set_model(&state.root, &id, &model)
}

#[tauri::command]
fn remove_skin(id: String, state: State<'_, AppState>) -> Result<(), skins::SkinError> {
    skins::remove(&state.root, &id)
}

/// « Mes mods » de l'instance `instance`, de l'instance choisie sans elle.
#[tauri::command]
async fn list_personal_mods(instance: Option<String>, app: AppHandle, state: State<'_, AppState>) -> Result<Vec<game::personal::PersonalMod>, game::GameError> {
    let context = instances::mod_context(&app, &state.snapshot(), instance.as_deref()).await?;
    Ok(game::personal::list(&game::download::client(), &context.paths.personal_mods, &context.disabled, &context.minecraft, context.loader).await)
}

/// Recherche sur Modrinth pour la version de Minecraft de l'instance `instance` (l'instance choisie
/// sans elle). Les mods marquent ceux que le catalogue Clover fournit déjà.
#[tauri::command]
async fn search_modrinth(kind: game::modrinth::Kind, query: String, offset: u32, instance: Option<String>, app: AppHandle, state: State<'_, AppState>) -> Result<game::modrinth::SearchPage, game::GameError> {
    let http = game::download::client();
    if kind != game::modrinth::Kind::Mod {
        let (_, _, minecraft) = instances::game_context(&app, &state.snapshot(), instance.as_deref()).await?;
        return game::modrinth::search(&http, kind, &query, &minecraft, "fabric", offset).await;
    }
    let context = instances::mod_context(&app, &state.snapshot(), instance.as_deref()).await?;
    let mut page = game::modrinth::search(&http, kind, &query, &context.minecraft, context.loader.modrinth(), offset).await?;
    if let Some(manifest) = &context.manifest { page.mark_provided(&manifest.mods_to_install(&context.enabled)); }
    Ok(page)
}

/// Pack de ressources, shader ou datapack (dans le monde `world`) pour l'instance `instance`
/// (l'instance choisie sans elle) ; renvoie le nom du fichier. Un shader sur une instance
/// personnelle installe aussi Iris (Oculus sous Forge) ; la sélection Clover fournit déjà Iris.
#[tauri::command]
async fn install_modrinth_content(kind: game::modrinth::Kind, project: String, world: Option<String>, instance: Option<String>, app: AppHandle, state: State<'_, AppState>) -> Result<String, game::GameError> {
    use game::modrinth::Kind;
    let http = game::download::client();
    let (instance, paths, minecraft) = instances::game_context(&app, &state.snapshot(), instance.as_deref()).await?;
    let dir = match kind {
        Kind::Resourcepack => paths.game.join("resourcepacks"),
        Kind::Shader if instance.kind == instances::Kind::Vanilla => {
            return Err(game::GameError::InvalidVersion("les shaders demandent Iris : choisis une instance Clover, Fabric, Forge ou NeoForge".into()));
        }
        Kind::Shader => paths.game.join("shaderpacks"),
        Kind::Datapack => {
            let world = world.ok_or_else(|| game::GameError::InvalidVersion("choisis un monde".into()))?;
            game::content::world_dir(&paths.game.join("saves"), &world)?.join("datapacks")
        }
        Kind::Mod | Kind::Modpack => return Err(game::GameError::InvalidVersion("type de contenu inattendu".into())),
    };
    let filename = game::content::install_archive(&http, &dir, kind, &project, &minecraft).await?;
    if let Some(loader) = instance.kind.mod_loader().filter(|_| kind == Kind::Shader && instance.kind != instances::Kind::Clover) {
        let project = if loader == game::personal::ModLoader::Forge { "oculus" } else { "iris" };
        game::personal::install(&http, &paths.personal_mods, project, &minecraft, loader, &[]).await?;
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

/// Installe un mod trouvé sur Modrinth (et ses dépendances) dans « Mes mods » de l'instance
/// `instance` (l'instance choisie sans elle).
#[tauri::command]
async fn install_modrinth_mod(project: String, instance: Option<String>, app: AppHandle, state: State<'_, AppState>) -> Result<Vec<String>, game::GameError> {
    let context = instances::mod_context(&app, &state.snapshot(), instance.as_deref()).await?;
    game::personal::install(&game::download::client(), &context.paths.personal_mods, &project, &context.minecraft, context.loader, &context.provided()).await
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
    let context = instances::mod_context(&app, &state.snapshot(), None).await?;
    game::personal::install_dependencies(&game::download::client(), &context.paths.personal_mods, &files, &context.minecraft, context.loader, &context.provided()).await
}

/// Remplace un mod du joueur par sa version pour Minecraft du serveur, trouvée sur Modrinth.
#[tauri::command]
async fn update_personal_mod(id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let snapshot = state.snapshot();
    let instance = instances::resolve(&snapshot, None).map_err(|e| e.to_string())?;
    let context = instances::mod_context(&app, &snapshot, None).await.map_err(|e| e.to_string())?;
    let http = game::download::client();
    let new = game::personal::update(&http, &context.paths.personal_mods, &id, &context.minecraft, context.loader).await.map_err(|e| e.to_string())?;
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

/// Pseudo du compte actif : changement possible maintenant, sinon date du dernier.
#[tauri::command]
async fn name_change_info(current: State<'_, CurrentSession>) -> Result<player_name::NameChange, String> {
    let session = current.0.lock().await.clone().ok_or("Aucun compte connecté.")?;
    player_name::change_info(&session).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn name_availability(name: String, current: State<'_, CurrentSession>) -> Result<player_name::Availability, String> {
    let session = current.0.lock().await.clone().ok_or("Aucun compte connecté.")?;
    player_name::availability(&session, &name).await.map_err(|e| e.to_string())
}

/// Change le pseudo du compte actif ; un jeu déjà ouvert garde l'ancien jusqu'à sa relance.
#[tauri::command]
async fn change_name(name: String, state: State<'_, AppState>, current: State<'_, CurrentSession>, presence: State<'_, Presence>) -> Result<auth::Profile, String> {
    let mut guard = current.0.lock().await;
    let session = guard.as_ref().ok_or("Aucun compte connecté.")?;
    let updated = player_name::change(session, &name).await.map_err(|e| e.to_string())?;
    let profile = updated.profile.clone();
    eprintln!("[auth] pseudo changé : {} ({})", profile.name, profile.uuid);
    state.update(|stored| stored.upsert_account(account_ref(&profile)))?;
    *guard = Some(updated);
    drop(guard);
    presence.set_player(Some(presence::Player { uuid: profile.uuid.clone(), name: profile.name.clone() })).await;
    Ok(profile)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn play(
    app: AppHandle,
    state: State<'_, AppState>,
    current: State<'_, CurrentSession>,
    presence: State<'_, Presence>,
    mode: Option<String>,
    server: Option<String>,
    world: Option<String>,
    instance_id: Option<String>,
) -> Result<(), game::GameError> {
    let gate = app.state::<LaunchGate>();
    let _guard = gate.0.try_lock().map_err(|_| game::GameError::AlreadyRunning)?;
    let session = current.0.lock().await.clone().ok_or(game::GameError::NotSignedIn)?;
    let stored = state.snapshot();
    let instance = instances::resolve(&stored, instance_id.as_deref())?;
    // Plusieurs instances jouent ensemble, jamais deux dans le même dossier de jeu.
    let games = app.state::<game::games::Games>();
    if games.find(&instance.id).is_some_and(|game| game.running()) {
        return Err(game::GameError::AlreadyRunning);
    }
    let game_dir = instances::paths(game::Paths::new(&app)?, &instance)?.game;
    if let Some(other) = games.using(&game_dir) {
        let name = instances::resolve(&stored, Some(&other)).map_or(other, |other| other.name);
        return Err(game::GameError::FolderInUse(name));
    }
    // Jeu laissé ouvert par un launcher fermé depuis.
    let (root, dir) = (state.root.clone(), game_dir.clone());
    if tauri::async_runtime::spawn_blocking(move || instances::open_game_dirs(&root).iter().any(|open| game::games::same_dir(open, &dir))).await.unwrap_or(false) {
        return Err(game::GameError::AlreadyRunning);
    }
    // L'interface ne propose que des serveurs du journal Quick Play : rien d'autre n'est lancé.
    let destination = match (server, world) {
        (Some(address), _) if stored.recent_servers.iter().any(|known| known.address == address) => game::Destination::Server(address),
        (Some(_), _) => return Err(game::GameError::UnknownServer),
        // Seulement un monde existant de ce dossier de jeu.
        (None, Some(world)) => {
            game::content::world_dir(&game_dir.join("saves"), &world)?;
            game::Destination::World(world)
        }
        (None, None) => mode.map_or(game::Destination::Menu, game::Destination::Mode),
    };
    let clover = instance.kind == instances::Kind::Clover && matches!(destination, game::Destination::Menu | game::Destination::Mode(_));
    let settings = stored.settings;
    let options = game::LaunchOptions {
        memory_mb: instance.memory_mb.or_else(|| (!settings.memory_auto).then(|| u64::from(settings.memory_gb) * 1024)),
        // Ceux du launcher, puis ceux de l'instance.
        java_args: settings.java_args.split_whitespace().chain(instance.java_args.as_deref().unwrap_or_default().split_whitespace()).map(str::to_owned).collect(),
        fullscreen: settings.fullscreen,
        // Taille absurde (champ vidé, valeur tapée à moitié) : celle du jeu.
        resolution: settings.resolution.map(|size| (size.width, size.height)).filter(|&(width, height)| (320..=16384).contains(&width) && (240..=16384).contains(&height)),
        graphics_backend: match settings.graphics_backend.as_str() {
            "opengl" => Some("opengl"),
            "vulkan" => Some("vulkan"),
            _ => None,
        },
        enabled_mods: (if instance.id == instances::BUILTIN { settings.enabled_mods.as_ref() } else { instance.enabled_mods.as_ref() }).map(|mods| mods.iter().cloned().collect()),
        disabled_personal_mods: if instance.id == instances::BUILTIN { stored.disabled_personal_mods } else { instance.disabled_mods.clone() },
    };
    let handle = app.clone();
    let joined = instance.id.clone();
    let on_join = move |server: store::RecentServer| {
        handle.state::<history::History>().join(&handle.state::<AppState>().root, &joined, &server.address);
        handle.state::<AppState>().remember_server(server);
    };
    // Notée avant le lancement : le jeu peut se fermer avant que `play` ne rende la main.
    app.state::<history::History>().begin(&state.root, &instance.id);
    let result = if instance.kind == instances::Kind::Clover {
        game::play(&app, &session, options, destination, on_join, &instance).await
    } else {
        let world = match destination {
            game::Destination::World(world) => Some(world),
            _ => None,
        };
        instances::play_personal(&app, &session, options, &instance, world, on_join).await
    };
    if result.is_err() {
        app.state::<history::History>().cancel(&state.root, &instance.id);
    }
    result
        .inspect(|()| eprintln!("[game] Minecraft lancé"))
        .inspect_err(|e| eprintln!("[game] échec du lancement : {e}"))?;
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
            "quit" if keeps_in_tray(&settings) => {
                let _ = window.hide();
            }
            "quit" => app.exit(0),
            _ => {}
        }
    }
    Ok(())
}

/// GNOME n'affiche les icônes de zone de notification qu'avec l'extension AppIndicator, qui publie
/// le service D-Bus `org.kde.StatusNotifierWatcher`. Les autres bureaux en ont une.
fn tray_hidden_by_desktop(desktop: &str, has_watcher: impl FnOnce() -> bool) -> bool {
    desktop.split(':').any(|name| name.eq_ignore_ascii_case("gnome")) && !has_watcher()
}

/// Icône de zone de notification visible : sinon fermer la fenêtre quitte le launcher, qui ne
/// pourrait plus être rouvert. Vérifié une fois par lancement.
fn tray_supported() -> bool {
    static SUPPORTED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *SUPPORTED.get_or_init(|| {
        if !cfg!(target_os = "linux") {
            return true;
        }
        let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
        !tray_hidden_by_desktop(&desktop, || {
            let query = ["call", "--session", "--dest", "org.freedesktop.DBus", "--object-path", "/org/freedesktop/DBus", "--method", "org.freedesktop.DBus.NameHasOwner", "org.kde.StatusNotifierWatcher"];
            // Sans `gdbus` pour répondre, on suppose l'icône visible, comme avant.
            std::process::Command::new("gdbus").args(query).output().map_or(true, |output| String::from_utf8_lossy(&output.stdout).contains("true"))
        })
    })
}

/// Fermer ou lancer le jeu range le launcher dans la zone de notification plutôt que de le quitter.
fn keeps_in_tray(settings: &store::Settings) -> bool {
    settings.keep_in_tray && tray_supported()
}

/// Partie lancée par un launcher fermé depuis (mise à jour, redémarrage) : close quand son jeu
/// (celui ouvert dans son dossier de jeu) s'arrête, d'après le journal du jeu.
async fn recover_session(app: AppHandle, session: history::Session, paths: game::Paths) {
    let root = app.state::<AppState>().root.clone();
    loop {
        let (probe, dir) = (root.clone(), paths.game.clone());
        let open = tauri::async_runtime::spawn_blocking(move || instances::open_game_dirs(&probe).iter().any(|open| game::games::same_dir(open, &dir))).await.unwrap_or(false);
        if !open {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
    let last_server = game::quick_play::last_server(&paths.quick_play_log).map(|server| server.address);
    app.state::<history::History>().recover(&root, session, &paths.game, last_server);
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
    // Rapports de plantage : client prêt dès le départ, muet tant que les réglages (lus dans
    // `setup`) ne donnent pas l'accord du joueur.
    let _crash_reports = crash::init();
    tauri::Builder::default()
        // En premier : une seconde instance réaffiche la fenêtre existante puis se ferme.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Raccourci d'instance ou lien `clover://` ouvert launcher ouvert : l'interface lance la partie.
            if app.state::<shortcut::LaunchRequest>().take_from(&args) {
                let _ = app.emit("launch-request", ());
            }
            show_main_window(app)
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
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
        .manage(shortcut::LaunchRequest::from_env())
        .manage(import::Detected::default())
        .manage(Presence::default())
        .manage(notifications::SiteTokens::default())
        .manage(update::PendingUpdate::default())
        .setup(|app| {
            // Liens `clover://` : sous macOS, ils arrivent par le plugin et non en argument. Sous
            // Windows et Linux, l'installeur déclare le schéma ; l'AppImage (et le développement
            // sous Windows) le déclarent à l'exécution.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                #[cfg(any(target_os = "linux", all(windows, debug_assertions)))]
                {
                    if let Err(error) = app.deep_link().register_all() {
                        eprintln!("[liens] schéma clover:// non déclaré : {error}");
                    }
                }
                #[cfg(target_os = "macos")]
                {
                    if let Ok(Some(urls)) = app.deep_link().get_current() {
                        let request = app.state::<shortcut::LaunchRequest>();
                        urls.iter().for_each(|url| {
                            request.take_url(url.as_str());
                        });
                    }
                }
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let request = handle.state::<shortcut::LaunchRequest>();
                    if event.urls().iter().any(|url| request.take_url(url.as_str())) {
                        let _ = handle.emit("launch-request", ());
                    }
                    show_main_window(&handle);
                });
            }
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
            if let Some(retention) = storage::retention(stored.settings.log_retention_days) {
                let root = root.clone();
                tauri::async_runtime::spawn_blocking(move || storage::purge_logs(&root, retention));
            }
            crash::set(stored.settings.crash_reports, stored.settings.beta_channel);
            app.manage(AppState { stored: SyncMutex::new(stored), path, root: root.clone() });
            // Parties laissées par un launcher fermé entre-temps : la console d'un jeu toujours
            // ouvert est reprise ; sinon on repart à vide, la partie précédente reste dans les
            // journaux. Chacune est close à la fermeture de son jeu.
            let history = history::History::resume(&root);
            let games = game::games::Games::default();
            let open = instances::open_game_dirs(&root);
            let stored = app.state::<AppState>().snapshot();
            for session in history::pending(&root) {
                let Ok(paths) = instances::resolve(&stored, Some(&session.instance)).and_then(|instance| instances::paths(game::Paths::from_root(root.clone()), &instance)) else {
                    eprintln!("[history] instance de la partie interrompue introuvable");
                    continue;
                };
                if open.iter().any(|dir| game::games::same_dir(dir, &paths.game)) {
                    games.resume(&session.instance, game::console::Console::resume(&paths.game_output));
                }
                tauri::async_runtime::spawn(recover_session(app.handle().clone(), session, paths));
            }
            app.manage(history);
            app.manage(games);

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
                        if keeps_in_tray(&handle.state::<AppState>().snapshot().settings) {
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
                } else if !tray_supported() {
                    // Sans icône, une fenêtre cachée serait introuvable : réduite dans la barre.
                    window.show()?;
                    window.minimize()?;
                }
            }

            // Dernier Minecraft fermé : retour à « Dans le launcher ».
            let handle = app.handle().clone();
            app.listen("game-exited", move |_| {
                let handle = handle.clone();
                if handle.state::<game::games::Games>().any_running() {
                    return;
                }
                tauri::async_runtime::spawn(async move {
                    handle.state::<Presence>().set_state(presence::State::Launcher).await;
                });
            });
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let presence = handle.state::<Presence>();
                presence.set_state(presence::State::Launcher).await;
                presence.set_enabled(discord).await;
                presence.keep_alive().await;
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
            note_server_version,
            reset_recommended,
            notifications::notifications,
            profile::player_stats,
            notifications::mark_notifications_read,
            notifications::system_notification,
            location::pick_game_dir,
            location::move_game_dir,
            steam::steam_status,
            steam::steam_add,
            steam::steam_remove,
            get_catalogue,
            server_status,
            site_feed,
            news_page,
            blog_article,
            minecraft_article,
            system_info,
            storage_usage,
            clean_storage,
            open_game_dir,
            game_console,
            share_log,
            clear_game_console,
            running_games,
            stop_game,
            list_skins,
            add_skin,
            rename_skin,
            set_skin_model,
            remove_skin,
            add_remote_skin,
            export_skin,
            save_png,
            discover_tags,
            discover_skins,
            discover_capes,
            cape_wearers,
            player_look,
            apply_skin,
            name_change_info,
            name_availability,
            change_name,
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
            instances::import_modpack_file,
            install_modrinth_content,
            instances::instance_content,
            instances::game_logs,
            instances::rename_world,
            instances::rename_server,
            import::import_as_instance,
            instances::set_instance_pinned,
            instances::duplicate_instance,
            shortcut::create_desktop_shortcut,
            shortcut::take_launch_request,
            instances::read_game_log,
            instances::clear_instance_logs,
            instances::export_modpack,
            instances::set_content_enabled,
            instances::trash_content,
            history::play_history,
            instances::instance_versions,
            instances::download_size,
            instances::instance_loaders,
            instances::save_instance,
            instances::select_instance,
            instances::update_instance,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gnome_needs_the_appindicator_extension() {
        assert!(tray_hidden_by_desktop("GNOME", || false));
        assert!(tray_hidden_by_desktop("ubuntu:GNOME", || false));
        assert!(!tray_hidden_by_desktop("ubuntu:GNOME", || true));
        assert!(!tray_hidden_by_desktop("KDE", || false));
        assert!(!tray_hidden_by_desktop("", || false));
        assert!(!tray_hidden_by_desktop("GNOME-Flashback", || false));
    }
}
