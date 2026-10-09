//! Journal du jeu publié sur mclo.gs (service d'Aternos), pour donner un lien au support plutôt
//! qu'un fichier : https://api.mclo.gs/#create-log

use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::{GameError, Result};

const API: &str = "https://api.mclo.gs/1/log";
/// Seule adresse acceptée en réponse : l'interface l'ouvre et la copie telle quelle.
const PAGE: &str = "https://mclo.gs/";
/// Limite du service, qui couperait lui-même au-delà : seule la fin du journal part.
const MAX_LINES: usize = 25_000;
const MAX_BYTES: usize = 10 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Serialize)]
struct Request<'a> {
    content: &'a str,
    /// Logiciel d'origine, affiché sur la page du journal.
    source: &'static str,
}

#[derive(Deserialize)]
struct Response {
    success: bool,
    url: Option<String>,
    error: Option<String>,
}

/// Publie `log` et renvoie l'adresse de sa page. `token` (jeton Minecraft) est retiré s'il y
/// figure encore.
pub async fn upload(http: &reqwest::Client, log: &str, token: Option<&str>) -> Result<String> {
    let log = match token {
        Some(token) if !token.is_empty() => log.replace(token, "[jeton masqué]"),
        _ => log.to_owned(),
    };
    let content = tail(&log);
    if content.trim().is_empty() {
        return Err(GameError::InvalidVersion("journal vide".into()));
    }
    let request = Request { content, source: "Clover Launcher" };
    let response: Response = http.post(API).json(&request).timeout(TIMEOUT).send().await?.json().await?;
    match response.url {
        Some(url) if response.success && url.starts_with(PAGE) && url.len() < 100 => Ok(url),
        _ => Err(GameError::InvalidVersion(format!("mclo.gs a refusé le journal ({})", response.error.unwrap_or_else(|| "réponse inattendue".into())))),
    }
}

/// Dernières lignes du journal, dans les limites du service.
fn tail(log: &str) -> &str {
    let mut start = log.len().saturating_sub(MAX_BYTES);
    while !log.is_char_boundary(start) {
        start += 1;
    }
    let log = &log[start..];
    // Le saut de ligne final ne commence pas de nouvelle ligne.
    match log.strip_suffix('\n').unwrap_or(log).rmatch_indices('\n').nth(MAX_LINES - 1) {
        Some((index, _)) => &log[index + 1..],
        None => log,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_end_of_long_logs() {
        let lines: String = (0..30_000).map(|n| format!("ligne {n}\n")).collect();
        let kept = tail(&lines);
        assert_eq!(kept.lines().count(), MAX_LINES);
        assert!(kept.starts_with("ligne 5000\n"));
        assert!(kept.ends_with("ligne 29999\n"));
        assert_eq!(tail("court"), "court");
        let wide = "é".repeat(MAX_BYTES);
        assert!(tail(&wide).len() <= MAX_BYTES);
    }
}
