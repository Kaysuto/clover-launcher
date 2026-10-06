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
    pub image: Option<String>,
    pub url: String,
    pub published_at: String,
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

pub async fn feed() -> Feed {
    let http = download::client();
    let site = std::env::var(SITE_OVERRIDE_ENV).unwrap_or_else(|_| SITE_URL.to_owned());
    let (news, modes, votes) = tokio::join!(
        get::<NewsResponse>(&http, &site, "news"),
        get::<StatusResponse>(&http, &site, "status"),
        get::<VotesResponse>(&http, &site, "votes"),
    );
    Feed {
        // Les liens s'ouvrent dans le navigateur et les images se chargent dans l'interface :
        // seules les adresses https sont gardées.
        news: news.map(|response| {
            response
                .items
                .into_iter()
                .filter(|item| is_https(&item.url))
                .map(|item| NewsItem { image: item.image.filter(|image| is_https(image)), ..item })
                .collect()
        }),
        maintenance: modes.as_ref().map(|response| response.maintenance),
        modes: modes.map(|response| response.servers),
        votes: votes.map(|response| response.votes),
    }
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
