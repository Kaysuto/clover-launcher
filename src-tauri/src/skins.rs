//! Skins : bibliothèque locale, skins par défaut du jeu, et application au compte Minecraft par
//! l'API de Mojang (le jeton Minecraft ne quitte pas le poste).

use std::io::Read;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::{Digest, Sha1};

use crate::auth::{self, Session};

const PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const DATA_URL_PREFIX: &str = "data:image/png;base64,";
/// Personnages d'origine de Minecraft et forme de bras de leur version de référence.
const DEFAULTS: [(&str, &str, &[u8]); 9] = [
    ("steve", "classic", include_bytes!("../assets/skins/steve.png")),
    ("alex", "slim", include_bytes!("../assets/skins/alex.png")),
    ("ari", "classic", include_bytes!("../assets/skins/ari.png")),
    ("efe", "slim", include_bytes!("../assets/skins/efe.png")),
    ("kai", "classic", include_bytes!("../assets/skins/kai.png")),
    ("makena", "slim", include_bytes!("../assets/skins/makena.png")),
    ("noor", "slim", include_bytes!("../assets/skins/noor.png")),
    ("sunny", "classic", include_bytes!("../assets/skins/sunny.png")),
    ("zuri", "classic", include_bytes!("../assets/skins/zuri.png")),
];

#[derive(Debug, thiserror::Error)]
pub enum SkinError {
    #[error("Ce fichier n'est pas un skin Minecraft : il faut une image .png de 64×64 pixels.")]
    InvalidImage,
    #[error("Minecraft a refusé le skin (HTTP {0}).")]
    Rejected(u16),
    #[error("Trop de changements de skin en peu de temps, réessaie dans quelques minutes.")]
    RateLimited,
    #[error("Erreur réseau : {0}")]
    Network(#[from] reqwest::Error),
    #[error("Erreur disque : {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Auth(#[from] auth::AuthError),
}

impl Serialize for SkinError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, SkinError>;

/// Skin de la bibliothèque, texture en `data:` pour l'interface.
#[derive(Debug, Clone, Serialize)]
pub struct SkinEntry {
    pub id: String,
    pub name: String,
    pub model: String,
    pub texture: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IndexEntry {
    id: String,
    name: String,
    model: String,
}

pub fn library(root: &Path) -> Vec<SkinEntry> {
    read_index(root)
        .into_iter()
        .filter_map(|entry| {
            let bytes = std::fs::read(skin_file(root, &entry.id)).ok()?;
            Some(SkinEntry { texture: data_url(&bytes), id: entry.id, name: entry.name, model: entry.model })
        })
        .collect()
}

/// Ajoute un skin à la bibliothèque. Le même fichier ajouté deux fois n'apparaît qu'une fois.
pub fn add(root: &Path, bytes: &[u8], name: &str, model: &str) -> Result<SkinEntry> {
    validate(bytes)?;
    let id = Sha1::digest(bytes).iter().take(8).map(|byte| format!("{byte:02x}")).collect::<String>();
    std::fs::create_dir_all(root.join("skins"))?;
    std::fs::write(skin_file(root, &id), bytes)?;
    let mut index = read_index(root);
    let name = clean_name(name);
    index.retain(|entry| entry.id != id);
    index.push(IndexEntry { id: id.clone(), name: name.clone(), model: model.into() });
    write_index(root, &index)?;
    Ok(SkinEntry { id, name, model: model.into(), texture: data_url(bytes) })
}

/// Renomme un skin de la bibliothèque et rend le nom retenu, nettoyé comme à l'ajout.
pub fn rename(root: &Path, id: &str, name: &str) -> Result<String> {
    let name = clean_name(name);
    let mut index = read_index(root);
    if let Some(entry) = index.iter_mut().find(|entry| entry.id == id) {
        entry.name = name.clone();
        write_index(root, &index)?;
    }
    Ok(name)
}

pub fn remove(root: &Path, id: &str) -> Result<()> {
    let mut index = read_index(root);
    let before = index.len();
    index.retain(|entry| entry.id != id);
    // Un identifiant hors de l'index ne doit jamais devenir un chemin à supprimer.
    if index.len() == before {
        return Ok(());
    }
    write_index(root, &index)?;
    match std::fs::remove_file(skin_file(root, id)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

/// Skins du client installé, avec les textures embarquées en repli dès le premier démarrage.
pub fn defaults(client_jar: Option<&Path>) -> Vec<SkinEntry> {
    let mut archive = client_jar.and_then(|path| std::fs::File::open(path).ok()).and_then(|file| zip::ZipArchive::new(file).ok());
    DEFAULTS
        .iter()
        .map(|(name, model, fallback)| {
            let folder = if *model == "slim" { "slim" } else { "wide" };
            let bytes = archive.as_mut().and_then(|archive| {
                let entry = archive.by_name(&format!("assets/minecraft/textures/entity/player/{folder}/{name}.png")).ok()?;
                let mut bytes = Vec::new();
                entry.take(256 * 1024 + 1).read_to_end(&mut bytes).ok()?;
                validate(&bytes).ok()?;
                Some(bytes)
            });
            let mut title = name.to_string();
            title[..1].make_ascii_uppercase();
            SkinEntry { id: format!("default-{name}"), name: title, model: (*model).into(), texture: data_url(bytes.as_deref().unwrap_or(fallback)) }
        })
        .collect()
}

/// Applique skin et cape au compte, puis renvoie la session avec le profil à jour.
///
/// `texture` : `data:image/png;base64,…` ou adresse `textures.minecraft.net` (skin actuel dont on
/// ne change que les bras). `cape` : identifiant d'une cape possédée, ou `None` pour l'enlever.
pub async fn apply(session: &Session, texture: &str, model: &str, cape: Option<&str>) -> Result<Session> {
    let http = reqwest::Client::new();
    let bytes = texture_bytes(&http, texture).await?;
    validate(&bytes)?;

    let form = reqwest::multipart::Form::new().text("variant", model.to_owned()).part(
        "file",
        reqwest::multipart::Part::bytes(bytes).file_name("skin.png").mime_str("image/png").expect("type MIME valide"),
    );
    let response = http.post(format!("{PROFILE_URL}/skins")).bearer_auth(&session.minecraft_token).multipart(form).send().await?;
    let mut profile = checked(response).await?;

    let currently = session.profile.capes.iter().find(|cape| cape.active).map(|cape| cape.id.as_str());
    if currently != cape {
        let request = match cape {
            Some(id) => http.put(format!("{PROFILE_URL}/capes/active")).json(&json!({ "capeId": id })),
            None => http.delete(format!("{PROFILE_URL}/capes/active")),
        };
        profile = checked(request.bearer_auth(&session.minecraft_token).send().await?).await?;
    }
    Ok(auth::update_profile(session, &profile)?)
}

async fn texture_bytes(http: &reqwest::Client, texture: &str) -> Result<Vec<u8>> {
    if let Some(encoded) = texture.strip_prefix(DATA_URL_PREFIX) {
        return STANDARD.decode(encoded).map_err(|_| SkinError::InvalidImage);
    }
    // Seules les textures de Mojang sont téléchargées : jamais une adresse quelconque.
    let url = url::Url::parse(texture).map_err(|_| SkinError::InvalidImage)?;
    if url.host_str() != Some("textures.minecraft.net") {
        return Err(SkinError::InvalidImage);
    }
    Ok(http.get(url).send().await?.error_for_status()?.bytes().await?.to_vec())
}

async fn checked(response: reqwest::Response) -> Result<Value> {
    let status = response.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(SkinError::RateLimited);
    }
    if !status.is_success() {
        return Err(SkinError::Rejected(status.as_u16()));
    }
    Ok(response.json().await?)
}

/// PNG de 64×64 (ou 64×32, ancien format) : signature puis dimensions dans l'en-tête IHDR.
fn validate(bytes: &[u8]) -> Result<()> {
    const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.len() < 24 || bytes[..8] != SIGNATURE || bytes.len() > 256 * 1024 {
        return Err(SkinError::InvalidImage);
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().expect("4 octets"));
    let height = u32::from_be_bytes(bytes[20..24].try_into().expect("4 octets"));
    if width == 64 && (height == 64 || height == 32) {
        Ok(())
    } else {
        Err(SkinError::InvalidImage)
    }
}

fn data_url(bytes: &[u8]) -> String {
    format!("{DATA_URL_PREFIX}{}", STANDARD.encode(bytes))
}

fn clean_name(name: &str) -> String {
    let name: String = name.trim().trim_end_matches(".png").chars().take(32).collect();
    if name.is_empty() { "Skin".to_owned() } else { name }
}

fn skin_file(root: &Path, id: &str) -> PathBuf {
    root.join("skins").join(format!("{id}.png"))
}

fn read_index(root: &Path) -> Vec<IndexEntry> {
    std::fs::read(root.join("skins").join("index.json")).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
}

fn write_index(root: &Path, index: &[IndexEntry]) -> Result<()> {
    std::fs::create_dir_all(root.join("skins"))?;
    std::fs::write(root.join("skins").join("index.json"), serde_json::to_vec_pretty(index).expect("index sérialisable"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, b'I', b'H', b'D', b'R'];
        bytes.extend_from_slice(&width.to_be_bytes());
        bytes.extend_from_slice(&height.to_be_bytes());
        bytes
    }

    #[test]
    fn accepts_only_skin_sized_png() {
        assert!(validate(&png(64, 64)).is_ok());
        assert!(validate(&png(64, 32)).is_ok());
        assert!(validate(&png(128, 128)).is_err());
        assert!(validate(b"pas une image du tout, vraiment").is_err());
    }

    #[test]
    fn defaults_are_available_without_minecraft_or_a_manifest() {
        let root = std::env::temp_dir().join(format!("clover-default-skins-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let missing = root.join("missing.jar");
        let broken = root.join("broken.jar");
        std::fs::write(&broken, b"client incomplet").unwrap();
        for path in [None, Some(missing.as_path()), Some(broken.as_path())] {
            let skins = defaults(path);
            assert_eq!(skins.len(), 9);
            assert_eq!(skins[0].id, "default-steve");
            assert_eq!(skins[0].model, "classic");
            assert_eq!(skins[1].id, "default-alex");
            assert_eq!(skins[1].model, "slim");
            for skin in skins {
                let bytes = STANDARD.decode(skin.texture.strip_prefix(DATA_URL_PREFIX).unwrap()).unwrap();
                validate(&bytes).unwrap();
                assert_eq!(u32::from_be_bytes(bytes[20..24].try_into().unwrap()), 64);
            }
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn installed_textures_take_priority_with_fallback_for_missing_or_invalid_entries() {
        use std::io::Write;
        let jar = std::env::temp_dir().join(format!("clover-skin-client-{}.jar", std::process::id()));
        let mut archive = zip::ZipWriter::new(std::fs::File::create(&jar).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        archive.start_file("assets/minecraft/textures/entity/player/wide/steve.png", options).unwrap();
        let replacement = png(64, 64);
        archive.write_all(&replacement).unwrap();
        archive.start_file("assets/minecraft/textures/entity/player/slim/alex.png", options).unwrap();
        archive.write_all(b"invalide").unwrap();
        archive.finish().unwrap();
        let skins = defaults(Some(&jar));
        let bundled = defaults(None);
        assert_eq!(skins.len(), 9);
        assert_eq!(skins[0].texture, data_url(&replacement));
        assert_eq!(skins[1].texture, bundled[1].texture);
        assert_eq!(skins[2].texture, bundled[2].texture);
        std::fs::remove_file(jar).unwrap();
    }

    #[test]
    fn library_add_is_idempotent_and_removable() {
        let root = std::env::temp_dir().join(format!("clover-skins-{}", std::process::id()));
        let first = add(&root, &png(64, 64), "Mon skin.png", "slim").unwrap();
        add(&root, &png(64, 64), "Doublon", "slim").unwrap();
        let skins = library(&root);
        assert_eq!(skins.len(), 1);
        assert_eq!(skins[0].name, "Doublon");
        assert_eq!(rename(&root, &first.id, "  Ancien.png ").unwrap(), "Ancien");
        assert_eq!(rename(&root, &first.id, "   ").unwrap(), "Skin");
        assert_eq!(library(&root)[0].name, "Skin");
        rename(&root, "inconnu", "Autre").unwrap();
        assert_eq!(library(&root).len(), 1);
        remove(&root, &first.id).unwrap();
        assert!(library(&root).is_empty());
        let outside = root.join("dehors.png");
        std::fs::write(&outside, b"x").unwrap();
        remove(&root, "../dehors").unwrap();
        assert!(outside.exists());
        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn refuses_foreign_texture_hosts() {
        let http = reqwest::Client::new();
        assert!(texture_bytes(&http, "https://exemple.invalid/skin.png").await.is_err());
    }
}
