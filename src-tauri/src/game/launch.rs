//! Construction de la ligne de commande et démarrage du jeu.

use std::process::Stdio;

use tauri::{AppHandle, Emitter};

use super::install::Installation;
use super::version::expand;
use super::{auto_memory_mb, GameError, LaunchOptions, Paths, Result};
use crate::auth::Session;

pub async fn spawn(
    app: &AppHandle,
    paths: &Paths,
    installation: Installation,
    session: &Session,
    server: &str,
    options: &LaunchOptions,
) -> Result<()> {
    let Installation { java, vanilla, loader, classpath, logging_argument } = installation;
    let natives = paths.natives.join(&loader.id);
    tokio::fs::create_dir_all(&natives).await?;

    let separator = if cfg!(windows) { ";" } else { ":" };
    let classpath = classpath.iter().map(|path| path.to_string_lossy()).collect::<Vec<_>>().join(separator);
    let index = vanilla.asset_index.as_ref().map(|index| index.id.clone()).unwrap_or_default();
    // Minecraft traite une chaîne vide comme « absent » pour clientId et xuid.
    let variables = [
        ("auth_player_name", session.profile.name.clone()),
        ("auth_uuid", session.profile.uuid.replace('-', "")),
        ("auth_access_token", session.minecraft_token.clone()),
        ("auth_xuid", String::new()),
        ("clientid", String::new()),
        ("version_name", loader.id.clone()),
        ("version_type", vanilla.kind.clone().unwrap_or_else(|| "release".into())),
        ("game_directory", paths.game.to_string_lossy().into_owned()),
        ("assets_root", paths.assets.to_string_lossy().into_owned()),
        ("assets_index_name", index),
        ("natives_directory", natives.to_string_lossy().into_owned()),
        ("classpath", classpath),
        ("launcher_name", "clover-launcher".into()),
        ("launcher_version", env!("CARGO_PKG_VERSION").into()),
        ("quickPlayMultiplayer", server.to_owned()),
    ];
    let features = ["is_quick_play_multiplayer"];

    let main_class = loader
        .main_class
        .clone()
        .or(vanilla.main_class.clone())
        .ok_or_else(|| GameError::InvalidVersion("classe principale absente".into()))?;
    let mut arguments = vec![format!("-Xmx{}M", options.memory_mb.unwrap_or_else(auto_memory_mb))];
    arguments.extend(options.java_args.iter().cloned());
    arguments.extend(logging_argument);
    arguments.extend(expand(&vanilla.arguments.jvm, &features));
    arguments.extend(expand(&loader.arguments.jvm, &features));
    arguments.push(main_class);
    arguments.extend(expand(&vanilla.arguments.game, &features));
    arguments.extend(expand(&loader.arguments.game, &features));
    if options.fullscreen {
        arguments.push("--fullscreen".into());
    }
    let arguments: Vec<String> = arguments.iter().map(|argument| substitute(argument, &variables)).collect();

    tokio::fs::create_dir_all(&paths.game).await?;
    tokio::fs::create_dir_all(&paths.logs).await?;
    let log = std::fs::File::create(paths.logs.join("game-output.log"))?;
    let mut child = tokio::process::Command::new(&java)
        .args(&arguments)
        .current_dir(&paths.game)
        .stdin(Stdio::null())
        .stdout(log.try_clone()?)
        .stderr(log)
        .spawn()
        .map_err(GameError::Spawn)?;

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let code = child.wait().await.ok().and_then(|status| status.code());
        eprintln!("[game] Minecraft fermé (code {code:?})");
        let _ = app.emit("game-exited", code);
    });
    Ok(())
}

fn substitute(argument: &str, variables: &[(&str, String)]) -> String {
    variables
        .iter()
        .fold(argument.to_owned(), |argument, (name, value)| argument.replace(&format!("${{{name}}}"), value))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn substitutes_every_placeholder() {
        let variables = [("natives_directory", "C:/n".to_owned()), ("launcher_name", "clover".to_owned())];
        assert_eq!(substitute("-Djava.library.path=${natives_directory}/java", &variables), "-Djava.library.path=C:/n/java");
        assert_eq!(substitute("${launcher_name}-${launcher_name}", &variables), "clover-clover");
        assert_eq!(substitute("${unknown}", &variables), "${unknown}");
    }
}
