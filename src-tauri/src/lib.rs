mod auth;
mod game;
mod presence;
mod site;
mod skins;
mod status;
mod storage;
mod store;

use std::path::PathBuf;
use std::sync::Mutex as SyncMutex;

use presence::Presence;
use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager, State, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

/// Argument ajouté au démarrage avec l'ordinateur : le launcher démarre sans fenêtre.
const MINIMIZED_ARG: &str = "--minimized";

/// Session du compte actif. Le jeton Minecraft reste côté Rust ; l'interface ne voit que le profil.
#[derive(Default)]
struct CurrentSession(Mutex<Option<auth::Session>>);

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
        let result = change(&mut stored);
        stored.save(&self.path).map_err(|e| format!("Impossible d'enregistrer les réglages : {e}"))?;
        Ok(result)
    }
}

fn account_ref(profile: &auth::Profile) -> store::AccountRef {
    store::AccountRef { uuid: profile.uuid.clone(), name: profile.name.clone(), skin_url: profile.skin.as_ref().map(|skin| skin.url.clone()) }
}

#[tauri::command]
fn get_stored(state: State<'_, AppState>) -> store::Stored {
    state.snapshot()
}

/// Rouvre la session du compte actif (et reprend le compte de la toute première version).
#[tauri::command]
async fn restore_session(state: State<'_, AppState>, current: State<'_, CurrentSession>) -> Result<Option<auth::Profile>, String> {
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
    *current.0.lock().await = session;
    Ok(profile)
}

/// Ajoute un compte. Le premier ajouté devient le compte actif.
#[tauri::command]
async fn login(app: AppHandle, state: State<'_, AppState>, current: State<'_, CurrentSession>) -> Result<auth::Profile, String> {
    let session = auth::login(&app).await.inspect_err(|e| eprintln!("[auth] échec de la connexion : {e}")).map_err(|e| e.to_string())?;
    let profile = session.profile.clone();
    eprintln!("[auth] connecté : {} ({})", profile.name, profile.uuid);
    let active = state.update(|stored| {
        stored.upsert_account(account_ref(&profile));
        stored.active_account.clone()
    })?;
    if active.as_deref() == Some(profile.uuid.as_str()) {
        *current.0.lock().await = Some(session);
    }
    Ok(profile)
}

#[tauri::command]
async fn use_account(uuid: String, state: State<'_, AppState>, current: State<'_, CurrentSession>) -> Result<auth::Profile, String> {
    let session = auth::restore(&uuid).await.map_err(|e| e.to_string())?.ok_or("Ce compte doit se reconnecter.")?;
    state.update(|stored| stored.active_account = Some(uuid))?;
    let profile = session.profile.clone();
    *current.0.lock().await = Some(session);
    Ok(profile)
}

/// Retire un compte ; renvoie le profil du compte actif qui le remplace, s'il y en a un.
#[tauri::command]
async fn remove_account(uuid: String, state: State<'_, AppState>, current: State<'_, CurrentSession>) -> Result<Option<auth::Profile>, String> {
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
    *current.0.lock().await = session;
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
        let autolaunch = app.autolaunch();
        let result = if settings.start_with_system { autolaunch.enable() } else { autolaunch.disable() };
        result.map_err(|e| format!("Démarrage avec l'ordinateur impossible : {e}"))?;
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
    status::ping(&host, 25565).await
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
}

#[tauri::command]
fn system_info(app: AppHandle) -> Result<SystemInfo, String> {
    let paths = game::Paths::new(&app).map_err(|e| e.to_string())?;
    Ok(SystemInfo {
        total_memory_gb: (game::total_memory_mb() as f64 / 1024.0).round() as u64,
        auto_memory_gb: game::auto_memory_mb() / 1024,
        java: game::installed_java(&paths),
        launcher: env!("CARGO_PKG_VERSION"),
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

/// Dernières lignes de la sortie du jeu, pour l'écran de plantage.
#[tauri::command]
fn game_log_tail(state: State<'_, AppState>) -> String {
    let text = std::fs::read_to_string(state.root.join("logs").join("game-output.log")).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(40)..].join("
")
}

#[tauri::command]
fn open_logs_dir(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let logs = state.root.join("logs");
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
        let defaults = manifest
            .map(|manifest| {
                let version = manifest.minecraft.version;
                skins::defaults(&root.join("versions").join(&version).join(format!("{version}.jar")))
            })
            .unwrap_or_default();
        SkinLists { library: skins::library(&root), defaults }
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn add_skin(bytes: Vec<u8>, name: String, model: String, state: State<'_, AppState>) -> Result<skins::SkinEntry, skins::SkinError> {
    skins::add(&state.root, &bytes, &name, &model)
}

#[tauri::command]
fn remove_skin(id: String, state: State<'_, AppState>) -> Result<(), skins::SkinError> {
    skins::remove(&state.root, &id)
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
) -> Result<(), game::GameError> {
    let session = current.0.lock().await.clone().ok_or(game::GameError::NotSignedIn)?;
    let settings = state.snapshot().settings;
    let options = game::LaunchOptions {
        memory_mb: (!settings.memory_auto).then(|| u64::from(settings.memory_gb) * 1024),
        java_args: settings.java_args.split_whitespace().map(str::to_owned).collect(),
        fullscreen: settings.fullscreen,
        enabled_mods: settings.enabled_mods.as_ref().map(|mods| mods.iter().cloned().collect()),
    };
    game::play(&app, &session, options)
        .await
        .inspect(|()| eprintln!("[game] Minecraft lancé"))
        .inspect_err(|e| eprintln!("[game] échec du lancement : {e}"))?;
    presence.set_state(presence::State::playing_now()).await;

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
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![MINIMIZED_ARG])))
        .manage(CurrentSession::default())
        .manage(Presence::default())
        .setup(|app| {
            let root = game::Paths::new(app.handle())?.root;
            let path = store::path(&root);
            let stored = store::Stored::load(&path);
            let discord = stored.settings.discord_presence;
            app.manage(AppState { stored: SyncMutex::new(stored), path, root });

            // Zone de notification : ouvrir, quitter ; clic sur l'icône = ouvrir.
            let open = MenuItem::with_id(app, "open", "Ouvrir le Clover Launcher", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main").tooltip("Clover Launcher").menu(&menu).show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open" => show_main_window(app),
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    show_main_window(tray.app_handle());
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
                        }
                    }
                });
                if !std::env::args().any(|arg| arg == MINIMIZED_ARG) {
                    window.show()?;
                }
            }

            // Minecraft fermé : retour à « Dans le launcher ».
            let handle = app.handle().clone();
            app.listen("game-exited", move |_| {
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
            game_log_tail,
            open_logs_dir,
            list_skins,
            add_skin,
            remove_skin,
            apply_skin,
            play,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
