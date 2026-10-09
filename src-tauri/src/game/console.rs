//! Console du jeu : la sortie de Minecraft lue pendant la partie, découpée en entrées (heure, fil,
//! niveau, message, exception) pour l'écran « Console », et recopiée dans `logs/game-output.log`.
//! Le jeu écrit en XML log4j (configuration de journalisation fournie par Mojang) ; une ligne hors
//! XML (avertissement de Java, trace avant le démarrage de log4j) devient une entrée brute.

use std::collections::VecDeque;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};

/// Entrées gardées en mémoire ; le fichier garde toute la partie.
const MAX_ENTRIES: usize = 10_000;
/// Au démarrage du launcher, seule la fin du journal de la dernière partie est relue.
const RESUME_BYTES: u64 = 4 * 1024 * 1024;
/// Remplace le jeton Minecraft s'il apparaît dans la sortie : il ne doit ni passer l'interface, ni
/// partir dans un journal copié pour le support.
const REDACTED: &str = "<jeton masqué>";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Croissant et jamais réutilisé, même d'une partie à l'autre : curseur de l'interface.
    pub id: u64,
    /// Millisecondes depuis 1970 ; absent pour une ligne brute.
    pub time: Option<i64>,
    /// Heure telle qu'écrite dans un ancien journal (`12:34:56`), sans date ni fuseau.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clock: Option<String>,
    pub level: Level,
    pub thread: Option<String>,
    pub logger: Option<String>,
    pub message: String,
    pub throwable: Option<String>,
}

/// Entrées après le curseur demandé. `session` change à chaque lancement : l'interface repart
/// alors de zéro.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub session: u64,
    pub running: bool,
    pub entries: Vec<Entry>,
}

impl Snapshot {
    /// Instance jamais lancée depuis le démarrage du launcher.
    pub fn empty() -> Self {
        Self { session: 0, running: false, entries: Vec::new() }
    }
}

#[derive(Default)]
struct Inner {
    session: u64,
    running: bool,
    next_id: u64,
    entries: VecDeque<Entry>,
}

/// Console d'une partie en cours, ou de la dernière jouée par l'instance.
#[derive(Default)]
pub struct Console(Mutex<Inner>);

impl Console {
    /// Reprend la fin du journal de la dernière partie : le launcher a pu être relancé depuis.
    pub fn resume(path: &Path) -> Self {
        let console = Self::default();
        let Ok(mut file) = std::fs::File::open(path) else { return console };
        let skipped = file.metadata().map_or(0, |metadata| metadata.len().saturating_sub(RESUME_BYTES));
        let mut bytes = Vec::new();
        if file.seek(SeekFrom::Start(skipped)).and_then(|_| file.read_to_end(&mut bytes)).is_err() {
            return console;
        }
        let text = String::from_utf8_lossy(&bytes);
        // Début coupé : on repart du premier évènement entier.
        let lines = text.lines().skip_while(|line| skipped > 0 && !line.trim_start().starts_with("<log4j:Event"));
        let mut parser = Parser::default();
        for line in lines {
            parser.line(line).into_iter().for_each(|entry| console.push(entry));
        }
        parser.finish().into_iter().for_each(|entry| console.push(entry));
        console
    }

    /// Nouvelle partie : la console repart à vide.
    pub fn start(&self) {
        let mut inner = self.0.lock().expect("console");
        inner.session += 1;
        inner.running = true;
        inner.entries.clear();
    }

    /// Bouton « Effacer » : la console repart à vide, sans changer de session ni de curseur. Le
    /// fichier garde toute la partie.
    pub fn clear(&self) {
        self.0.lock().expect("console").entries.clear();
    }

    /// Fin de partie, notée en dernière ligne.
    pub fn finish(&self, code: Option<i32>) {
        let message = match code {
            Some(code) => format!("Minecraft s'est fermé (code {code})."),
            None => "Minecraft s'est fermé (code inconnu).".to_owned(),
        };
        let time = SystemTime::now().duration_since(UNIX_EPOCH).ok().and_then(|elapsed| i64::try_from(elapsed.as_millis()).ok());
        self.push(Entry {
            id: 0,
            time,
            clock: None,
            level: if code == Some(0) { Level::Info } else { Level::Error },
            thread: None,
            logger: Some("Clover Launcher".into()),
            message,
            throwable: None,
        });
        self.0.lock().expect("console").running = false;
    }

    pub fn since(&self, after: u64) -> Snapshot {
        let inner = self.0.lock().expect("console");
        let first = inner.entries.partition_point(|entry| entry.id <= after);
        Snapshot { session: inner.session, running: inner.running, entries: inner.entries.range(first..).cloned().collect() }
    }

    fn push(&self, mut entry: Entry) {
        let mut inner = self.0.lock().expect("console");
        inner.next_id += 1;
        entry.id = inner.next_id;
        if inner.entries.len() == MAX_ENTRIES {
            inner.entries.pop_front();
        }
        inner.entries.push_back(entry);
    }
}

/// Lit la sortie du jeu jusqu'à sa fermeture : chaque ligne, jeton masqué, va dans `output` et
/// dans la console.
pub async fn capture(console: &Console, stdout: impl AsyncRead + Unpin, stderr: impl AsyncRead + Unpin, mut output: impl Write, token: &str) {
    let mut stdout = BufReader::new(stdout).split(b'\n');
    let mut stderr = BufReader::new(stderr).split(b'\n');
    let (mut stdout_open, mut stderr_open) = (true, true);
    let mut parser = Parser::default();
    while stdout_open || stderr_open {
        let (segment, from_stderr) = tokio::select! {
            segment = stdout.next_segment(), if stdout_open => (segment, false),
            segment = stderr.next_segment(), if stderr_open => (segment, true),
        };
        let Ok(Some(bytes)) = segment else {
            if from_stderr {
                stderr_open = false;
            } else {
                stdout_open = false;
            }
            continue;
        };
        let text = String::from_utf8_lossy(&bytes);
        let mut line = text.trim_end_matches('\r').to_owned();
        if !token.is_empty() && line.contains(token) {
            line = line.replace(token, REDACTED);
        }
        let _ = writeln!(output, "{line}");
        // Le XML de log4j n'arrive que sur la sortie standard.
        let entry = if from_stderr { raw(&line, true) } else { parser.line(&line) };
        entry.into_iter().for_each(|entry| console.push(entry));
    }
    parser.finish().into_iter().for_each(|entry| console.push(entry));
    let _ = output.flush();
}

/// Regroupe les lignes d'un évènement log4j, qui en occupe plusieurs.
#[derive(Default)]
struct Parser {
    event: Option<String>,
}

impl Parser {
    fn line(&mut self, line: &str) -> Option<Entry> {
        if let Some(event) = &mut self.event {
            event.push('\n');
            event.push_str(line);
            return line.contains("</log4j:Event>").then(|| self.take()).flatten();
        }
        if line.trim_start().starts_with("<log4j:Event") {
            self.event = Some(line.to_owned());
            return line.contains("</log4j:Event>").then(|| self.take()).flatten();
        }
        raw(line, false)
    }

    /// Évènement resté ouvert quand la sortie s'arrête.
    fn finish(&mut self) -> Option<Entry> {
        self.take()
    }

    fn take(&mut self) -> Option<Entry> {
        let event = self.event.take()?;
        Some(parse_event(&event).unwrap_or_else(|| raw_entry(&event, Level::Info)))
    }
}

/// Ligne hors XML. Sur la sortie d'erreur, Java signale ses avertissements par « WARNING ».
fn raw(line: &str, from_stderr: bool) -> Option<Entry> {
    if line.trim().is_empty() {
        return None;
    }
    let level = if !from_stderr {
        Level::Info
    } else if line.starts_with("WARNING") {
        Level::Warn
    } else {
        Level::Error
    };
    Some(raw_entry(line, level))
}

fn raw_entry(text: &str, level: Level) -> Entry {
    Entry { id: 0, time: None, clock: None, level, thread: None, logger: None, message: text.to_owned(), throwable: None }
}

fn parse_event(event: &str) -> Option<Entry> {
    let tag = &event[..event.find('>')?];
    let level = match attribute(tag, "level")? {
        "WARN" => Level::Warn,
        "ERROR" | "FATAL" => Level::Error,
        _ => Level::Info,
    };
    Some(Entry {
        id: 0,
        time: attribute(tag, "timestamp").and_then(|time| time.parse().ok()),
        clock: None,
        level,
        thread: attribute(tag, "thread").map(unescape),
        logger: attribute(tag, "logger").map(unescape),
        message: element(event, "log4j:Message").unwrap_or_default(),
        throwable: element(event, "log4j:Throwable").map(|trace| trace.trim_end().to_owned()),
    })
}

fn attribute<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let start = tag.find(&format!(" {name}=\""))? + name.len() + 3;
    let length = tag[start..].find('"')?;
    Some(&tag[start..start + length])
}

/// Texte d'un élément : sections CDATA telles quelles, entités XML décodées ailleurs. Log4j coupe
/// en deux sections un message qui contient lui-même `]]>`.
fn element(event: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let start = event.find(&open)? + open.len();
    let mut rest = &event[start..start + event[start..].find(&format!("</{name}>"))?];
    let mut text = String::new();
    while let Some(cdata) = rest.find("<![CDATA[") {
        text.push_str(&unescape(&rest[..cdata]));
        let inside = &rest[cdata + "<![CDATA[".len()..];
        let end = inside.find("]]>").unwrap_or(inside.len());
        text.push_str(&inside[..end]);
        rest = inside.get(end + "]]>".len()..).unwrap_or_default();
    }
    text.push_str(&unescape(rest));
    Some(text)
}

fn unescape(text: &str) -> String {
    text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    const EVENTS: &str = r#"<log4j:Event logger="FabricLoader/GameProvider" timestamp="1790783336206" level="INFO" thread="main">
    <log4j:Message><![CDATA[Loading Minecraft 26.2 with Fabric Loader 0.19.5]]></log4j:Message>
  </log4j:Event>

<log4j:Event logger="net.minecraft.server.packs.repository.Pack" timestamp="1790783370265" level="WARN" thread="Render thread">
    <log4j:Message><![CDATA[Error reading pack metadata, ]]>]]&gt;<![CDATA[ fallback]]></log4j:Message>
    <log4j:Throwable><![CDATA[com.google.gson.JsonParseException: missing min_format
	at knot//net.minecraft.server.packs.repository.Pack.readPackMetadata(Pack.java:56)
]]></log4j:Throwable>
  </log4j:Event>
"#;

    #[tokio::test]
    async fn splits_log4j_events_and_raw_lines() {
        let console = Console::default();
        console.start();
        let stderr = "WARNING: A restricted method has been called\r\nException in thread \"main\" boom\n";
        let mut output = Vec::new();
        capture(&console, EVENTS.as_bytes(), stderr.as_bytes(), &mut output, "").await;

        let entries = console.since(0).entries;
        let summary: Vec<_> = entries.iter().map(|entry| (entry.level, entry.message.as_str())).collect();
        assert!(summary.contains(&(Level::Info, "Loading Minecraft 26.2 with Fabric Loader 0.19.5")));
        assert!(summary.contains(&(Level::Warn, "Error reading pack metadata, ]]> fallback")));
        assert!(summary.contains(&(Level::Warn, "WARNING: A restricted method has been called")));
        assert!(summary.contains(&(Level::Error, "Exception in thread \"main\" boom")));
        assert_eq!(entries.len(), 4);

        let pack = entries.iter().find(|entry| entry.thread.as_deref() == Some("Render thread")).unwrap();
        assert_eq!(pack.time, Some(1_790_783_370_265));
        assert_eq!(pack.logger.as_deref(), Some("net.minecraft.server.packs.repository.Pack"));
        assert!(pack.throwable.as_deref().unwrap().ends_with("(Pack.java:56)"));
        assert_eq!(String::from_utf8(output).unwrap().lines().count(), EVENTS.lines().count() + 2);
    }

    #[tokio::test]
    async fn redacts_the_minecraft_token() {
        let console = Console::default();
        let mut output = Vec::new();
        capture(&console, "--accessToken eyJsecret now\n".as_bytes(), &b""[..], &mut output, "eyJsecret").await;
        let output = String::from_utf8(output).unwrap();
        assert!(!output.contains("eyJsecret"));
        assert_eq!(console.since(0).entries[0].message, format!("--accessToken {REDACTED} now"));
    }

    #[test]
    fn cursor_and_sessions() {
        let console = Console::default();
        console.start();
        console.push(raw_entry("a", Level::Info));
        console.push(raw_entry("b", Level::Info));
        let first = console.since(0);
        assert!(first.running);
        assert_eq!(console.since(first.entries[0].id).entries.len(), 1);

        console.finish(Some(1));
        let ended = console.since(first.entries[1].id);
        assert!(!ended.running);
        assert_eq!(ended.entries[0].level, Level::Error);

        console.start();
        let next = console.since(ended.entries[0].id);
        assert_ne!(next.session, first.session);
        assert!(next.entries.is_empty());
    }

    #[test]
    fn clear_keeps_session_and_cursor() {
        let console = Console::default();
        console.start();
        console.push(raw_entry("a", Level::Info));
        let before = console.since(0);
        console.clear();
        assert!(console.since(0).entries.is_empty());

        console.push(raw_entry("b", Level::Info));
        let after = console.since(0);
        assert_eq!(after.session, before.session);
        assert!(after.running);
        assert_eq!(after.entries.len(), 1);
        assert!(after.entries[0].id > before.entries[0].id);
    }

    #[test]
    fn resumes_from_the_end_of_the_last_log() {
        let path = std::env::temp_dir().join(format!("clover-console-{}.log", std::process::id()));
        std::fs::write(&path, EVENTS).unwrap();
        let resumed = Console::resume(&path).since(0);
        std::fs::remove_file(&path).unwrap();
        assert!(!resumed.running);
        assert_eq!(resumed.entries.len(), 2);
        assert!(Console::resume(&path).since(0).entries.is_empty());
    }
}
