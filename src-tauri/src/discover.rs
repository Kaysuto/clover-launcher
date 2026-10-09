//! Découverte de l'onglet Personnages : skins de la communauté (laby.net), catalogue des capes
//! officielles (capes.me) et skin actuel d'un joueur (API de Mojang). Ces sites sont interrogés à la
//! demande, rien n'est recopié ; leurs réponses sont réduites ici aux champs affichés.

use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::game::download;

const LABY_API: &str = "https://laby.net/api/v3";
const LABY_TEXTURES: &str = "https://texture.laby.net";
const CAPES_URL: &str = "https://capes.me/api/capes";
const MOJANG_NAME_URL: &str = "https://api.mojang.com/users/profiles/minecraft";
const MOJANG_PROFILE_URL: &str = "https://sessionserver.mojang.com/session/minecraft/profile";
const TIMEOUT: Duration = Duration::from_secs(10);
/// Skins par page, comme sur laby.net.
const PAGE_SIZE: u32 = 36;
const TAG_COUNT: u32 = 40;
/// Porteurs d'une cape affichés (laby.net en renvoie davantage).
const WEARER_COUNT: usize = 24;
/// Tris de laby.net : tendances sur 24 h, 7 jours, 30 jours, plus portés, plus récents.
const ORDERS: [&str; 5] = ["trending_24h", "trending_7d", "trending_30d", "most_used", "latest"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinTag {
    /// Nom anglais, utilisé pour la recherche.
    pub name: String,
    /// Traduction française de laby.net, sinon le nom anglais.
    pub label: String,
    pub count: u64,
    pub emoji: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunitySkin {
    pub hash: String,
    pub texture: String,
    pub model: &'static str,
    /// Comptes vus avec ce skin par laby.net.
    pub uses: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueCape {
    /// Identifiant de capes.me (`2011`, `migrator_cape`…), clé des textes d'obtention.
    pub id: String,
    pub title: String,
    /// Texture sur `textures.minecraft.net`.
    pub texture: String,
    /// Empreintes de texture (dernier segment de l'adresse), anciennes versions comprises : une cape
    /// du compte est reconnue par la sienne.
    pub hashes: Vec<String>,
    pub laby_id: Option<String>,
    /// Comptes recensés par capes.me.
    pub owners: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wearer {
    pub name: String,
    pub uuid: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapeWearers {
    /// Comptes vus avec cette cape par laby.net.
    pub count: u64,
    pub players: Vec<Wearer>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerLook {
    pub name: String,
    pub uuid: String,
    /// Absent : le joueur porte un skin par défaut de Mojang.
    pub texture: Option<String>,
    pub model: &'static str,
    pub cape: Option<String>,
}

#[derive(Deserialize)]
struct LabyTag {
    name: String,
    use_count: u64,
    #[serde(default)]
    translations: std::collections::HashMap<String, String>,
    emoji: Option<String>,
}

#[derive(Deserialize)]
struct LabySearch {
    results: Vec<LabyTexture>,
}

#[derive(Deserialize)]
struct LabyTexture {
    image_hash: String,
    use_count: u64,
    #[serde(default)]
    slim: bool,
}

#[derive(Deserialize)]
struct LabyUsers {
    count: u64,
    users: Vec<LabyUser>,
}

#[derive(Deserialize)]
struct LabyUser {
    name: String,
    uuid: String,
}

#[derive(Deserialize)]
struct CapesMeCape {
    url: String,
    #[serde(rename = "type")]
    id: String,
    title: String,
    #[serde(default)]
    alts: Vec<String>,
    #[serde(default, rename = "labyIds")]
    laby_ids: Vec<String>,
    #[serde(default)]
    hidden: bool,
    #[serde(default)]
    users: u64,
    #[serde(default)]
    order: i64,
}

#[derive(Deserialize)]
struct MojangName {
    id: String,
}

#[derive(Deserialize)]
struct MojangProfile {
    id: String,
    name: String,
    properties: Vec<MojangProperty>,
}

#[derive(Deserialize)]
struct MojangProperty {
    name: String,
    value: String,
}

#[derive(Deserialize)]
struct Textures {
    textures: TextureSet,
}

#[derive(Deserialize)]
struct TextureSet {
    #[serde(rename = "SKIN")]
    skin: Option<Texture>,
    #[serde(rename = "CAPE")]
    cape: Option<Texture>,
}

#[derive(Deserialize)]
struct Texture {
    url: String,
    metadata: Option<TextureMetadata>,
}

#[derive(Deserialize)]
struct TextureMetadata {
    model: Option<String>,
}

/// Étiquettes les plus utilisées sur laby.net.
pub async fn tags() -> Result<Vec<SkinTag>, String> {
    let tags: Vec<LabyTag> = get(&format!("{LABY_API}/tags?size={TAG_COUNT}"), "laby.net").await?;
    Ok(tags
        .into_iter()
        .filter(|tag| !tag.name.trim().is_empty())
        .map(|tag| SkinTag {
            label: tag.translations.get("FR").filter(|label| !label.trim().is_empty()).cloned().unwrap_or_else(|| tag.name.clone()),
            name: tag.name,
            count: tag.use_count,
            emoji: tag.emoji,
        })
        .collect())
}

/// Une page de skins de laby.net. `input` : texte libre ou nom anglais d'une étiquette.
pub async fn skins(input: &str, order: &str, offset: u32) -> Result<Vec<CommunitySkin>, String> {
    if !ORDERS.contains(&order) {
        return Err("Tri inconnu.".into());
    }
    let mut url = url::Url::parse(&format!("{LABY_API}/search/textures/skin")).expect("adresse valide");
    url.query_pairs_mut().append_pair("order", order).append_pair("size", &PAGE_SIZE.to_string()).append_pair("offset", &offset.to_string());
    let input = input.trim();
    if !input.is_empty() {
        url.query_pairs_mut().append_pair("input", &input.chars().take(64).collect::<String>());
    }
    let search: LabySearch = get(url.as_str(), "laby.net").await?;
    Ok(community_skins(search))
}

fn community_skins(search: LabySearch) -> Vec<CommunitySkin> {
    search
        .results
        .into_iter()
        .filter(|skin| is_hash(&skin.image_hash))
        .map(|skin| CommunitySkin {
            texture: format!("{LABY_TEXTURES}/{}.png", skin.image_hash),
            hash: skin.image_hash,
            model: if skin.slim { "slim" } else { "classic" },
            uses: skin.use_count,
        })
        .collect()
}

/// Capes officielles de Minecraft, dans l'ordre de capes.me.
pub async fn capes() -> Result<Vec<CatalogueCape>, String> {
    Ok(catalogue(get(CAPES_URL, "capes.me").await?))
}

fn catalogue(mut capes: Vec<CapesMeCape>) -> Vec<CatalogueCape> {
    capes.retain(|cape| !cape.hidden && is_mojang_texture(&cape.url));
    capes.sort_by_key(|cape| cape.order);
    capes
        .into_iter()
        .map(|cape| CatalogueCape {
            hashes: std::iter::once(&cape.url).chain(&cape.alts).filter_map(|url| texture_hash(url)).collect(),
            laby_id: cape.laby_ids.into_iter().find(|id| is_hash(id)),
            id: cape.id,
            title: cape.title,
            texture: cape.url,
            owners: cape.users,
        })
        .collect()
}

/// Joueurs vus avec une cape par laby.net (`laby_id` : identifiant de texture de laby.net).
pub async fn cape_wearers(laby_id: &str) -> Result<CapeWearers, String> {
    if !is_hash(laby_id) {
        return Err("Cape inconnue.".into());
    }
    let users: LabyUsers = get(&format!("{LABY_API}/texture/{laby_id}/cape/users"), "laby.net").await?;
    Ok(CapeWearers {
        count: users.count,
        players: users.users.into_iter().filter(|user| is_player_name(&user.name)).take(WEARER_COUNT).map(|user| Wearer { name: user.name, uuid: user.uuid }).collect(),
    })
}

/// Skin et cape actuels d'un joueur, lus chez Mojang. `None` : aucun compte à ce pseudo.
pub async fn player(name: &str) -> Result<Option<PlayerLook>, String> {
    if !is_player_name(name) {
        return Ok(None);
    }
    let http = download::client();
    let response = http.get(format!("{MOJANG_NAME_URL}/{name}")).timeout(TIMEOUT).send().await.map_err(|_| unavailable("Mojang"))?;
    if matches!(response.status().as_u16(), 204 | 404) {
        return Ok(None);
    }
    let found: MojangName = response.error_for_status().map_err(|_| unavailable("Mojang"))?.json().await.map_err(|_| unavailable("Mojang"))?;
    if !found.id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(unavailable("Mojang"));
    }
    let profile: MojangProfile = get(&format!("{MOJANG_PROFILE_URL}/{}", found.id), "Mojang").await?;
    Ok(Some(player_look(profile)))
}

fn player_look(profile: MojangProfile) -> PlayerLook {
    let textures = profile
        .properties
        .iter()
        .find(|property| property.name == "textures")
        .and_then(|property| STANDARD.decode(&property.value).ok())
        .and_then(|bytes| serde_json::from_slice::<Textures>(&bytes).ok())
        .map(|textures| textures.textures);
    let (skin, cape) = textures.map_or((None, None), |set| (set.skin, set.cape));
    let slim = skin.as_ref().and_then(|skin| skin.metadata.as_ref()).and_then(|metadata| metadata.model.as_deref()) == Some("slim");
    PlayerLook {
        uuid: dashed(&profile.id),
        name: profile.name,
        texture: skin.and_then(|skin| https_texture(&skin.url)),
        model: if slim { "slim" } else { "classic" },
        cape: cape.and_then(|cape| https_texture(&cape.url)),
    }
}

async fn get<T: DeserializeOwned>(url: &str, source: &str) -> Result<T, String> {
    download::client()
        .get(url)
        .timeout(TIMEOUT)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|_| unavailable(source))?
        .json()
        .await
        .map_err(|_| format!("Réponse de {source} illisible."))
}

fn unavailable(source: &str) -> String {
    format!("{source} ne répond pas : réessaie dans un instant.")
}

/// Empreinte de texture de laby.net : 32 caractères hexadécimaux.
fn is_hash(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_player_name(name: &str) -> bool {
    (3..=16).contains(&name.len()) && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

fn is_mojang_texture(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|url| url.host_str() == Some("textures.minecraft.net"))
}

/// Adresse `textures.minecraft.net` en https (Mojang les donne en http).
fn https_texture(url: &str) -> Option<String> {
    let mut url = url::Url::parse(url).ok().filter(|url| url.host_str() == Some("textures.minecraft.net"))?;
    url.set_scheme("https").ok()?;
    Some(url.into())
}

fn texture_hash(url: &str) -> Option<String> {
    is_mojang_texture(url).then(|| url.rsplit('/').next().unwrap_or_default().to_owned()).filter(|hash| !hash.is_empty())
}

fn dashed(id: &str) -> String {
    if id.len() != 32 {
        return id.to_owned();
    }
    format!("{}-{}-{}-{}-{}", &id[..8], &id[8..12], &id[12..16], &id[16..20], &id[20..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_valid_laby_skins() {
        let search: LabySearch = serde_json::from_str(
            r#"{"results":[
                {"image_hash":"497c555947a31e312fe1cfad857be2b4","use_count":5738317,"tags":"Steve Default","slim":false},
                {"image_hash":"42505e58ec9bcc1e53944952b6775de3","use_count":12,"tags":null,"slim":true},
                {"image_hash":"../../etc","use_count":1,"tags":null,"slim":false}
            ]}"#,
        )
        .unwrap();
        let skins = community_skins(search);
        assert_eq!(skins.len(), 2);
        assert_eq!(skins[0].texture, "https://texture.laby.net/497c555947a31e312fe1cfad857be2b4.png");
        assert_eq!(skins[0].model, "classic");
        assert_eq!(skins[1].model, "slim");
    }

    #[test]
    fn reads_the_capes_me_catalogue() {
        let capes: Vec<CapesMeCape> = serde_json::from_str(
            r#"[
                {"url":"https://textures.minecraft.net/texture/b0cc","type":"2012","title":"Minecon2012","alts":["https://textures.minecraft.net/texture/a1"],"labyIds":["2b7ccdbfd1d89520f335822140d83d52"],"hidden":false,"users":4195,"order":1},
                {"url":"https://textures.minecraft.net/texture/953c","type":"2011","title":"Minecon2011","alts":[],"labyIds":[],"hidden":false,"users":3616,"order":0},
                {"url":"https://textures.minecraft.net/texture/dead","type":"bacon","title":"Bacon","hidden":true,"order":2},
                {"url":"https://exemple.invalid/cape.png","type":"faux","title":"Faux","order":3}
            ]"#,
        )
        .unwrap();
        let capes = catalogue(capes);
        assert_eq!(capes.iter().map(|cape| cape.id.as_str()).collect::<Vec<_>>(), ["2011", "2012"]);
        assert_eq!(capes[1].hashes, ["b0cc", "a1"]);
        assert_eq!(capes[1].laby_id.as_deref(), Some("2b7ccdbfd1d89520f335822140d83d52"));
        assert_eq!(capes[0].laby_id, None);
    }

    #[test]
    fn reads_a_mojang_profile() {
        let textures = r#"{"textures":{"SKIN":{"url":"http://textures.minecraft.net/texture/abc","metadata":{"model":"slim"}},"CAPE":{"url":"http://textures.minecraft.net/texture/def"}}}"#;
        let profile = MojangProfile {
            id: "069a79f444e94726a5befca90e38aaf5".into(),
            name: "Notch".into(),
            properties: vec![MojangProperty { name: "textures".into(), value: STANDARD.encode(textures) }],
        };
        let look = player_look(profile);
        assert_eq!(look.uuid, "069a79f4-44e9-4726-a5be-fca90e38aaf5");
        assert_eq!(look.texture.as_deref(), Some("https://textures.minecraft.net/texture/abc"));
        assert_eq!(look.model, "slim");
        assert_eq!(look.cape.as_deref(), Some("https://textures.minecraft.net/texture/def"));
    }

    #[tokio::test]
    async fn refuses_unknown_orders_and_names() {
        assert!(skins("", "random", 0).await.is_err());
        assert!(cape_wearers("../users").await.is_err());
        assert!(player("a/b").await.unwrap().is_none());
        assert!(!is_player_name("ab"));
        assert!(is_player_name("Kaysuto_42"));
    }

    /// Sources réelles (`cargo test -- --ignored`).
    #[tokio::test]
    #[ignore]
    async fn reads_the_real_sources() {
        let tags = tags().await.unwrap();
        assert!(tags.iter().any(|tag| tag.label == "Fille"));
        for order in ORDERS {
            assert_eq!(skins("Blue", order, 0).await.unwrap().len(), PAGE_SIZE as usize, "{order}");
        }
        let capes = capes().await.unwrap();
        let migrator = capes.iter().find(|cape| cape.id == "migrator_cape").unwrap();
        let wearers = cape_wearers(migrator.laby_id.as_deref().unwrap()).await.unwrap();
        assert!(wearers.count > 1000 && !wearers.players.is_empty());
        let notch = player("Notch").await.unwrap().unwrap();
        assert!(notch.texture.is_some());
        let page = skins("", "trending_24h", 0).await.unwrap();
        let root = std::env::temp_dir().join("clover-discover-test");
        let added = crate::skins::add_remote(&root, &page[0].texture, "Essai", page[0].model).await.unwrap();
        assert!(added.texture.starts_with("data:image/png;base64,"));
        std::fs::remove_dir_all(root).ok();
    }
}
