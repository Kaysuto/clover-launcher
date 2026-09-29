mod auth;
mod game;
mod presence;

use presence::Presence;
use tauri::{AppHandle, Listener, Manager, State};
use tokio::sync::Mutex;

/// Session du compte actif. Le jeton Minecraft reste côté Rust ; l'interface ne voit que le profil.
#[derive(Default)]
struct CurrentSession(Mutex<Option<auth::Session>>);

#[tauri::command]
async fn login(app: AppHandle, current: State<'_, CurrentSession>) -> Result<auth::Profile, auth::AuthError> {
    let session = auth::login(&app)
        .await
        .inspect_err(|e| eprintln!("[auth] échec de la connexion : {e}"))?;
    let profile = session.profile.clone();
    eprintln!("[auth] connecté : {} ({})", profile.name, profile.uuid);
    *current.0.lock().await = Some(session);
    Ok(profile)
}

#[tauri::command]
async fn restore_session(current: State<'_, CurrentSession>) -> Result<Option<auth::Profile>, auth::AuthError> {
    let session = auth::restore()
        .await
        .inspect_err(|e| eprintln!("[auth] échec de la reconnexion : {e}"))?;
    let profile = session.as_ref().map(|s| s.profile.clone());
    *current.0.lock().await = session;
    Ok(profile)
}

#[tauri::command]
async fn logout(current: State<'_, CurrentSession>) -> Result<(), auth::AuthError> {
    auth::logout()?;
    *current.0.lock().await = None;
    Ok(())
}

#[tauri::command]
async fn play(
    app: AppHandle,
    current: State<'_, CurrentSession>,
    presence: State<'_, Presence>,
) -> Result<(), game::GameError> {
    let session = current.0.lock().await.clone().ok_or(game::GameError::NotSignedIn)?;
    game::play(&app, &session)
        .await
        .inspect(|()| eprintln!("[game] Minecraft lancé"))
        .inspect_err(|e| eprintln!("[game] échec du lancement : {e}"))?;
    presence.set_state(presence::State::playing_now()).await;
    Ok(())
}

/// Réglage « Afficher mon activité sur Discord » ; le statut « Dans le launcher » suit l'activation.
#[tauri::command]
async fn set_discord_presence(enabled: bool, presence: State<'_, Presence>) -> Result<(), String> {
    presence.set_enabled(enabled).await;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CurrentSession::default())
        .manage(Presence::default())
        .setup(|app| {
            // Minecraft fermé : retour à « Dans le launcher ».
            let handle = app.handle().clone();
            app.listen("game-exited", move |_| {
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    handle.state::<Presence>().set_state(presence::State::Launcher).await;
                });
            });
            // Statut actif par défaut, comme la maquette des paramètres ; la valeur enregistrée
            // remplacera ce défaut quand les paramètres seront persistés (CLO-274).
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let presence = handle.state::<Presence>();
                presence.set_state(presence::State::Launcher).await;
                presence.set_enabled(true).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![login, restore_session, logout, play, set_discord_presence])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
