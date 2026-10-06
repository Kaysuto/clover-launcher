//! Manifeste distant signé : ce que le launcher installe (version, loader, serveur, modes, mods).
//!
//! Produit et signé par `manifest/manifest.mjs`. Le launcher refuse tout manifeste dont la
//! signature ed25519 ne correspond pas à la clé publique embarquée, ainsi qu'un manifeste plus
//! ancien que le dernier accepté (rejeu d'une ancienne version signée). Le dernier manifeste
//! valide est gardé sur le disque pour jouer hors ligne.

use std::collections::HashSet;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

use super::{GameError, Result};

/// Canaux publiés sur le CDN : `launcher/<canal>/manifest.json`.
const CDN: &str = "https://cdn.clovergames.fr/launcher";
pub const PROD: &str = "prod";
pub const BETA: &str = "beta";
const MANIFEST_PUBLIC_KEY: &str = "X/zKDL8dnvMWXTyzxZDeP5cPF+6uF9JWdvgNeYpJB6w=";
const SUPPORTED_SCHEMA: u32 = 1;

/// Dossier contenant `manifest.json` et `manifest.json.sig`, à la place du CDN (développement,
/// tant que `cdn.clovergames.fr` n'existe pas). La signature reste vérifiée.
const LOCAL_OVERRIDE_ENV: &str = "CLOVER_MANIFEST_DIR";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema: u32,
    pub serial: u64,
    pub min_launcher_version: String,
    pub minecraft: MinecraftTarget,
    pub fabric: FabricTarget,
    pub server: ServerTarget,
    pub modes: Vec<Mode>,
    pub mods: Vec<Mod>,
    /// Comptes Minecraft (UUID) qui voient le réglage « Canal bêta ». Absent des anciens manifestes.
    #[serde(default)]
    pub beta_testers: Vec<String>,
    /// Réglages de départ par niveau de machine (`modest`, `standard`, `powerful`).
    #[serde(default)]
    pub presets: std::collections::BTreeMap<String, super::presets::Preset>,
}

impl Manifest {
    /// Adresses des serveurs du réseau : principale et celles des modes.
    pub fn hosts(&self) -> Vec<&str> {
        std::iter::once(self.server.host.as_str()).chain(self.modes.iter().filter_map(|mode| mode.host.as_deref())).collect()
    }
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftTarget {
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FabricTarget {
    pub loader: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerTarget {
    pub host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mode {
    pub id: String,
    pub name: String,
    pub image: Option<String>,
    /// Adresse qui connecte directement à ce mode (Quick Play). Absente : le mode se rejoint
    /// depuis le Lobby. Le proxy reconnaît le mode à l'adresse tapée (`forced_hosts`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mod {
    pub id: String,
    pub name: String,
    /// Logo du mod (URL). Absent des manifestes publiés avant son ajout.
    #[serde(default)]
    pub icon: Option<String>,
    /// Version du fichier, affichée sur la carte.
    #[serde(default)]
    pub version: Option<String>,
    pub description: Option<String>,
    /// Description complète en français (Markdown), qui remplace celle de Modrinth sur la page du
    /// mod. Rendue côté Rust : jamais envoyée telle quelle à l'interface.
    #[serde(default, skip_serializing)]
    pub body: Option<String>,
    pub category: Option<String>,
    pub default: bool,
    /// Dépendance ajoutée par le script : jamais affichée, installée avec les mods qui la requièrent.
    pub hidden: bool,
    pub available: bool,
    pub file: Option<ModFile>,
    #[serde(default)]
    pub requires: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModFile {
    pub filename: String,
    pub url: String,
    pub sha512: String,
    pub size: u64,
}

impl Manifest {
    /// Adresse à rejoindre : celle du mode demandé, le serveur principal sinon.
    pub fn server_for(&self, mode: Option<&str>) -> Option<&str> {
        match mode {
            None => Some(&self.server.host),
            Some(id) => self.modes.iter().find(|m| m.id == id)?.host.as_deref(),
        }
    }

    /// Mods visibles activés par défaut. Les choix du joueur remplaceront cette liste (CLO-274).
    pub fn default_mods(&self) -> HashSet<String> {
        self.mods.iter().filter(|m| m.default && !m.hidden && m.available).map(|m| m.id.clone()).collect()
    }

    /// Mods à installer : ceux demandés et disponibles, plus toutes leurs dépendances.
    pub fn mods_to_install(&self, enabled: &HashSet<String>) -> Vec<&Mod> {
        let mut selected: Vec<&Mod> = Vec::new();
        let mut seen = HashSet::new();
        let mut pending: Vec<&str> = self
            .mods
            .iter()
            .filter(|m| m.available && !m.hidden && enabled.contains(&m.id))
            .map(|m| m.id.as_str())
            .collect();
        while let Some(id) = pending.pop() {
            if !seen.insert(id) {
                continue;
            }
            if let Some(found) = self.mods.iter().find(|m| m.id == id) {
                pending.extend(found.requires.iter().map(String::as_str));
                selected.push(found);
            }
        }
        selected
    }
}

/// Télécharge le manifeste du canal (`PROD` ou `BETA`), le vérifie et le garde en cache. Hors ligne,
/// se replie sur le cache. Le canal bêta sans manifeste publié suit celui de prod. Chaque canal a
/// son cache (`<cache>/beta/`) : leurs numéros anti-rejeu ne se comparent pas.
pub async fn load(http: &reqwest::Client, cache_dir: &Path, channel: &str) -> Result<Manifest> {
    if channel == BETA {
        // Ni publié ni en cache : celui de prod.
        if let Ok(manifest) = load_channel(http, &cache_dir.join(BETA), BETA).await {
            return Ok(manifest);
        }
    }
    load_channel(http, cache_dir, PROD).await
}

async fn load_channel(http: &reqwest::Client, cache_dir: &Path, channel: &str) -> Result<Manifest> {
    let cached = read_cached(cache_dir).await;
    let fetched = match fetch(http, channel).await {
        Ok((bytes, signature)) => Some(verify(&bytes, &signature).map(|manifest| (bytes, signature, manifest))),
        Err(error) => {
            eprintln!("[manifest] téléchargement impossible, repli sur le cache : {error}");
            None
        }
    };

    match (fetched, cached) {
        (Some(Ok((bytes, signature, manifest))), cached) => {
            if let Some(cached) = cached.as_ref().filter(|cached| cached.serial > manifest.serial) {
                eprintln!("[manifest] manifeste reçu plus ancien que le cache ({} < {}), ignoré", manifest.serial, cached.serial);
                return Ok(cached.clone());
            }
            write_cache(cache_dir, &bytes, &signature).await?;
            Ok(manifest)
        }
        (Some(Err(error)), Some(cached)) => {
            eprintln!("[manifest] manifeste reçu refusé ({error}), repli sur le cache");
            Ok(cached)
        }
        (Some(Err(error)), None) => Err(error),
        (None, Some(cached)) => Ok(cached),
        (None, None) => Err(GameError::ManifestUnavailable),
    }
}

/// Refuse un launcher trop ancien pour ce manifeste.
pub fn check_launcher_version(manifest: &Manifest) -> Result<()> {
    if version_tuple(env!("CARGO_PKG_VERSION")) < version_tuple(&manifest.min_launcher_version) {
        return Err(GameError::LauncherOutdated);
    }
    Ok(())
}

async fn fetch(http: &reqwest::Client, channel: &str) -> Result<(Vec<u8>, String)> {
    if let Some(dir) = std::env::var_os(LOCAL_OVERRIDE_ENV) {
        let dir = Path::new(&dir);
        let bytes = tokio::fs::read(dir.join("manifest.json")).await?;
        let signature = tokio::fs::read_to_string(dir.join("manifest.json.sig")).await?;
        return Ok((bytes, signature));
    }
    let url = format!("{CDN}/{channel}/manifest.json");
    let bytes = http.get(&url).send().await?.error_for_status()?.bytes().await?.to_vec();
    let signature = http.get(format!("{url}.sig")).send().await?.error_for_status()?.text().await?;
    Ok((bytes, signature))
}

/// Paquets de mise à jour du launcher pour `channel` : le canal bêta se replie sur prod tant qu'il
/// n'a pas publié de version.
pub fn update_endpoints(channel: &str) -> Vec<String> {
    let mut channels = vec![PROD];
    if channel == BETA {
        channels.insert(0, BETA);
    }
    channels.into_iter().map(|channel| format!("{CDN}/{channel}/latest.json")).collect()
}

fn verify(bytes: &[u8], signature: &str) -> Result<Manifest> {
    verify_with(&public_key(), bytes, signature)
}

fn public_key() -> VerifyingKey {
    let bytes: [u8; 32] = STANDARD
        .decode(MANIFEST_PUBLIC_KEY)
        .expect("clé publique en base64")
        .try_into()
        .expect("clé publique de 32 octets");
    VerifyingKey::from_bytes(&bytes).expect("clé publique ed25519 valide")
}

fn verify_with(key: &VerifyingKey, bytes: &[u8], signature: &str) -> Result<Manifest> {
    let signature: [u8; 64] = STANDARD
        .decode(signature.trim())
        .ok()
        .and_then(|raw| raw.try_into().ok())
        .ok_or(GameError::ManifestSignature)?;
    key.verify_strict(bytes, &Signature::from_bytes(&signature))
        .map_err(|_| GameError::ManifestSignature)?;
    let manifest: Manifest = serde_json::from_slice(bytes)?;
    if manifest.schema != SUPPORTED_SCHEMA {
        return Err(GameError::LauncherOutdated);
    }
    Ok(manifest)
}

/// Un cache absent, illisible ou dont la signature ne correspond plus est simplement ignoré.
async fn read_cached(dir: &Path) -> Option<Manifest> {
    let bytes = tokio::fs::read(dir.join("manifest.json")).await.ok()?;
    let signature = tokio::fs::read_to_string(dir.join("manifest.json.sig")).await.ok()?;
    verify(&bytes, &signature).ok()
}

async fn write_cache(dir: &Path, bytes: &[u8], signature: &str) -> Result<()> {
    tokio::fs::create_dir_all(dir).await?;
    tokio::fs::write(dir.join("manifest.json"), bytes).await?;
    tokio::fs::write(dir.join("manifest.json.sig"), signature).await?;
    Ok(())
}

/// `1.2.3` → (1, 2, 3) ; un suffixe (`-beta.1`) est ignoré.
fn version_tuple(version: &str) -> (u64, u64, u64) {
    let mut parts = version
        .split(['-', '+'])
        .next()
        .unwrap_or_default()
        .split('.')
        .map(|part| part.parse().unwrap_or(0));
    (parts.next().unwrap_or(0), parts.next().unwrap_or(0), parts.next().unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn beta_updates_fall_back_to_prod() {
        assert_eq!(update_endpoints(PROD), ["https://cdn.clovergames.fr/launcher/prod/latest.json"]);
        assert_eq!(update_endpoints(BETA), ["https://cdn.clovergames.fr/launcher/beta/latest.json", "https://cdn.clovergames.fr/launcher/prod/latest.json"]);
    }

    /// Réseau : sans manifeste bêta publié, le canal bêta reçoit celui de prod, en cache à part.
    #[tokio::test]
    #[ignore]
    async fn beta_channel_reads_prod_until_published() {
        let dir = std::env::temp_dir().join(format!("clover-channel-{}", rand::random::<u64>()));
        let http = crate::game::download::client();
        let prod = load(&http, &dir, PROD).await.unwrap();
        let beta = load(&http, &dir, BETA).await.unwrap();
        println!("prod n°{} beta n°{} testeurs {:?}", prod.serial, beta.serial, beta.beta_testers);
        assert_eq!(prod.serial, beta.serial);
        assert!(!dir.join(BETA).join("manifest.json").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    const MANIFEST: &str = r#"{
        "schema": 1, "serial": 10, "minLauncherVersion": "0.1.0",
        "minecraft": {"version": "26.2"}, "fabric": {"loader": "0.19.5"},
        "server": {"host": "play.clovergames.fr"},
        "modes": [{"id": "lobby", "name": "Lobby", "image": null},
                  {"id": "bedwars", "name": "BedWars", "image": null, "host": "bedwars.play.clovergames.fr"}],
        "mods": [
            {"id": "iris", "name": "Iris", "description": null, "body": "Des **shaders**.", "category": "visual", "default": false,
             "hidden": false, "available": true, "requires": ["sodium"],
             "file": {"filename": "iris.jar", "url": "https://x/iris.jar", "sha512": "00", "size": 1}},
            {"id": "sodium", "name": "Sodium", "description": null, "category": "performance", "default": true,
             "hidden": false, "available": true, "requires": [],
             "file": {"filename": "sodium.jar", "url": "https://x/sodium.jar", "sha512": "00", "size": 1}},
            {"id": "fabric-api", "name": "Fabric API", "description": null, "category": null, "default": false,
             "hidden": true, "available": true, "requires": [],
             "file": {"filename": "fabric-api.jar", "url": "https://x/fabric-api.jar", "sha512": "00", "size": 1}},
            {"id": "betterf3", "name": "BetterF3", "description": null, "category": "comfort", "default": true,
             "hidden": false, "available": false, "requires": [], "file": null}
        ]
    }"#;

    fn signed(key: &SigningKey, bytes: &[u8]) -> String {
        STANDARD.encode(key.sign(bytes).to_bytes())
    }

    #[test]
    fn accepts_a_correctly_signed_manifest() {
        let key = SigningKey::from_bytes(&[7; 32]);
        let signature = signed(&key, MANIFEST.as_bytes());
        let manifest = verify_with(&key.verifying_key(), MANIFEST.as_bytes(), &signature).unwrap();
        assert_eq!(manifest.minecraft.version, "26.2");
        assert_eq!(manifest.mods[0].body.as_deref(), Some("Des **shaders**."));
        assert!(manifest.mods[1].body.is_none());
    }

    #[test]
    fn rejects_tampering_and_foreign_keys() {
        let key = SigningKey::from_bytes(&[7; 32]);
        let signature = signed(&key, MANIFEST.as_bytes());
        let tampered = MANIFEST.replace("26.2", "26.4");
        assert!(matches!(
            verify_with(&key.verifying_key(), tampered.as_bytes(), &signature),
            Err(GameError::ManifestSignature)
        ));
        let other = SigningKey::from_bytes(&[8; 32]);
        assert!(verify_with(&other.verifying_key(), MANIFEST.as_bytes(), &signature).is_err());
        assert!(verify_with(&key.verifying_key(), MANIFEST.as_bytes(), "pas-une-signature").is_err());
    }

    #[test]
    fn embedded_public_key_is_valid() {
        public_key();
    }

    #[test]
    fn installs_enabled_mods_with_their_dependencies_only() {
        let manifest: Manifest = serde_json::from_str(MANIFEST).unwrap();
        assert_eq!(manifest.default_mods(), HashSet::from(["sodium".to_owned()]));

        let enabled = HashSet::from(["iris".to_owned(), "betterf3".to_owned()]);
        let mut ids: Vec<&str> = manifest.mods_to_install(&enabled).iter().map(|m| m.id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, ["iris", "sodium"]);
    }

    #[test]
    fn search_recognizes_clover_defaults_and_selected_dependencies_by_slug() {
        let mut manifest: Manifest = serde_json::from_str(MANIFEST).unwrap();
        manifest.mods[1].requires.push("fabric-api".into());
        let hits = ["sodium", "iris", "fabric-api", "betterf3", "other"].map(|slug| serde_json::json!({
            "project_id": format!("id-{slug}"), "slug": slug, "title": slug,
            "description": "", "author": "a", "icon_url": null, "downloads": 1
        }));
        let mut page: super::super::modrinth::SearchPage = serde_json::from_value(serde_json::json!({"hits": hits, "total_hits": 5})).unwrap();
        page.mark_provided(&manifest.mods_to_install(&manifest.default_mods()));
        assert_eq!(page.hits.iter().map(|hit| hit.provided_by_clover).collect::<Vec<_>>(), [true, false, true, false, false]);
        assert_eq!(serde_json::to_value(&page).unwrap()["hits"][0]["providedByClover"], true);

        page.mark_provided(&manifest.mods_to_install(&HashSet::new()));
        assert!(page.hits.iter().all(|hit| !hit.provided_by_clover));
        page.mark_provided(&manifest.mods_to_install(&HashSet::from(["iris".into()])));
        assert_eq!(page.hits.iter().map(|hit| hit.provided_by_clover).collect::<Vec<_>>(), [true, true, true, false, false]);
    }

    #[test]
    fn joins_a_mode_only_when_the_manifest_gives_its_address() {
        let manifest: Manifest = serde_json::from_str(MANIFEST).unwrap();
        assert_eq!(manifest.server_for(None), Some("play.clovergames.fr"));
        assert_eq!(manifest.server_for(Some("bedwars")), Some("bedwars.play.clovergames.fr"));
        assert_eq!(manifest.server_for(Some("lobby")), None);
        assert_eq!(manifest.server_for(Some("inconnu")), None);
    }

    #[test]
    fn compares_launcher_versions() {
        assert!(version_tuple("0.10.0") > version_tuple("0.9.9"));
        assert!(version_tuple("1.0.0-beta.1") == version_tuple("1.0.0"));
        assert!(version_tuple("0.1.0") < version_tuple("0.2"));
    }
}
