//! Anciens journaux d'une instance, relus dans la console : `logs/latest.log`, les journaux
//! archivés par le jeu (`logs/AAAA-MM-JJ-N.log.gz`) et les rapports de plantage
//! (`crash-reports/*.txt`). Le jeu y écrit en texte (`[12:34:56] [Render thread/INFO]: message`),
//! pas en XML comme sur sa sortie ; une ligne qui ne commence pas ainsi prolonge l'entrée d'avant.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use super::console::{Entry, Level};
use super::{GameError, Result};

/// Au-delà, seule la fin du journal est gardée (un journal de plusieurs heures avec beaucoup de mods).
const MAX_ENTRIES: usize = 20_000;
/// Un journal décompressé plus gros est coupé : il ne doit pas saturer la mémoire.
const MAX_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Folder {
    Logs,
    CrashReports,
}

impl Folder {
    fn dir(self, game: &Path) -> PathBuf {
        game.join(match self {
            Self::Logs => "logs",
            Self::CrashReports => "crash-reports",
        })
    }

    fn accepts(self, name: &str) -> bool {
        let name = name.to_ascii_lowercase();
        match self {
            Self::Logs => name.ends_with(".log") || name.ends_with(".log.gz"),
            Self::CrashReports => name.ends_with(".txt"),
        }
    }
}

/// Journal proposé dans la console. Mêmes noms que le type `GameLogFile` du front.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFile {
    pub folder: Folder,
    pub name: String,
    pub size: u64,
    /// Secondes depuis 1970.
    pub modified: Option<u64>,
}

/// Journaux de l'instance, du plus récent au plus ancien.
pub fn list(game: &Path) -> Vec<LogFile> {
    let mut files: Vec<LogFile> = [Folder::Logs, Folder::CrashReports]
        .into_iter()
        .flat_map(|folder| {
            std::fs::read_dir(folder.dir(game))
                .into_iter()
                .flatten()
                .flatten()
                .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
                .filter_map(move |entry| {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let metadata = entry.metadata().ok()?;
                    folder.accepts(&name).then(|| LogFile {
                        folder,
                        name,
                        size: metadata.len(),
                        modified: metadata.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map(|elapsed| elapsed.as_secs()),
                    })
                })
        })
        .collect();
    files.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| b.name.cmp(&a.name)));
    files
}

/// Entrées du journal `name` de `folder`. Le nom doit désigner un fichier listé par `list`.
pub fn read(game: &Path, folder: Folder, name: &str) -> Result<Vec<Entry>> {
    let plain = !name.is_empty() && !name.starts_with('.') && !name.contains(['/', '\\', ':']);
    if !plain || !folder.accepts(name) {
        return Err(GameError::InvalidVersion("journal inconnu".into()));
    }
    let file = std::fs::File::open(folder.dir(game).join(name))?;
    let mut text = Vec::new();
    if name.to_ascii_lowercase().ends_with(".gz") {
        flate2::read::GzDecoder::new(file).take(MAX_BYTES).read_to_end(&mut text)?;
    } else {
        file.take(MAX_BYTES).read_to_end(&mut text)?;
    }
    let mut entries = parse(&String::from_utf8_lossy(&text));
    let excess = entries.len().saturating_sub(MAX_ENTRIES);
    entries.drain(..excess);
    for (index, entry) in entries.iter_mut().enumerate() {
        entry.id = index as u64 + 1;
    }
    Ok(entries)
}

/// `[12:34:56] [Render thread/WARN]: message` ou, avec Fabric, `… [main/INFO] (Logger) message`.
fn header(line: &str) -> Option<Entry> {
    let rest = line.strip_prefix('[')?;
    let (clock, rest) = rest.split_once("] [")?;
    let valid_clock = clock.len() == 8 && clock.bytes().enumerate().all(|(index, byte)| if index == 2 || index == 5 { byte == b':' } else { byte.is_ascii_digit() });
    if !valid_clock {
        return None;
    }
    let (source, rest) = rest.split_once(']')?;
    let (thread, level) = source.rsplit_once('/')?;
    let level = match level {
        "WARN" => Level::Warn,
        "ERROR" | "FATAL" => Level::Error,
        _ => Level::Info,
    };
    let (logger, message) = match rest.strip_prefix(": ") {
        Some(message) => (None, message),
        None => match rest.trim_start().strip_prefix('(').and_then(|rest| rest.split_once(") ")) {
            Some((logger, message)) => (Some(logger.to_owned()), message),
            None => (None, rest.trim_start_matches(':').trim_start()),
        },
    };
    Some(Entry { id: 0, time: None, clock: Some(clock.to_owned()), level, thread: Some(thread.to_owned()), logger, message: message.to_owned(), throwable: None })
}

fn parse(text: &str) -> Vec<Entry> {
    let mut entries: Vec<Entry> = Vec::new();
    for line in text.lines() {
        if let Some(entry) = header(line) {
            entries.push(entry);
            continue;
        }
        // Suite de l'entrée d'avant (trace d'exception, liste de mods) ; sinon ligne brute
        // (rapport de plantage, début d'un journal).
        match entries.last_mut() {
            Some(previous) if previous.clock.is_some() => {
                let throwable = previous.throwable.get_or_insert_with(String::new);
                if !throwable.is_empty() {
                    throwable.push('\n');
                }
                throwable.push_str(line);
            }
            _ => entries.push(Entry { id: 0, time: None, clock: None, level: Level::Info, thread: None, logger: None, message: line.to_owned(), throwable: None }),
        }
    }
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_vanilla_and_fabric_lines_with_their_continuations() {
        let entries = parse(
            "[13:44:57] [main/INFO]: Loading Minecraft 26.2 with Fabric Loader 0.19.5\n\
             [13:44:58] [main/INFO]: Loading 107 mods:\n\
             \t- appleskin 3.0.10+mc26.2\n\
             [13:45:01] [Render thread/WARN] (Sodium) Option absente\n\
             [13:45:02] [Worker-Main-1/ERROR]: Échec\n\
             java.lang.IllegalStateException: x\n\
             \tat a.b(C.java:1)\n",
        );
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].clock.as_deref(), Some("13:44:57"));
        assert_eq!(entries[0].thread.as_deref(), Some("main"));
        assert_eq!(entries[1].throwable.as_deref(), Some("\t- appleskin 3.0.10+mc26.2"));
        assert_eq!((entries[2].level, entries[2].logger.as_deref(), entries[2].message.as_str()), (Level::Warn, Some("Sodium"), "Option absente"));
        assert_eq!(entries[3].level, Level::Error);
        assert_eq!(entries[3].throwable.as_deref(), Some("java.lang.IllegalStateException: x\n\tat a.b(C.java:1)"));
        // Rapport de plantage : lignes brutes.
        assert!(parse("---- Minecraft Crash Report ----\nTime: 2026-10-06").iter().all(|entry| entry.clock.is_none()));
    }

    #[test]
    fn lists_and_reads_only_files_of_the_instance() {
        use std::io::Write;
        let game = std::env::temp_dir().join(format!("clover-logs-{}", rand::random::<u64>()));
        std::fs::create_dir_all(game.join("logs")).unwrap();
        std::fs::create_dir_all(game.join("crash-reports")).unwrap();
        std::fs::write(game.join("logs/latest.log"), "[10:00:00] [main/INFO]: Bonjour\n").unwrap();
        let mut gz = flate2::write::GzEncoder::new(std::fs::File::create(game.join("logs/2026-10-03-1.log.gz")).unwrap(), flate2::Compression::default());
        gz.write_all(b"[09:00:00] [main/INFO]: Ancien\n").unwrap();
        gz.finish().unwrap();
        std::fs::write(game.join("crash-reports/crash-2026-10-03.txt"), "---- Minecraft Crash Report ----\n").unwrap();
        std::fs::write(game.join("logs/notes.md"), "x").unwrap();

        let names: Vec<_> = list(&game).into_iter().map(|file| file.name).collect();
        assert_eq!(names.len(), 3, "{names:?}");
        assert_eq!(read(&game, Folder::Logs, "2026-10-03-1.log.gz").unwrap()[0].message, "Ancien");
        assert_eq!(read(&game, Folder::Logs, "latest.log").unwrap()[0].id, 1);
        for (folder, name) in [(Folder::Logs, "../options.txt"), (Folder::Logs, "notes.md"), (Folder::CrashReports, "latest.log")] {
            assert!(read(&game, folder, name).is_err(), "{name}");
        }
        std::fs::remove_dir_all(game).unwrap();
    }
}
