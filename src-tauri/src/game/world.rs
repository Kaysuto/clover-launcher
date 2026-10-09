//! Fiche d'un monde solo, lue dans son `level.dat` (NBT compressé en gzip) : nom affiché, mode de
//! jeu, difficulté, version, dernière partie. Les champs ont changé de place au fil des versions :
//! les deux formes sont lues.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

use serde::Serialize;

/// Un `level.dat` pèse quelques Ko ; au-delà, le fichier n'est pas lu.
const MAX_LEVEL: u64 = 16 * 1024 * 1024;
const MAX_DEPTH: usize = 64;

/// Mêmes noms que le type `WorldInfo` du front.
#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldInfo {
    /// Nom donné en jeu, qui peut différer de celui du dossier.
    pub name: Option<String>,
    /// `survival`, `creative`, `adventure` ou `spectator`.
    pub mode: Option<&'static str>,
    pub hardcore: bool,
    /// `peaceful`, `easy`, `normal` ou `hard`.
    pub difficulty: Option<String>,
    pub commands: bool,
    /// Version du jeu de la dernière partie (« 26.2 »).
    pub version: Option<String>,
    /// Dernière partie, en secondes depuis l'époque Unix.
    pub last_played: Option<u64>,
    /// Datapacks posés dans le monde (actifs ou non).
    pub datapacks: usize,
}

#[derive(Debug)]
enum Tag {
    Number(i64),
    Text(String),
    Compound(HashMap<String, Tag>),
    /// Listes, tableaux et nombres à virgule : parcourus, jamais lus ici.
    Other,
}

impl Tag {
    fn get(&self, key: &str) -> Option<&Tag> {
        match self {
            Tag::Compound(map) => map.get(key),
            _ => None,
        }
    }
    fn number(&self) -> Option<i64> {
        match self {
            Tag::Number(value) => Some(*value),
            _ => None,
        }
    }
    fn text(&self) -> Option<&str> {
        match self {
            Tag::Text(value) => Some(value),
            _ => None,
        }
    }
}

struct Reader<'a>(&'a [u8]);

impl Reader<'_> {
    fn take(&mut self, count: usize) -> Option<&[u8]> {
        if count > self.0.len() {
            return None;
        }
        let (head, tail) = self.0.split_at(count);
        self.0 = tail;
        Some(head)
    }
    fn int(&mut self, size: usize) -> Option<i64> {
        let bytes = self.take(size)?;
        let value = bytes.iter().fold(0u64, |value, byte| value << 8 | u64::from(*byte));
        // Extension du signe sur 64 bits.
        let shift = 64 - 8 * size as u32;
        Some(((value << shift) as i64) >> shift)
    }
    fn length(&mut self, unit: usize) -> Option<usize> {
        let length = usize::try_from(self.int(4)?).ok()?;
        // Une longueur qui dépasse le reste du fichier est fausse : refusée avant d'allouer.
        (length.checked_mul(unit.max(1))? <= self.0.len()).then_some(length)
    }
    fn string(&mut self) -> Option<String> {
        let length = usize::try_from(self.int(2)?).ok()?;
        Some(String::from_utf8_lossy(self.take(length)?).into_owned())
    }
    fn tag(&mut self, kind: u8, depth: usize) -> Option<Tag> {
        if depth > MAX_DEPTH {
            return None;
        }
        Some(match kind {
            1 => Tag::Number(self.int(1)?),
            2 => Tag::Number(self.int(2)?),
            3 => Tag::Number(self.int(4)?),
            4 => Tag::Number(self.int(8)?),
            5 => self.take(4).map(|_| Tag::Other)?,
            6 => self.take(8).map(|_| Tag::Other)?,
            7 => {
                let length = self.length(1)?;
                self.take(length).map(|_| Tag::Other)?
            }
            8 => Tag::Text(self.string()?),
            9 => {
                let item = self.take(1)?[0];
                let length = self.length(1)?;
                for _ in 0..length {
                    self.tag(item, depth + 1)?;
                }
                Tag::Other
            }
            10 => {
                let mut map = HashMap::new();
                loop {
                    let item = self.take(1)?[0];
                    if item == 0 {
                        break Tag::Compound(map);
                    }
                    let name = self.string()?;
                    map.insert(name, self.tag(item, depth + 1)?);
                }
            }
            11 => {
                let length = self.length(4)?;
                self.take(length * 4).map(|_| Tag::Other)?
            }
            12 => {
                let length = self.length(8)?;
                self.take(length * 8).map(|_| Tag::Other)?
            }
            _ => return None,
        })
    }
}

fn parse(bytes: &[u8]) -> Option<Tag> {
    let mut reader = Reader(bytes);
    let kind = reader.take(1)?[0];
    reader.string()?;
    reader.tag(kind, 0)
}

fn info(root: &Tag) -> Option<WorldInfo> {
    let data = root.get("Data")?;
    let byte = |key: &str| data.get(key).and_then(Tag::number);
    // 26.1 et après : `difficulty_settings` ; avant : `Difficulty` et `hardcore` à la racine.
    let settings = data.get("difficulty_settings");
    let difficulty = settings.and_then(|s| s.get("difficulty")).and_then(Tag::text).map(str::to_owned).or_else(|| {
        byte("Difficulty").and_then(|level| ["peaceful", "easy", "normal", "hard"].get(usize::try_from(level).ok()?).map(|name| (*name).to_owned()))
    });
    let hardcore = settings.and_then(|s| s.get("hardcore")).and_then(Tag::number).or_else(|| byte("hardcore")).is_some_and(|value| value != 0);
    Some(WorldInfo {
        name: data.get("LevelName").and_then(Tag::text).map(str::to_owned).filter(|name| !name.trim().is_empty()),
        mode: byte("GameType").and_then(|mode| ["survival", "creative", "adventure", "spectator"].get(usize::try_from(mode).ok()?).copied()),
        hardcore,
        difficulty,
        commands: byte("allowCommands").is_some_and(|value| value != 0),
        version: data.get("Version").and_then(|v| v.get("Name")).and_then(Tag::text).map(str::to_owned),
        last_played: byte("LastPlayed").and_then(|ms| u64::try_from(ms / 1000).ok()).filter(|&secs| secs > 0),
        datapacks: 0,
    })
}

/// Où écrire le nom du monde dans `level.dat` décompressé : la chaîne `Data.LevelName` existante
/// (balise comprise), ou le début de `Data` s'il n'en a pas.
fn level_name_span(bytes: &[u8]) -> Option<std::ops::Range<usize>> {
    let mut reader = Reader(bytes);
    let position = |reader: &Reader| bytes.len() - reader.0.len();
    if reader.take(1)? != [10] {
        return None;
    }
    reader.string()?;
    loop {
        let kind = reader.take(1)?[0];
        if kind == 0 {
            return None;
        }
        let name = reader.string()?;
        if kind != 10 || name != "Data" {
            reader.tag(kind, 1)?;
            continue;
        }
        let data = position(&reader);
        loop {
            let start = position(&reader);
            let kind = reader.take(1)?[0];
            if kind == 0 {
                return Some(data..data);
            }
            let name = reader.string()?;
            reader.tag(kind, 2)?;
            if kind == 8 && name == "LevelName" {
                return Some(start..position(&reader));
            }
        }
    }
}

/// Renomme le monde (`Data.LevelName`, le nom affiché en jeu) ; le dossier garde son nom. Seule
/// cette chaîne change, le reste de `level.dat` est recopié tel quel, et le résultat est relu avant
/// de remplacer l'ancien fichier.
pub fn rename(dir: &Path, name: &str) -> Result<(), String> {
    use std::io::Write;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(|c| c.is_control() || u32::from(c) > 0xFFFF) {
        return Err("Le nom doit faire entre 1 et 64 caractères, sans emoji.".into());
    }
    let path = dir.join("level.dat");
    let file = std::fs::File::open(&path).map_err(|e| format!("level.dat illisible : {e}"))?;
    let mut bytes = Vec::new();
    flate2::read::GzDecoder::new(file).take(MAX_LEVEL).read_to_end(&mut bytes).map_err(|e| format!("level.dat illisible : {e}"))?;
    let span = level_name_span(&bytes).ok_or("level.dat illisible : monde non renommé.")?;
    let mut tag = vec![8, 0, 9];
    tag.extend_from_slice(b"LevelName");
    tag.extend_from_slice(&u16::try_from(name.len()).map_err(|_| "Nom trop long.")?.to_be_bytes());
    tag.extend_from_slice(name.as_bytes());
    bytes.splice(span, tag);
    let renamed = parse(&bytes).and_then(|root| info(&root)).and_then(|world| world.name);
    if renamed.as_deref() != Some(name) {
        return Err("level.dat illisible : monde non renommé.".into());
    }
    let temporary = dir.join("level.dat.clover-tmp");
    let mut encoder = flate2::write::GzEncoder::new(std::fs::File::create(&temporary).map_err(|e| e.to_string())?, flate2::Compression::default());
    encoder.write_all(&bytes).and_then(|()| encoder.finish().map(drop)).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|e| format!("Monde non renommé : {e}"))
}

/// Fiche du monde du dossier `dir` ; `None` si son `level.dat` est illisible.
pub fn read(dir: &Path) -> Option<WorldInfo> {
    let file = std::fs::File::open(dir.join("level.dat")).ok()?;
    if file.metadata().ok()?.len() > MAX_LEVEL {
        return None;
    }
    let mut bytes = Vec::new();
    flate2::read::GzDecoder::new(file).take(MAX_LEVEL).read_to_end(&mut bytes).ok()?;
    let mut world = info(&parse(&bytes)?)?;
    world.datapacks = std::fs::read_dir(dir.join("datapacks"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| {
            let path = entry.path();
            !entry.file_name().to_string_lossy().starts_with('.')
                && (path.join("pack.mcmeta").is_file() || path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("zip")))
        })
        .count();
    Some(world)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// NBT minimal : compound racine « » contenant `Data`.
    fn level(fields: &[u8]) -> Vec<u8> {
        let mut bytes = vec![10, 0, 0, 10, 0, 4];
        bytes.extend(b"Data");
        bytes.extend(fields);
        bytes.extend([0, 0]);
        bytes
    }

    fn named(kind: u8, name: &str, payload: &[u8]) -> Vec<u8> {
        let mut bytes = vec![kind, 0, name.len() as u8];
        bytes.extend(name.as_bytes());
        bytes.extend(payload);
        bytes
    }

    fn text(value: &str) -> Vec<u8> {
        let mut bytes = vec![0, value.len() as u8];
        bytes.extend(value.as_bytes());
        bytes
    }

    #[test]
    fn reads_new_and_old_layouts() {
        let mut fields = named(8, "LevelName", &text("Base"));
        fields.extend(named(3, "GameType", &[0, 0, 0, 1]));
        fields.extend(named(1, "allowCommands", &[1]));
        fields.extend(named(4, "LastPlayed", &1_791_138_897_572i64.to_be_bytes()));
        let mut settings = named(8, "difficulty", &text("hard"));
        settings.extend(named(1, "hardcore", &[1]));
        settings.push(0);
        fields.extend(named(10, "difficulty_settings", &settings));
        let mut version = named(8, "Name", &text("26.2"));
        version.push(0);
        fields.extend(named(10, "Version", &version));
        fields.extend(named(11, "singleplayer_uuid", &[0, 0, 0, 1, 0, 0, 0, 7]));
        let world = info(&parse(&level(&fields)).unwrap()).unwrap();
        assert_eq!(
            world,
            WorldInfo { name: Some("Base".into()), mode: Some("creative"), hardcore: true, difficulty: Some("hard".into()), commands: true, version: Some("26.2".into()), last_played: Some(1_791_138_897), datapacks: 0 }
        );

        let mut old = named(1, "Difficulty", &[1]);
        old.extend(named(1, "hardcore", &[0]));
        let world = info(&parse(&level(&old)).unwrap()).unwrap();
        assert_eq!((world.difficulty.as_deref(), world.hardcore, world.mode), (Some("easy"), false, None));
    }

    #[test]
    fn renames_only_the_level_name() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("clover-world-{}", rand::random::<u64>()));
        std::fs::create_dir_all(&dir).unwrap();
        let write = |fields: &[u8]| {
            let mut encoder = flate2::write::GzEncoder::new(std::fs::File::create(dir.join("level.dat")).unwrap(), flate2::Compression::default());
            encoder.write_all(&level(fields)).unwrap();
            encoder.finish().unwrap();
        };
        let mut fields = named(3, "GameType", &[0, 0, 0, 1]);
        fields.extend(named(8, "LevelName", &text("Nouveau monde")));
        fields.extend(named(11, "singleplayer_uuid", &[0, 0, 0, 1, 0, 0, 0, 7]));
        write(&fields);
        rename(&dir, "  Base de printemps été ").unwrap();
        let world = read(&dir).unwrap();
        assert_eq!((world.name.as_deref(), world.mode), (Some("Base de printemps été"), Some("creative")));

        // Sans LevelName (vieux monde) : ajouté, le reste intact.
        write(&named(3, "GameType", &[0, 0, 0, 0]));
        rename(&dir, "Survie").unwrap();
        assert_eq!(read(&dir).unwrap().name.as_deref(), Some("Survie"));
        assert_eq!(read(&dir).unwrap().mode, Some("survival"));

        for bad in ["", "   ", "nom\u{0}", "monde 🌍"] {
            assert!(rename(&dir, bad).is_err(), "{bad:?}");
        }
        std::fs::write(dir.join("level.dat"), b"pas du gzip").unwrap();
        assert!(rename(&dir, "X").is_err());
        assert_eq!(std::fs::read(dir.join("level.dat")).unwrap(), b"pas du gzip");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_truncated_or_oversized_lengths() {
        let mut fields = named(9, "Huge", &[1]);
        fields.extend(i32::MAX.to_be_bytes());
        assert!(parse(&level(&fields)).is_none());
        assert!(parse(&[10, 0]).is_none());
    }
}
