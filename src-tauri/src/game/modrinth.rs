//! API publique de Modrinth (https://docs.modrinth.com/api/) : recherche de mods, packs de
//! ressources, shaders, datapacks et modpacks, version compatible d'un projet, identification d'un
//! fichier par son empreinte, page d'un projet. Filtré sur la version de Minecraft de l'instance
//! (sauf les modpacks, qui créent la leur) et sur Fabric pour ce qui charge du code.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use url::Url;

use super::{GameError, Result};

const API: &str = "https://api.modrinth.com/v2";
const TIMEOUT: Duration = Duration::from_secs(10);
/// Résultats par page de recherche.
const PAGE: u32 = 20;

#[derive(Debug, Deserialize)]
pub struct Version {
    pub project_id: String,
    pub version_number: String,
    pub version_type: String,
    pub files: Vec<File>,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
}

impl Version {
    /// Fichier principal de la version (le `.jar` du mod).
    pub fn primary_file(&self) -> Option<&File> {
        self.files.iter().find(|file| file.primary).or(self.files.first())
    }
}

#[derive(Debug, Deserialize)]
pub struct File {
    pub url: String,
    pub filename: String,
    pub hashes: HashMap<String, String>,
    pub primary: bool,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub struct Dependency {
    pub project_id: Option<String>,
    pub version_id: Option<String>,
    pub dependency_type: String,
}

/// Mod trouvé par la recherche. Mêmes noms que le type `ModrinthHit` du front.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Hit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    /// Sélection du catalogue Clover, même avant le premier téléchargement du jeu.
    #[serde(default, skip_deserializing)]
    pub provided_by_clover: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct SearchPage {
    pub hits: Vec<Hit>,
    pub total_hits: u64,
}

impl SearchPage {
    pub fn mark_provided(&mut self, selected: &[&super::manifest::Mod]) {
        for hit in &mut self.hits {
            hit.provided_by_clover = selected.iter().any(|m| m.id == hit.slug && m.available && m.file.is_some());
        }
    }
}

/// Page d'un mod. Mêmes noms que le type `ModrinthProject` du front.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Project {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    /// Description complète en Markdown, telle que Modrinth la donne ; jamais envoyée au front.
    #[serde(default, skip_serializing)]
    body: String,
    /// La même, rendue en HTML nettoyé par `project` : seule forme que la page affiche.
    #[serde(skip_deserializing)]
    pub description_html: String,
    pub icon_url: Option<String>,
    /// Auteur tel que la recherche l'affiche ; absent si elle n'a pas répondu.
    #[serde(default)]
    pub author: Option<String>,
    pub downloads: u64,
    pub license: Option<License>,
    pub updated: String,
    pub source_url: Option<String>,
    pub issues_url: Option<String>,
    pub wiki_url: Option<String>,
    pub discord_url: Option<String>,
    /// Images mises en avant d'abord, puis dans l'ordre choisi par l'auteur.
    #[serde(default)]
    pub gallery: Vec<Image>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct License {
    pub id: String,
    pub name: String,
}

/// `url` est une miniature (350 px de large), `raw_url` l'image d'origine.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase"))]
pub struct Image {
    pub url: String,
    pub raw_url: Option<String>,
    pub title: Option<String>,
    #[serde(default, skip_serializing)]
    featured: bool,
    #[serde(default, skip_serializing)]
    ordering: i64,
}

/// Type de projet cherché ; mêmes noms que le type `ModrinthKind` du front.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Mod,
    Resourcepack,
    Shader,
    Datapack,
    Modpack,
}

impl Kind {
    /// « Loader » Modrinth des fichiers voulus : celui qui sait les charger.
    pub fn loader(self) -> &'static str {
        match self {
            Kind::Mod | Kind::Modpack => "fabric",
            Kind::Resourcepack => "minecraft",
            Kind::Shader => "iris",
            Kind::Datapack => "datapack",
        }
    }

    /// `loader` : nom Modrinth du loader de l'instance, pour les mods.
    fn facets(self, minecraft: &str, loader: &str) -> serde_json::Value {
        let version = format!("versions:{minecraft}");
        match self {
            // Utiles côté client et sans rien exiger du serveur.
            Kind::Mod => serde_json::json!([
                ["project_type:mod"],
                [format!("categories:{loader}")],
                [version],
                ["client_side:required", "client_side:optional"],
                ["server_side:optional", "server_side:unsupported"],
            ]),
            Kind::Resourcepack => serde_json::json!([["project_type:resourcepack"], [version]]),
            Kind::Shader => serde_json::json!([["project_type:shader"], ["categories:iris"], [version]]),
            Kind::Datapack => serde_json::json!([["project_type:datapack"], [version]]),
            Kind::Modpack => serde_json::json!([["project_type:modpack"], ["categories:fabric"]]),
        }
    }
}

fn endpoint(path: &str, params: &[(&str, &str)]) -> Result<Url> {
    Url::parse_with_params(&format!("{API}/{path}"), params).map_err(|e| GameError::InvalidVersion(e.to_string()))
}

/// Projets de type `kind` pour `minecraft`. Sans texte, Modrinth renvoie les plus téléchargés.
pub async fn search(http: &reqwest::Client, kind: Kind, query: &str, minecraft: &str, loader: &str, offset: u32) -> Result<SearchPage> {
    let facets = kind.facets(minecraft, loader);
    let index = if query.trim().is_empty() { "downloads" } else { "relevance" };
    let url = endpoint(
        "search",
        &[
            ("query", query.trim()),
            ("facets", &facets.to_string()),
            ("index", index),
            ("limit", &PAGE.to_string()),
            ("offset", &offset.to_string()),
        ],
    )?;
    let response = http
        .get(url)
        .timeout(TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json().await?)
}

/// Dernière version de `project` (identifiant ou slug) pour `loader` et `minecraft` (toutes
/// versions sans lui), stable de préférence.
pub async fn compatible_version(http: &reqwest::Client, project: &str, loader: &str, minecraft: Option<&str>) -> Result<Option<Version>> {
    if !valid_project(project) {
        return Err(GameError::InvalidVersion(format!("projet Modrinth « {project} »")));
    }
    let loaders = serde_json::json!([loader]).to_string();
    let game_versions = serde_json::json!([minecraft]).to_string();
    let mut params = vec![("loaders", loaders.as_str())];
    if minecraft.is_some() {
        params.push(("game_versions", &game_versions));
    }
    let url = endpoint(&format!("project/{project}/version"), &params)?;
    let response = http
        .get(url)
        .timeout(TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    let mut versions: Vec<Version> = response.json().await?;
    let stable = versions.iter().position(|version| version.version_type == "release").unwrap_or(0);
    Ok((!versions.is_empty()).then(|| versions.swap_remove(stable)))
}

/// Page d'un mod, par identifiant ou slug. L'auteur vient de la recherche, comme dans la liste
/// de résultats (les rôles d'équipe sont libres et ne désignent pas toujours un propriétaire) ;
/// il est facultatif : sans lui, la page s'affiche quand même.
pub async fn project(http: &reqwest::Client, project: &str) -> Result<Project> {
    if !valid_project(project) {
        return Err(GameError::InvalidVersion(format!("projet Modrinth « {project} »")));
    }
    let response = http.get(format!("{API}/project/{project}")).timeout(TIMEOUT).send().await?.error_for_status()?;
    let mut page: Project = response.json().await?;
    page.gallery.sort_by_key(|image| (!image.featured, image.ordering));
    page.description_html = description_html(&page.body);
    page.author = author(http, &page.id).await;
    Ok(page)
}

/// Markdown de Modrinth (HTML brut permis) en HTML sûr : la page l'insère tel quel dans la
/// fenêtre du launcher, qui a accès aux commandes Tauri. Pas de script, de style, de formulaire
/// ni d'attribut d'événement ; liens et images relatifs ramenés sur modrinth.com.
pub fn description_html(markdown: &str) -> String {
    use pulldown_cmark::{html, Options, Parser};
    let mut raw = String::new();
    html::push_html(&mut raw, Parser::new_ext(markdown, Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH));
    ammonia::Builder::default()
        .url_relative(ammonia::UrlRelative::RewriteWithBase(Url::parse("https://modrinth.com/").expect("URL valide")))
        .set_tag_attribute_value("img", "loading", "lazy")
        .clean(&raw)
        .to_string()
}

async fn author(http: &reqwest::Client, project_id: &str) -> Option<String> {
    let facets = serde_json::json!([[format!("project_id:{project_id}")]]).to_string();
    let url = endpoint("search", &[("facets", &facets)]).ok()?;
    let response = http.get(url).timeout(TIMEOUT).send().await.ok()?.error_for_status().ok()?;
    let page: SearchPage = response.json().await.ok()?;
    page.hits.into_iter().next().map(|hit| hit.author)
}

/// Identifiant ou slug Modrinth, qui ne doit jamais sortir de `/project/` une fois dans l'URL.
fn valid_project(project: &str) -> bool {
    (1..=64).contains(&project.len())
        && !project.starts_with('.')
        && project.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Nom et logo d'un projet, pour « Mes mods » et les packs des instances.
#[derive(Debug, Clone, Deserialize)]
pub struct Summary {
    pub id: String,
    #[serde(default)]
    pub slug: String,
    pub title: String,
    pub icon_url: Option<String>,
}

/// Noms et logos de plusieurs projets en une requête, par identifiant.
pub async fn projects(http: &reqwest::Client, ids: &[String]) -> Result<HashMap<String, Summary>> {
    let url = endpoint("projects", &[("ids", &serde_json::to_string(ids).expect("liste sérialisable"))])?;
    let response = http.get(url).timeout(TIMEOUT).send().await?.error_for_status()?;
    let list: Vec<Summary> = response.json().await?;
    Ok(list.into_iter().map(|summary| (summary.id.clone(), summary)).collect())
}

/// Projet d'une version précise (dépendance qui ne donne que `version_id`).
pub async fn version_project(http: &reqwest::Client, version_id: &str) -> Result<String> {
    let response = http.get(format!("{API}/version/{version_id}")).timeout(TIMEOUT).send().await?.error_for_status()?;
    Ok(response.json::<Version>().await?.project_id)
}

/// Versions correspondant à ces fichiers (empreintes SHA-512) ; les fichiers inconnus de
/// Modrinth sont absents du résultat.
pub async fn identify(http: &reqwest::Client, hashes: Vec<String>) -> Result<HashMap<String, Version>> {
    #[derive(Serialize)]
    struct Query {
        hashes: Vec<String>,
        algorithm: &'static str,
    }
    let response = http
        .post(format!("{API}/version_files"))
        .json(&Query { hashes, algorithm: "sha512" })
        .timeout(TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json().await?)
}

/// Dernière version Fabric pour `minecraft` de chaque fichier connu de Modrinth, par empreinte.
pub async fn updates(http: &reqwest::Client, hashes: Vec<String>, minecraft: &str, loader: &str) -> Result<HashMap<String, Version>> {
    #[derive(Serialize)]
    struct Query<'a> {
        hashes: Vec<String>,
        algorithm: &'static str,
        loaders: [&'a str; 1],
        game_versions: [&'a str; 1],
    }
    let query = Query { hashes, algorithm: "sha512", loaders: [loader], game_versions: [minecraft] };
    let response = http
        .post(format!("{API}/version_files/update"))
        .json(&query)
        .timeout(TIMEOUT)
        .send()
        .await?
        .error_for_status()?;
    Ok(response.json().await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_ids_stay_inside_the_api() {
        assert!(valid_project("sodium"));
        assert!(valid_project("AANobbMI"));
        assert!(valid_project("ferrite-core"));
        assert!(!valid_project(""));
        assert!(!valid_project(".."));
        assert!(!valid_project("sodium/version"));
        assert!(!valid_project("sodium?x=1"));
    }

    /// Réseau : lit la page de Sodium, auteur et galerie compris.
    #[tokio::test]
    #[ignore]
    async fn reads_a_real_project_page() {
        let page = project(&reqwest::Client::new(), "sodium").await.unwrap();
        assert_eq!(page.id, "AANobbMI");
        assert!(page.author.is_some());
        assert!(!page.gallery.is_empty());
        assert!(page.description_html.contains("<p>"));
    }

    #[test]
    fn description_keeps_formatting_but_no_active_content() {
        let html = description_html(concat!(
            "## Fonctions\n\n**Rapide** et [wiki](/mod/sodium/wiki).\n\n",
            "<p align=\"center\" style=\"position:fixed\"><img src=\"x.png\" onerror=\"alert(1)\"></p>\n\n",
            "<script>alert(1)</script><a href=\"javascript:alert(1)\">lien</a><form><input></form>",
        ));
        assert!(html.contains("<h2>Fonctions</h2>"));
        assert!(html.contains("<strong>Rapide</strong>"));
        assert!(html.contains(r#"href="https://modrinth.com/mod/sodium/wiki""#));
        assert!(html.contains(r#"src="https://modrinth.com/x.png""#));
        assert!(html.contains(r#"loading="lazy""#));
        for banned in ["<script", "alert", "style=", "javascript:", "<form", "<input"] {
            assert!(!html.contains(banned), "{banned} dans {html}");
        }
    }

    #[test]
    fn gallery_puts_featured_first() {
        let json = r#"{"id":"AANobbMI","slug":"sodium","title":"Sodium","description":"d","icon_url":null,"downloads":1,
            "body":"Sodium **rapide**","license":{"id":"LicenseRef-Polyform-Shield-1.0.0","name":"","url":null},"updated":"2026-09-01T00:00:00Z",
            "source_url":null,"issues_url":null,"wiki_url":null,"discord_url":null,
            "gallery":[{"url":"b","title":null,"featured":false,"ordering":0},{"url":"a","title":"Vue","featured":true,"ordering":5}]}"#;
        let mut page: Project = serde_json::from_str(json).unwrap();
        page.gallery.sort_by_key(|image| (!image.featured, image.ordering));
        assert_eq!(page.gallery[0].url, "a");
        let out = serde_json::to_value(&page).unwrap();
        assert_eq!(out["iconUrl"], serde_json::Value::Null);
        assert!(out["gallery"][0].get("featured").is_none());
        assert!(out.get("body").is_none());
        assert_eq!(out["gallery"][0]["rawUrl"], serde_json::Value::Null);
    }
}
