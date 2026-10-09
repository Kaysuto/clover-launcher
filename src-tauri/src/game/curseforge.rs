//! Modpacks CurseForge importés depuis le `.zip` exporté par l'application CurseForge :
//! `manifest.json` (version de Minecraft, loader, fichiers du pack par identifiant CurseForge),
//! `modlist.html` (nom et page de chacun de ces fichiers) et dossier de fichiers inclus (`overrides`).
//!
//! Sans clé de l'API CurseForge, les fichiers listés ne se téléchargent pas depuis CurseForge. Mods,
//! packs de ressources et shaders sont cherchés sur Modrinth sous le même identifiant de page (slug),
//! à condition que le nom concorde, dans leur version compatible ; les autres sont rendus au joueur
//! avec leur page CurseForge, à ajouter à la main.

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::modrinth::{self, Kind};
use super::{GameError, Result};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub name: String,
    minecraft: Minecraft,
    #[serde(default = "default_overrides")]
    pub overrides: String,
    #[serde(default)]
    files: Vec<PackFile>,
}

fn default_overrides() -> String {
    "overrides".into()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Minecraft {
    version: String,
    #[serde(default)]
    mod_loaders: Vec<Loader>,
}

#[derive(Debug, Deserialize)]
struct Loader {
    /// « fabric-0.16.10 », « forge-47.2.0 », « neoforge-21.1.77 ».
    id: String,
    #[serde(default)]
    primary: bool,
}

#[derive(Debug, Deserialize)]
struct PackFile {
    #[serde(rename = "projectID")]
    project_id: u64,
    #[serde(default = "required")]
    required: bool,
}

fn required() -> bool {
    true
}

impl Manifest {
    /// Version de Minecraft et de Fabric demandées ; les autres loaders ne sont pas pris en charge.
    pub fn versions(&self) -> Result<(String, String)> {
        let loader = self.minecraft.mod_loaders.iter().find(|loader| loader.primary).or(self.minecraft.mod_loaders.first());
        let Some(loader) = loader else { return Err(GameError::InvalidVersion("modpack sans loader".into())) };
        match loader.id.split_once('-') {
            Some(("fabric", version)) if !version.is_empty() => Ok((self.minecraft.version.clone(), version.to_owned())),
            Some((other, _)) => Err(GameError::InvalidVersion(format!("ce modpack demande {}, seul Fabric est pris en charge", loader_name(other)))),
            None => Err(GameError::InvalidVersion(format!("loader inconnu « {} »", loader.id))),
        }
    }

    /// Pages des fichiers obligatoires, quand le pack n'a pas de `modlist.html`.
    fn pages(&self) -> Vec<Entry> {
        self.files
            .iter()
            .filter(|file| file.required)
            .map(|file| Entry { name: format!("Projet CurseForge n° {}", file.project_id), url: format!("https://www.curseforge.com/projects/{}", file.project_id) })
            .collect()
    }
}

fn loader_name(id: &str) -> &str {
    match id {
        "forge" => "Forge",
        "neoforge" => "NeoForge",
        "quilt" => "Quilt",
        other => other,
    }
}

/// Fichier du pack, d'après `modlist.html` : son nom et sa page CurseForge.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Entry {
    pub name: String,
    pub url: String,
}

impl Entry {
    /// Type de contenu et identifiant de page, pour une page de mod, de pack de ressources ou de shader.
    fn target(&self) -> Option<(Kind, &str)> {
        let path = self.url.strip_prefix("https://www.curseforge.com/minecraft/")?;
        let (category, slug) = path.trim_end_matches('/').split_once('/')?;
        let kind = match category {
            "mc-mods" => Kind::Mod,
            "texture-packs" => Kind::Resourcepack,
            "shaders" => Kind::Shader,
            _ => return None,
        };
        let valid = !slug.is_empty() && slug.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'));
        valid.then_some((kind, slug))
    }
}

/// Entrées de `modlist.html` : `<li><a href="https://www.curseforge.com/minecraft/mc-mods/x">Nom (by auteur)</a></li>`.
pub fn modlist(html: &str) -> Vec<Entry> {
    html.split("<a href=\"")
        .skip(1)
        .filter_map(|part| {
            let (url, rest) = part.split_once('"')?;
            let label = rest.split_once('>')?.1.split_once("</a>")?.0;
            let name = unescape(label.rsplit_once(" (by ").map_or(label, |(name, _)| name)).trim().to_owned();
            (url.starts_with("https://www.curseforge.com/") && !name.is_empty()).then(|| Entry { name, url: unescape(url) })
        })
        .collect()
}

fn unescape(text: &str) -> String {
    text.replace("&quot;", "\"").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}

/// Lettres et chiffres en minuscules : « Just Enough Items (JEI) » → « justenoughitemsjei ».
fn simplified(name: &str) -> String {
    name.chars().filter(char::is_ascii_alphanumeric).map(|c| c.to_ascii_lowercase()).collect()
}

/// Le projet Modrinth `title` est bien celui de CurseForge nommé `name` : l'un contient l'autre.
fn same_project(name: &str, title: &str) -> bool {
    let (name, title) = (simplified(name), simplified(title));
    !name.is_empty() && !title.is_empty() && (name.contains(&title) || title.contains(&name))
}

/// Lit `manifest.json` et `modlist.html` d'une archive CurseForge ; `None` si ce n'en est pas une.
pub fn read(archive: &Path) -> Result<Option<(Manifest, Vec<Entry>)>> {
    use std::io::Read;
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?).map_err(|e| GameError::Corrupted(e.to_string()))?;
    let mut text = String::new();
    match zip.by_name("manifest.json") {
        Ok(file) => file.take(1024 * 1024).read_to_string(&mut text)?,
        Err(_) => return Ok(None),
    };
    let manifest: Manifest = serde_json::from_str(&text)?;
    let mut html = String::new();
    let entries = match zip.by_name("modlist.html") {
        Ok(file) => {
            file.take(4 * 1024 * 1024).read_to_string(&mut html)?;
            modlist(&html)
        }
        Err(_) => manifest.pages(),
    };
    Ok(Some((manifest, entries)))
}

/// Installe depuis Modrinth les entrées qui s'y trouvent (mods dans `mods`, packs de ressources et
/// shaders dans le dossier de jeu `game`) ; renvoie celles à ajouter à la main.
pub async fn install(http: &reqwest::Client, entries: &[Entry], minecraft: &str, game: &Path, mods: &Path, on_progress: &(dyn Fn(usize, usize) + Sync)) -> Result<Vec<Entry>> {
    let slugs: Vec<String> = entries.iter().filter_map(|entry| entry.target().map(|(_, slug)| slug.to_owned())).collect();
    let titles: HashMap<String, String> = if slugs.is_empty() {
        HashMap::new()
    } else {
        modrinth::projects(http, &slugs).await?.into_values().map(|summary| (summary.slug, summary.title)).collect()
    };
    let mut missing = Vec::new();
    for (done, entry) in entries.iter().enumerate() {
        on_progress(done, entries.len());
        let found = entry.target().filter(|(_, slug)| titles.get(*slug).is_some_and(|title| same_project(&entry.name, title)));
        let installed = match found {
            Some((Kind::Mod, slug)) => super::personal::install(http, mods, slug, minecraft, super::personal::ModLoader::Fabric, &[]).await.map(drop),
            Some((kind, slug)) => {
                let folder = if kind == Kind::Shader { "shaderpacks" } else { "resourcepacks" };
                super::content::install_archive(http, &game.join(folder), kind, slug, minecraft).await.map(drop)
            }
            None => Err(GameError::NoUpdate),
        };
        match installed {
            Ok(()) => {}
            // Introuvable ou sans version pour cette version de Minecraft : à ajouter à la main.
            Err(GameError::NoUpdate) => missing.push(entry.clone()),
            Err(error) => return Err(error),
        }
    }
    on_progress(entries.len(), entries.len());
    Ok(missing)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MODLIST: &str = "\u{feff}<ul>\n<li><a href=\"https://www.curseforge.com/minecraft/mc-mods/fabric-api\">Fabric API (by modmuss50)</a></li>\n<li><a href=\"https://www.curseforge.com/minecraft/mc-mods/jei\">Just Enough Items (JEI) (by mezz)</a></li>\n<li><a href=\"https://www.curseforge.com/minecraft/texture-packs/faithful-32x\">Faithful 32x (by Faithful &amp; co)</a></li>\n<li><a href=\"https://www.curseforge.com/minecraft/customization/a-world\">A World (by x)</a></li>\n</ul>";

    #[test]
    fn reads_the_modlist() {
        let entries = modlist(MODLIST);
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0], Entry { name: "Fabric API".into(), url: "https://www.curseforge.com/minecraft/mc-mods/fabric-api".into() });
        assert_eq!(entries[1].name, "Just Enough Items (JEI)");
        assert_eq!(entries[2].name, "Faithful 32x");
        assert_eq!(entries[0].target().map(|(kind, slug)| (kind == Kind::Mod, slug)), Some((true, "fabric-api")));
        assert!(entries[2].target().is_some_and(|(kind, _)| kind == Kind::Resourcepack));
        assert!(entries[3].target().is_none());
        assert!(Entry { name: "x".into(), url: "https://www.curseforge.com/minecraft/mc-mods/../x".into() }.target().is_none());
    }

    #[test]
    fn matches_projects_by_name() {
        assert!(same_project("Just Enough Items (JEI)", "Just Enough Items"));
        assert!(same_project("Fabric API", "Fabric API"));
        assert!(!same_project("Create", "Sodium"));
        assert!(!same_project("!!", "Sodium"));
    }

    #[test]
    fn accepts_fabric_packs_only() {
        let pack = |loader: &str| -> Manifest {
            serde_json::from_str(&format!(r#"{{"name":"P","minecraft":{{"version":"1.20.4","modLoaders":[{{"id":"{loader}","primary":true}}]}},"files":[{{"projectID":306612,"fileID":1,"required":true}}]}}"#)).unwrap()
        };
        assert_eq!(pack("fabric-0.19.5").versions().unwrap(), ("1.20.4".into(), "0.19.5".into()));
        assert_eq!(pack("fabric-0.19.5").overrides, "overrides");
        assert!(pack("forge-47.2.0").versions().unwrap_err().to_string().contains("Forge"));
        assert!(pack("neoforge-21.1.77").versions().unwrap_err().to_string().contains("NeoForge"));
        assert_eq!(pack("fabric-0.19.5").pages(), [Entry { name: "Projet CurseForge n° 306612".into(), url: "https://www.curseforge.com/projects/306612".into() }]);
    }

    /// Réseau : export CurseForge Fabric 1.20.4 (un mod inclus, Fabric API et un mod inconnu de
    /// Modrinth listés), posé dans un dossier temporaire.
    #[tokio::test]
    #[ignore = "réseau"]
    async fn imports_a_curseforge_export() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("clover-curseforge-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let archive = dir.join("pack.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&archive).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(br#"{"minecraft":{"version":"1.20.4","modLoaders":[{"id":"fabric-0.19.5","primary":true}]},"manifestType":"minecraftModpack","name":"Arcanis","overrides":"overrides","files":[{"projectID":306612,"fileID":6674317,"required":true}]}"#).unwrap();
        zip.start_file("modlist.html", options).unwrap();
        zip.write_all(b"<ul>\n<li><a href=\"https://www.curseforge.com/minecraft/mc-mods/fabric-api\">Fabric API (by modmuss50)</a></li>\n<li><a href=\"https://www.curseforge.com/minecraft/mc-mods/clover-introuvable-xyz\">Introuvable (by x)</a></li>\n</ul>").unwrap();
        zip.start_file("overrides/mods/Arcanis.jar", options).unwrap();
        zip.write_all(b"jar").unwrap();
        zip.start_file("overrides/config/arcanis.json", options).unwrap();
        zip.write_all(b"{}").unwrap();
        zip.finish().unwrap();

        let (manifest, entries) = read(&archive).unwrap().unwrap();
        let (minecraft, _) = manifest.versions().unwrap();
        let (game, mods) = (dir.join("game"), dir.join("mods"));
        super::super::content::copy_overrides(&archive, &[&manifest.overrides], &game, &mods).unwrap();
        let missing = install(&super::super::download::client(), &entries, &minecraft, &game, &mods, &|_, _| {}).await.unwrap();
        assert_eq!(missing.iter().map(|entry| entry.name.as_str()).collect::<Vec<_>>(), ["Introuvable"]);
        assert!(mods.join("Arcanis.jar").is_file());
        assert!(game.join("config/arcanis.json").is_file());
        let jars: Vec<String> = std::fs::read_dir(&mods).unwrap().map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned()).collect();
        assert!(jars.iter().any(|name| name.starts_with("fabric-api")), "{jars:?}");
        let _ = std::fs::remove_dir_all(dir);
    }
}
