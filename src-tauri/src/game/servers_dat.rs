//! `servers.dat` : NBT non compressé, composé racine qui ne contient que la liste `servers`
//! (`name`, `ip`, `icon`, `hidden`, `acceptTextures`…). Juste de quoi compter, comparer et fusionner
//! les entrées, et accepter d'office le pack de ressources des serveurs Clover Games.

const END: u8 = 0;
const BYTE: u8 = 1;
const STRING: u8 = 8;
const LIST: u8 = 9;
const COMPOUND: u8 = 10;
/// Profondeur d'imbrication acceptée, bien au-delà de celle d'une entrée de serveur.
const MAX_DEPTH: u8 = 32;

struct Reader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let slice = self.bytes.get(self.pos..self.pos.checked_add(n)?)?;
        self.pos += n;
        Some(slice)
    }

    fn byte(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }

    fn length(&mut self) -> Option<usize> {
        usize::try_from(i32::from_be_bytes(self.take(4)?.try_into().ok()?)).ok()
    }

    fn string(&mut self) -> Option<&'a [u8]> {
        let n = u16::from_be_bytes(self.take(2)?.try_into().ok()?);
        self.take(usize::from(n))
    }

    /// Passe la valeur d'une balise de type `kind`.
    fn skip(&mut self, kind: u8, depth: u8) -> Option<()> {
        if depth > MAX_DEPTH {
            return None;
        }
        match kind {
            1 => self.take(1).map(drop),
            2 => self.take(2).map(drop),
            3 | 5 => self.take(4).map(drop),
            4 | 6 => self.take(8).map(drop),
            7 => {
                let n = self.length()?;
                self.take(n).map(drop)
            }
            STRING => self.string().map(drop),
            LIST => {
                let item = self.byte()?;
                for _ in 0..self.length()? {
                    self.skip(item, depth + 1)?;
                }
                Some(())
            }
            COMPOUND => loop {
                let tag = self.byte()?;
                if tag == END {
                    return Some(());
                }
                self.string()?;
                self.skip(tag, depth + 1)?;
            },
            11 => {
                let n = self.length()?;
                self.take(n.checked_mul(4)?).map(drop)
            }
            12 => {
                let n = self.length()?;
                self.take(n.checked_mul(8)?).map(drop)
            }
            _ => None,
        }
    }

    /// Dans un composé, se place sur la valeur de la balise `name` de type `kind`.
    fn find(mut self, kind: u8, name: &[u8]) -> Option<Self> {
        loop {
            let tag = self.byte()?;
            if tag == END {
                return None;
            }
            let found = self.string()? == name;
            if found && tag == kind {
                return Some(self);
            }
            self.skip(tag, 1)?;
        }
    }
}

/// Entrées de la liste (valeur brute du composé, balise de fin comprise) ; `None` si le
/// fichier n'est pas lisible.
pub fn entries(bytes: &[u8]) -> Option<Vec<&[u8]>> {
    let mut reader = Reader { bytes, pos: 0 };
    if reader.byte()? != COMPOUND {
        return None;
    }
    reader.string()?;
    let mut entries = Vec::new();
    loop {
        let tag = reader.byte()?;
        if tag == END {
            return Some(entries);
        }
        let name = reader.string()?;
        if tag == LIST && name == b"servers" {
            let item = reader.byte()?;
            let n = reader.length()?;
            if n > 0 && item != COMPOUND {
                return None;
            }
            for _ in 0..n {
                let start = reader.pos;
                reader.skip(COMPOUND, 1)?;
                entries.push(&bytes[start..reader.pos]);
            }
        } else {
            reader.skip(tag, 1)?;
        }
    }
}

/// Adresse en minuscules, pour reconnaître un serveur déjà enregistré.
pub fn address(entry: &[u8]) -> Option<String> {
    let ip = Reader { bytes: entry, pos: 0 }.find(STRING, b"ip")?.string()?;
    Some(String::from_utf8_lossy(ip).trim().to_ascii_lowercase())
}

/// Entrée gardée par le jeu pour une connexion directe, absente du menu Multijoueur.
pub fn hidden(entry: &[u8]) -> bool {
    Reader { bytes: entry, pos: 0 }.find(BYTE, b"hidden").and_then(|mut reader| reader.byte()).is_some_and(|value| value != 0)
}

pub fn write(entries: &[&[u8]]) -> Vec<u8> {
    let mut out = vec![COMPOUND, 0, 0, LIST, 0, 7];
    out.extend_from_slice(b"servers");
    out.push(COMPOUND);
    out.extend_from_slice(&i32::try_from(entries.len()).unwrap_or(i32::MAX).to_be_bytes());
    for entry in entries {
        out.extend_from_slice(entry);
    }
    out.push(END);
    out
}

/// Entrée cachée (absente du menu Multijoueur) qui accepte le pack de ressources du serveur sans
/// question : celle que le jeu garde pour une connexion directe.
pub fn accepted_hidden_entry(host: &str) -> Vec<u8> {
    let mut entry = Vec::new();
    for (key, value) in [("name", host), ("ip", host)] {
        tag(&mut entry, STRING, key);
        string(&mut entry, value);
    }
    for key in ["hidden", "acceptTextures"] {
        tag(&mut entry, BYTE, key);
        entry.push(1);
    }
    entry.push(END);
    entry
}

/// Ajoute à `servers.dat` une entrée cachée qui accepte le pack de chaque hôte absent (comparaison
/// de l'adresse, sans casse). Un fichier illisible n'est pas touché. Renvoie le nombre d'ajouts.
pub fn accept_packs(path: &std::path::Path, hosts: &[&str]) -> std::io::Result<usize> {
    let existing = std::fs::read(path).unwrap_or_default();
    let current = if existing.is_empty() { Vec::new() } else if let Some(current) = entries(&existing) { current } else { return Ok(0) };
    let known: std::collections::HashSet<String> = current.iter().filter_map(|entry| address(entry)).collect();
    let added: Vec<Vec<u8>> = hosts.iter().filter(|host| !known.contains(&host.to_ascii_lowercase())).map(|host| accepted_hidden_entry(host)).collect();
    if added.is_empty() {
        return Ok(0);
    }
    let merged: Vec<&[u8]> = current.into_iter().chain(added.iter().map(Vec::as_slice)).collect();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("dat.tmp");
    std::fs::write(&temporary, write(&merged))?;
    std::fs::rename(temporary, path)?;
    Ok(added.len())
}

fn tag(out: &mut Vec<u8>, kind: u8, name: &str) {
    out.push(kind);
    string(out, name);
}

fn string(out: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    out.extend_from_slice(&u16::try_from(bytes.len()).unwrap_or(u16::MAX).to_be_bytes());
    out.extend_from_slice(&bytes[..bytes.len().min(usize::from(u16::MAX))]);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_packs_are_accepted_once_in_hidden_entries() {
        let path = std::env::temp_dir().join(format!("clover-servers-{}", rand::random::<u64>())).join("servers.dat");
        let visible = {
            let mut entry = Vec::new();
            tag(&mut entry, STRING, "ip");
            string(&mut entry, "PLAY.clovergames.fr");
            entry.push(END);
            entry
        };
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, write(&[&visible])).unwrap();

        assert_eq!(accept_packs(&path, &["play.clovergames.fr", "bedwars.play.clovergames.fr"]).unwrap(), 1);
        assert_eq!(accept_packs(&path, &["play.clovergames.fr", "bedwars.play.clovergames.fr"]).unwrap(), 0);
        let bytes = std::fs::read(&path).unwrap();
        let list = entries(&bytes).unwrap();
        assert_eq!(list.len(), 2);
        assert!(hidden(list[1]) && !hidden(list[0]));
        assert_eq!(address(list[1]).as_deref(), Some("bedwars.play.clovergames.fr"));
        assert!(Reader { bytes: list[1], pos: 0 }.find(BYTE, b"acceptTextures").and_then(|mut reader| reader.byte()) == Some(1));

        std::fs::write(&path, b"pas du NBT").unwrap();
        assert_eq!(accept_packs(&path, &["play.clovergames.fr"]).unwrap(), 0);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
