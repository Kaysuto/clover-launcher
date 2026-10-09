//! Construction de la ligne de commande et démarrage du jeu.

use std::io::LineWriter;
use std::process::Stdio;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use super::console;
use super::games::{Exited, Games};
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

/// Où Quick Play fait entrer le jeu dès son ouverture, au lieu du menu.
pub enum QuickPlay {
    /// Serveur, par son adresse.
    Server(String),
    /// Monde solo, par le nom de son dossier dans `saves/` (Minecraft 1.20 et suivantes).
    World(String),
}

pub(crate) fn build_arguments(paths: &Paths, installation: &Installation, session: &Session, quick_play: Option<&QuickPlay>, options: &LaunchOptions) -> Result<Vec<String>> {
    let Installation { vanilla, loader, classpath, logging_argument, .. } = installation;
    let version_id = loader.as_ref().map_or(vanilla.id.as_str(), |loader| &loader.id);
    let natives = paths.natives.join(version_id);

    let separator = if cfg!(windows) { ";" } else { ":" };
    let classpath = classpath.iter().map(|path| path.to_string_lossy()).collect::<Vec<_>>().join(separator);
    let index = vanilla.asset_index.as_ref().map(|index| index.id.clone()).unwrap_or_default();
    // Minecraft traite une chaîne vide comme « absent » pour clientId et xuid.
    let variables = [
        ("auth_player_name", session.profile.name.clone()),
        ("auth_uuid", session.profile.uuid.replace('-', "")),
        ("auth_access_token", session.minecraft_token.clone()),
        ("auth_xuid", String::new()),
        ("user_type", "msa".into()),
        ("user_properties", "{}".into()),
        ("clientid", String::new()),
        ("version_name", version_id.to_owned()),
        ("version_type", vanilla.kind.clone().unwrap_or_else(|| "release".into())),
        ("game_directory", paths.game.to_string_lossy().into_owned()),
        ("assets_root", paths.assets.to_string_lossy().into_owned()),
        ("assets_index_name", index),
        ("natives_directory", natives.to_string_lossy().into_owned()),
        ("classpath", classpath),
        ("library_directory", paths.libraries.to_string_lossy().into_owned()),
        ("classpath_separator", separator.to_owned()),
        ("launcher_name", "clover-launcher".into()),
        ("launcher_version", env!("CARGO_PKG_VERSION").into()),
        ("quickPlayMultiplayer", match quick_play { Some(QuickPlay::Server(address)) => address.clone(), _ => String::new() }),
        ("quickPlaySingleplayer", match quick_play { Some(QuickPlay::World(world)) => world.clone(), _ => String::new() }),
        ("quickPlayPath", paths.quick_play_log.to_string_lossy().into_owned()),
    ];
    let mut features = vec!["has_quick_plays_support"];
    match quick_play {
        Some(QuickPlay::Server(_)) => features.push("is_quick_play_multiplayer"),
        Some(QuickPlay::World(_)) => features.push("is_quick_play_singleplayer"),
        None => {}
    }

    let main_class = loader.as_ref().and_then(|loader| loader.main_class.clone())
        .or(vanilla.main_class.clone())
        .ok_or_else(|| GameError::InvalidVersion("classe principale absente".into()))?;
    let mut arguments = vec![format!("-Xmx{}M", options.memory_mb.unwrap_or_else(auto_memory_mb))];
    arguments.extend(options.java_args.iter().cloned());
    arguments.extend(logging_argument.iter().cloned());
    arguments.extend(expand(&vanilla.arguments.jvm, &features));
    if vanilla.arguments.jvm.is_empty() {
        arguments.extend(["-Djava.library.path=${natives_directory}".into(), "-cp".into(), "${classpath}".into()]);
        if cfg!(target_os = "macos") { arguments.push("-XstartOnFirstThread".into()); }
    }
    if let Some(loader) = &loader { arguments.extend(expand(&loader.arguments.jvm, &features)); }
    arguments.push(main_class);
    arguments.extend(expand(&vanilla.arguments.game, &features));
    // Anciens profils : ceux du loader (Forge 1.12.2…) remplacent ceux de Mojang.
    let legacy = loader.as_ref().and_then(|loader| loader.minecraft_arguments.as_ref()).or(vanilla.minecraft_arguments.as_ref());
    if let Some(legacy) = legacy { arguments.extend(legacy.split_whitespace().map(str::to_owned)); }
    if let Some(loader) = &loader { arguments.extend(expand(&loader.arguments.game, &features)); }
    if options.fullscreen {
        arguments.push("--fullscreen".into());
    }
    if let Some((width, height)) = options.resolution {
        arguments.extend(["--width".into(), width.to_string(), "--height".into(), height.to_string()]);
    }
    if let Some(backend) = options.graphics_backend.filter(|_| has_graphics_backend(&paths.versions.join(&vanilla.id).join(format!("{}.jar", vanilla.id)))) {
        arguments.extend(["--graphicsBackend".into(), backend.into()]);
    }
    // Sans la règle Quick Play solo (avant la 1.20), le jeu s'ouvrirait sur son menu sans le dire.
    if matches!(quick_play, Some(QuickPlay::World(_))) && !arguments.iter().any(|argument| argument == "--quickPlaySingleplayer") {
        return Err(GameError::NoWorldQuickPlay);
    }
    Ok(arguments.iter().map(|argument| substitute(argument, &variables)).collect())

}

#[allow(clippy::too_many_arguments)]
pub async fn spawn(
    app: &AppHandle,
    instance: &str,
    paths: &Paths,
    installation: Installation,
    session: &Session,
    quick_play: Option<&QuickPlay>,
    options: &LaunchOptions,
    on_join: impl Fn(RecentServer) + Send + 'static,
) -> Result<()> {
    let arguments = build_arguments(paths, &installation, session, quick_play, options)?;
    let Installation { java, vanilla, loader, .. } = installation;
    let version_id = loader.as_ref().map_or(vanilla.id.as_str(), |loader| &loader.id);
    tokio::fs::create_dir_all(paths.natives.join(version_id)).await?;
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
    let pid = child.id();
    if let Some(pid) = pid {
        super::window_title::start(pid, &vanilla.id);
    }
    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        unreachable!("sorties du jeu redirigées juste au-dessus");
    };

    let app = app.clone();
    let log = paths.quick_play_log.clone();
    let root = paths.root.clone();
    let token = session.minecraft_token.clone();
    let instance = instance.to_owned();
    let game = app.state::<Games>().get(&instance);
    game.start(pid, paths.game.clone());
    tauri::async_runtime::spawn(async move {
        let capture = console::capture(&game.console, stdout, stderr, output, &token);
        tokio::pin!(capture);
        let mut captured = false;
        let mut poll = tokio::time::interval(QUICK_PLAY_POLL);
        let code = loop {
            tokio::select! {
                () = &mut capture, if !captured => captured = true,
                status = child.wait() => break status.ok().and_then(|status| status.code()),
                () = game.killed() => {
                    eprintln!("[game] fermeture forcée de Minecraft ({instance})");
                    let _ = child.start_kill();
                }
                _ = poll.tick() => quick_play::last_server(&log).into_iter().for_each(&on_join),
            }
        };
        // Fin de la sortie lue avant d'annoncer la fermeture : l'écran de plantage la montre. Un
        // processus lancé par le jeu peut garder ses sorties ouvertes, d'où la limite.
        if !captured {
            let _ = tokio::time::timeout(OUTPUT_GRACE, capture).await;
        }
        quick_play::last_server(&log).into_iter().for_each(&on_join);
        eprintln!("[game] Minecraft fermé ({instance}, code {code:?})");
        game.finish(code);
        app.state::<crate::history::History>().finish(&root, &instance, code);
        let _ = app.emit("game-exited", Exited { instance, code });
    });
    Ok(())
}

/// `--graphicsBackend` n'existe qu'à partir de Minecraft 26.2 : on cherche son type dans le client
/// plutôt que de comparer des numéros de version (instantanés compris).
fn has_graphics_backend(client_jar: &std::path::Path) -> bool {
    std::fs::File::open(client_jar).ok().and_then(|file| zip::ZipArchive::new(file).ok()).is_some_and(|mut archive| archive.by_name("net/minecraft/client/PreferredGraphicsApi.class").is_ok())
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
    fn personal_games_open_the_menu_and_clover_keeps_quick_play() {
        let vanilla = serde_json::from_str(r#"{"id":"1.20.1","mainClass":"net.minecraft.client.main.Main","arguments":{"jvm":["-cp","${classpath}"],"game":["--gameDir","${game_directory}","--accessToken","${auth_access_token}",{"rules":[{"action":"allow","features":{"is_quick_play_multiplayer":true}}],"value":["--quickPlayMultiplayer","${quickPlayMultiplayer}"]}]}}"#).unwrap();
        let mut installation = Installation { java: "java".into(), vanilla, loader: None, classpath: vec!["client.jar".into()], logging_argument: None };
        let session = Session { profile: crate::auth::Profile { uuid: "test".into(), name: "Joueur".into(), skin: None, capes: vec![] }, minecraft_token: "synthetic-test-token".into(), expires_at: u64::MAX };
        let paths = Paths::from_root(std::env::temp_dir().join("clover-arguments"));
        let options = LaunchOptions { memory_mb: Some(4096), java_args: vec![], fullscreen: false, resolution: None, graphics_backend: None, enabled_mods: None, disabled_personal_mods: vec![] };
        let vanilla = build_arguments(&paths, &installation, &session, None, &options).unwrap();
        assert!(vanilla.contains(&"net.minecraft.client.main.Main".into()));
        assert!(!vanilla.contains(&"--quickPlayMultiplayer".into()));
        assert!(vanilla.contains(&paths.game.to_string_lossy().into_owned()));
        installation.loader = Some(serde_json::from_str(r#"{"id":"fabric-loader-test","mainClass":"net.fabricmc.loader.impl.launch.knot.KnotClient","arguments":{"jvm":["-Dfabric=true"]}}"#).unwrap());
        let fabric = build_arguments(&paths, &installation, &session, None, &options).unwrap();
        assert!(fabric.contains(&"net.fabricmc.loader.impl.launch.knot.KnotClient".into()));
        assert!(fabric.contains(&"-Dfabric=true".into()));
        assert!(!fabric.contains(&"--quickPlayMultiplayer".into()));
        let clover = build_arguments(&paths, &installation, &session, Some(&QuickPlay::Server("play.clovergames.fr".into())), &options).unwrap();
        assert!(clover.windows(2).any(|pair| pair == ["--quickPlayMultiplayer", "play.clovergames.fr"]));
        assert!(!clover.iter().any(|argument| argument.contains("${")));
    }

    #[test]
    fn opens_a_world_only_where_the_version_allows_it() {
        let session = Session { profile: crate::auth::Profile { uuid: "test".into(), name: "Joueur".into(), skin: None, capes: vec![] }, minecraft_token: "synthetic-test-token".into(), expires_at: u64::MAX };
        let paths = Paths::from_root(std::env::temp_dir().join("clover-world"));
        let options = LaunchOptions { memory_mb: Some(4096), java_args: vec![], fullscreen: false, resolution: None, graphics_backend: None, enabled_mods: None, disabled_personal_mods: vec![] };
        let world = QuickPlay::World("Mon monde".into());
        let recent = serde_json::from_str(r#"{"id":"1.20.1","mainClass":"net.minecraft.client.main.Main","arguments":{"jvm":[],"game":[{"rules":[{"action":"allow","features":{"is_quick_play_singleplayer":true}}],"value":["--quickPlaySingleplayer","${quickPlaySingleplayer}"]},{"rules":[{"action":"allow","features":{"is_quick_play_multiplayer":true}}],"value":["--quickPlayMultiplayer","${quickPlayMultiplayer}"]}]}}"#).unwrap();
        let installation = Installation { java: "java".into(), vanilla: recent, loader: None, classpath: vec![], logging_argument: None };
        let arguments = build_arguments(&paths, &installation, &session, Some(&world), &options).unwrap();
        assert!(arguments.windows(2).any(|pair| pair == ["--quickPlaySingleplayer", "Mon monde"]));
        assert!(!arguments.contains(&"--quickPlayMultiplayer".into()));
        let old = serde_json::from_str(r#"{"id":"1.19.4","mainClass":"net.minecraft.client.main.Main","arguments":{"jvm":[],"game":["--gameDir","${game_directory}"]}}"#).unwrap();
        let installation = Installation { java: "java".into(), vanilla: old, loader: None, classpath: vec![], logging_argument: None };
        assert!(matches!(build_arguments(&paths, &installation, &session, Some(&world), &options), Err(GameError::NoWorldQuickPlay)));
    }

    #[test]
    fn window_size_and_graphics_api_only_where_the_client_knows_it() {
        let root = std::env::temp_dir().join(format!("clover-window-{}", rand::random::<u64>()));
        let paths = Paths::from_root(root.clone());
        std::fs::create_dir_all(paths.versions.join("26.2")).unwrap();
        let mut jar = zip::ZipWriter::new(std::fs::File::create(paths.versions.join("26.2/26.2.jar")).unwrap());
        jar.start_file("net/minecraft/client/PreferredGraphicsApi.class", zip::write::SimpleFileOptions::default()).unwrap();
        jar.finish().unwrap();
        let session = Session { profile: crate::auth::Profile { uuid: "test".into(), name: "Joueur".into(), skin: None, capes: vec![] }, minecraft_token: "synthetic-test-token".into(), expires_at: u64::MAX };
        let options = LaunchOptions { memory_mb: None, java_args: vec![], fullscreen: false, resolution: Some((1280, 720)), graphics_backend: Some("vulkan"), enabled_mods: None, disabled_personal_mods: vec![] };
        let arguments = |id: &str| {
            let vanilla = serde_json::from_str(&format!(r#"{{"id":"{id}","mainClass":"net.minecraft.client.main.Main","arguments":{{"jvm":[],"game":[]}}}}"#)).unwrap();
            build_arguments(&paths, &Installation { java: "java".into(), vanilla, loader: None, classpath: vec![], logging_argument: None }, &session, None, &options).unwrap()
        };
        let recent = arguments("26.2");
        assert!(recent.windows(4).any(|window| window == ["--width", "1280", "--height", "720"]));
        assert!(recent.windows(2).any(|pair| pair == ["--graphicsBackend", "vulkan"]));
        let old = arguments("1.21.11");
        assert!(old.windows(4).any(|window| window == ["--width", "1280", "--height", "720"]));
        assert!(!old.contains(&"--graphicsBackend".into()));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn substitutes_every_placeholder() {
        let variables = [("natives_directory", "C:/n".to_owned()), ("launcher_name", "clover".to_owned())];
        assert_eq!(substitute("-Djava.library.path=${natives_directory}/java", &variables), "-Djava.library.path=C:/n/java");
        assert_eq!(substitute("${launcher_name}-${launcher_name}", &variables), "clover-clover");
        assert_eq!(substitute("${unknown}", &variables), "${unknown}");
    }
}
