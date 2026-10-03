//! Construction de la ligne de commande et démarrage du jeu.

use std::io::LineWriter;
use std::process::Stdio;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use super::console::{self, Console};
use super::install::Installation;
use super::quick_play;
use super::version::expand;
use super::{auto_memory_mb, GameError, LaunchOptions, Paths, Result};
use crate::auth::Session;
use crate::store::RecentServer;

/// Le jeu remplace son journal Quick Play à chaque connexion : le relire assez souvent pour ne
/// manquer aucun serveur rejoint pendant la partie.
const QUICK_PLAY_POLL: Duration = Duration::from_secs(5);
/// Attente de la fin de la sortie une fois le jeu fermé.
const OUTPUT_GRACE: Duration = Duration::from_secs(3);

pub async fn spawn(
    app: &AppHandle,
    paths: &Paths,
    installation: Installation,
    session: &Session,
    server: &str,
    options: &LaunchOptions,
    on_join: impl Fn(RecentServer) + Send + 'static,
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
        ("quickPlayPath", paths.quick_play_log.to_string_lossy().into_owned()),
    ];
    let features = ["is_quick_play_multiplayer", "has_quick_plays_support"];

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
    // Écrit ligne par ligne : le fichier reste à jour pendant la partie.
    let output = LineWriter::new(std::fs::File::create(&paths.game_output)?);
    let mut child = tokio::process::Command::new(&java)
        .args(&arguments)
        .current_dir(&paths.game)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(GameError::Spawn)?;
    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        unreachable!("sorties du jeu redirigées juste au-dessus");
    };

    let app = app.clone();
    let log = paths.quick_play_log.clone();
    let token = session.minecraft_token.clone();
    app.state::<Console>().start();
    tauri::async_runtime::spawn(async move {
        let console = app.state::<Console>();
        let capture = console::capture(&console, stdout, stderr, output, &token);
        tokio::pin!(capture);
        let mut captured = false;
        let mut poll = tokio::time::interval(QUICK_PLAY_POLL);
        let code = loop {
            tokio::select! {
                () = &mut capture, if !captured => captured = true,
                status = child.wait() => break status.ok().and_then(|status| status.code()),
                _ = poll.tick() => quick_play::last_server(&log).into_iter().for_each(&on_join),
            }
        };
        // Fin de la sortie lue avant d'annoncer la fermeture : l'écran de plantage la montre. Un
        // processus lancé par le jeu peut garder ses sorties ouvertes, d'où la limite.
        if !captured {
            let _ = tokio::time::timeout(OUTPUT_GRACE, capture).await;
        }
        quick_play::last_server(&log).into_iter().for_each(&on_join);
        eprintln!("[game] Minecraft fermé (code {code:?})");
        console.finish(code);
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
