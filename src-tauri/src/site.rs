//! Contenu publié par le site pour l'accueil : actualités, joueurs par mode, maintenance, derniers
//! votes (`/api/launcher/*` de clovergames.fr). Chaque partie est facultative : une route qui ne répond
//! pas laisse la sienne vide, l'interface garde alors ce qu'elle affichait.

use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::game::download;

const SITE_URL: &str = "https://clovergames.fr";
/// Adresse du site à la place de clovergames.fr (développement, ex. `http://localhost:3000`).
const SITE_OVERRIDE_ENV: &str = "CLOVER_SITE_URL";
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub title: String,
    pub excerpt: String,
    /// Catégorie du blog (« Annonce », « Mise à jour »…).
    #[serde(default)]
    pub category: Option<String>,
    /// Article lisible dans le launcher (`blog_article`) ; absent avant le site du 2026-10-06.
    #[serde(default)]
    pub slug: Option<String>,
    pub image: Option<String>,
    pub url: String,
    pub published_at: String,
}

/// Annonce officielle de Minecraft (`/api/launcher/minecraft-news`), en anglais ou traduite par le site.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftItem {
    pub id: String,
    /// `release`, `snapshot` ou `news`.
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub image: Option<String>,
    /// Article sur minecraft.net (en anglais) ; `None` pour une note de version, lue dans le launcher.
    pub url: Option<String>,
    pub published_at: String,
    /// Note complète lisible dans le launcher (`minecraft_article`).
    pub readable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MinecraftNews {
    /// `false` : annonces en anglais, comme Mojang les publie.
    pub translated: bool,
    pub items: Vec<MinecraftItem>,
}

/// Page Actualités : blog de Clover Games et annonces de Minecraft ; `None` si le site ne répond pas.
#[derive(Debug, Serialize)]
pub struct NewsPage {
    pub blog: Option<Vec<NewsItem>>,
    pub minecraft: Option<MinecraftNews>,
}

/// Note de version complète ; `html` déjà réduit par le site (filtré une seconde fois par
/// l'interface).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftArticle {
    pub id: String,
    pub title: String,
    pub html: String,
    pub published_at: String,
    pub image: Option<String>,
}

/// `online`/`players` à `None` : l'échantillon du site est trop ancien pour être affirmé.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeStatus {
    pub id: String,
    pub online: Option<bool>,
    pub players: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentVote {
    pub player: String,
    pub voted_at: String,
}

#[derive(Debug, Serialize)]
pub struct Feed {
    pub news: Option<Vec<NewsItem>>,
    pub modes: Option<Vec<ModeStatus>>,
    /// Maintenance annoncée par l'équipe sur le site (bandeau de l'accueil).
    pub maintenance: Option<bool>,
    pub votes: Option<Vec<RecentVote>>,
}

#[derive(Deserialize)]
struct NewsResponse {
    items: Vec<NewsItem>,
}

#[derive(Deserialize)]
struct StatusResponse {
    #[serde(default)]
    maintenance: bool,
    servers: Vec<ModeStatus>,
}

#[derive(Deserialize)]
struct VotesResponse {
    votes: Vec<RecentVote>,
}

/// Adresse du site (clovergames.fr, ou `CLOVER_SITE_URL` en développement).
pub fn base() -> String {
    std::env::var(SITE_OVERRIDE_ENV).unwrap_or_else(|_| SITE_URL.to_owned())
}

pub async fn feed() -> Feed {
    let http = download::client();
    let site = base();
    let (news, modes, votes) = tokio::join!(
        get::<NewsResponse>(&http, &site, "news"),
        get::<StatusResponse>(&http, &site, "status"),
        get::<VotesResponse>(&http, &site, "votes"),
    );
    Feed {
        // Les liens s'ouvrent dans le navigateur et les images se chargent dans l'interface :
        // seules les adresses https sont gardées.
        news: news.map(|response| https_news(response.items)),
        maintenance: modes.as_ref().map(|response| response.maintenance),
        modes: modes.map(|response| response.servers),
        votes: votes.map(|response| response.votes),
    }
}

/// Articles du blog sans adresse https retirés, images non https effacées.
fn https_news(items: Vec<NewsItem>) -> Vec<NewsItem> {
    items.into_iter().filter(|item| is_https(&item.url)).map(|item| NewsItem { image: item.image.filter(|image| is_https(image)), ..item }).collect()
}

/// Blog (30 articles) et annonces de Minecraft, lus ensemble.
pub async fn news_page() -> NewsPage {
    let http = download::client();
    let site = base();
    let (blog, minecraft) = tokio::join!(get::<NewsResponse>(&http, &site, "news?limit=30"), get::<MinecraftNews>(&http, &site, "minecraft-news"));
    NewsPage {
        blog: blog.map(|response| https_news(response.items)),
        minecraft: minecraft.map(|mut news| {
            news.items.retain(|item| item.url.as_deref().is_none_or(is_https) && is_identifier(&item.id));
            for item in &mut news.items {
                item.image = item.image.take().filter(|image| is_https(image));
            }
            news
        }),
    }
}

/// Identifiant de note de Mojang : 64 caractères hexadécimaux.
fn is_identifier(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|c| c.is_ascii_hexdigit())
}

/// Article du blog lisible dans le launcher, HTML préparé par le site.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlogArticle {
    pub slug: String,
    pub title: String,
    pub category: Option<String>,
    pub image: Option<String>,
    pub author: Option<String>,
    pub published_at: String,
    pub url: String,
    pub html: String,
}

/// Slug d'article du blog : minuscules, chiffres et tirets.
fn is_slug(slug: &str) -> bool {
    !slug.is_empty() && slug.len() <= 200 && slug.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

/// Article du blog, lu dans le launcher sans ouvrir le site.
pub async fn blog_article(slug: &str) -> Result<BlogArticle, String> {
    if !is_slug(slug) {
        return Err("Article introuvable.".into());
    }
    let response = download::client()
        .get(format!("{}/api/launcher/news/{slug}", base()))
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|_| "Site injoignable : réessaie dans un instant.".to_owned())?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("Article introuvable ou retiré du blog.".into()),
        _ => return Err("Article indisponible pour le moment.".into()),
    }
    let mut article: BlogArticle = response.json().await.map_err(|_| "Réponse du site illisible.".to_owned())?;
    article.image = article.image.filter(|image| is_https(image));
    if !is_https(&article.url) {
        article.url = format!("{SITE_URL}/blog/{slug}");
    }
    Ok(article)
}

/// Note de version complète, préparée par le site.
pub async fn minecraft_article(id: &str) -> Result<MinecraftArticle, String> {
    if !is_identifier(id) {
        return Err("Note de version introuvable.".into());
    }
    let response = download::client()
        .get(format!("{}/api/launcher/minecraft-news/{id}", base()))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(|_| "Site injoignable : réessaie dans un instant.".to_owned())?;
    match response.status().as_u16() {
        200 => {}
        404 => return Err("Note de version introuvable.".into()),
        _ => return Err("Note de version indisponible pour le moment : réessaie plus tard.".into()),
    }
    let mut article: MinecraftArticle = response.json().await.map_err(|_| "Réponse du site illisible.".to_owned())?;
    article.image = article.image.filter(|image| is_https(image));
    Ok(article)
}

async fn get<T: DeserializeOwned>(http: &reqwest::Client, site: &str, route: &str) -> Option<T> {
    let response = http
        .get(format!("{site}/api/launcher/{route}"))
        .timeout(TIMEOUT)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    response.json().await.ok()
}

fn is_https(url: &str) -> bool {
    url.starts_with("https://")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Routes réelles du site (`cargo test -- --ignored`).
    #[tokio::test]
    #[ignore]
    async fn reads_the_real_site() {
        let feed = feed().await;
        println!("{feed:?}");
        assert!(feed.news.is_some() && feed.modes.is_some() && feed.votes.is_some());
    }

    #[test]
    fn keeps_only_safe_minecraft_items() {
        let id = "8df071b98ac92911ae6caae35feb68506bca66894d16f41797164b9a9c6d1824";
        let news: MinecraftNews = serde_json::from_str(&format!(
            r#"{{"schema":1,"translated":true,"items":[
                {{"id":"{id}","kind":"snapshot","title":"Snapshot 3","summary":"Brr","image":"https://launchercontent.mojang.com/v2/images/a.jpg","url":null,"publishedAt":"2026-10-06T12:54:26.000Z","readable":true}},
                {{"id":"../x","kind":"news","title":"T","summary":"S","image":null,"url":"https://www.minecraft.net/article/x","publishedAt":"2026-09-26T12:00:00.000Z","readable":false}}
            ]}}"#
        ))
        .unwrap();
        assert!(news.translated);
        assert!(is_identifier(&news.items[0].id) && !is_identifier(&news.items[1].id));
        assert!(is_slug("pvpsoup-saison-1") && !is_slug("../x") && !is_slug("A") && !is_slug(""));
        assert_eq!(news.items[0].url, None);
    }

    #[test]
    fn reads_the_site_responses() {
        let news: NewsResponse = serde_json::from_str(
            r#"{"items":[{"title":"T","excerpt":"E","category":"Annonce","image":null,"url":"https://clovergames.fr/blog/t","publishedAt":"2026-08-22T13:00:00.000Z"}]}"#,
        )
        .unwrap();
        assert_eq!(news.items[0].published_at, "2026-08-22T13:00:00.000Z");

        let status: StatusResponse =
            serde_json::from_str(r#"{"servers":[{"id":"lobby","online":true,"players":3},{"id":"creatif","online":null,"players":null}]}"#)
                .unwrap();
        assert_eq!(status.servers[0].players, Some(3));
        assert_eq!(status.servers[1].online, None);

        let votes: VotesResponse = serde_json::from_str(r#"{"votes":[{"player":"Kaysuto","votedAt":"2026-09-30T08:06:20.544Z"}]}"#).unwrap();
        assert_eq!(votes.votes[0].player, "Kaysuto");
    }
}
