mod auth;
mod game;

use tauri::{AppHandle, State};
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
async fn play(app: AppHandle, current: State<'_, CurrentSession>) -> Result<(), game::GameError> {
    let session = current.0.lock().await.clone().ok_or(game::GameError::NotSignedIn)?;
    game::play(&app, &session)
        .await
        .inspect(|()| eprintln!("[game] Minecraft lancé"))
        .inspect_err(|e| eprintln!("[game] échec du lancement : {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CurrentSession::default())
        .invoke_handler(tauri::generate_handler![login, restore_session, logout, play])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
