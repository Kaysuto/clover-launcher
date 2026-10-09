//! Statistiques Clover Games du compte actif pour la page Profil, via `/api/launcher/profile` et la
//! session du launcher sur le site (`notifications::authorized`). Réponse réduite aux champs
//! affichés ; un bloc absent ou mal formé reste vide sans casser les autres.

use serde::{Deserialize, Deserializer, Serialize};
use tauri::State;

use crate::notifications::{authorized, session, SiteTokens};
use crate::CurrentSession;

/// Accepte un bloc mal formé comme absent : une évolution du site ne vide pas toute la page.
fn lenient<'de, D: Deserializer<'de>, T: Deserialize<'de>>(deserializer: D) -> Result<Option<T>, D::Error> {
    Ok(Option::<T>::deserialize(serde_json::Value::deserialize(deserializer)?).ok().flatten())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Grade {
    pub label: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Level {
    pub level: u32,
    pub total_xp: u64,
    pub into: u64,
    pub needed: u64,
    pub rank: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Votes {
    pub total: u64,
    pub month: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Streak {
    pub current: u32,
    pub best: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub first_seen: Option<i64>,
    pub last_seen: Option<i64>,
    pub last_server: Option<String>,
    pub online: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerTime {
    pub id: String,
    pub seconds: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playtime {
    pub total: u64,
    pub longest: u64,
    pub joins: u64,
    pub servers: Vec<ServerTime>,
}

/// Chiffres d'un mode : noms et sens fixés par le site (`siteweb/src/lib/player-stats.ts`).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mode {
    pub id: String,
    pub rank: Option<u32>,
    pub stats: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub name: String,
    pub icon: String,
    pub description: String,
    pub unlocked_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievements {
    pub unlocked: u32,
    pub total: u32,
    pub points: i64,
    pub recent: Vec<Achievement>,
}

/// Ami du compte : serveur et dernière connexion seulement si l'ami les partage (le site applique
/// ses réglages de confidentialité en jeu).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Friend {
    pub uuid: String,
    pub name: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub online: bool,
    pub server: Option<String>,
    pub last_seen: Option<i64>,
    pub status: Option<String>,
    #[serde(default)]
    pub can_join: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStats {
    #[serde(default)]
    pub linked: bool,
    #[serde(default, deserialize_with = "lenient")]
    pub grade: Option<Grade>,
    #[serde(default, deserialize_with = "lenient")]
    pub level: Option<Level>,
    #[serde(default, deserialize_with = "lenient")]
    pub coins: Option<i64>,
    #[serde(default, deserialize_with = "lenient")]
    pub votes: Option<Votes>,
    #[serde(default, deserialize_with = "lenient")]
    pub streak: Option<Streak>,
    #[serde(default, deserialize_with = "lenient")]
    pub presence: Option<Presence>,
    #[serde(default, deserialize_with = "lenient")]
    pub playtime: Option<Playtime>,
    #[serde(default, deserialize_with = "lenient")]
    pub modes: Option<Vec<Mode>>,
    #[serde(default, deserialize_with = "lenient")]
    pub achievements: Option<Achievements>,
    #[serde(default, deserialize_with = "lenient")]
    pub friends: Option<Vec<Friend>>,
}

fn is_player_name(name: &str) -> bool {
    (3..=16).contains(&name.len()) && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

/// Les chiffres d'un mode ne gardent que des nombres (ou `null`) : rien d'autre n'est affiché. Un
/// ami au pseudo invalide est écarté (son pseudo entre dans l'adresse de sa tête), son statut tronqué.
fn numbers_only(mut stats: PlayerStats) -> PlayerStats {
    if let Some(friends) = &mut stats.friends {
        friends.retain(|friend| is_player_name(&friend.name));
        for friend in friends.iter_mut() {
            friend.status = friend.status.take().map(|status| status.chars().take(64).collect());
        }
    }
    if let Some(modes) = &mut stats.modes {
        for mode in modes {
            mode.stats.retain(|_, value| value.is_number() || value.is_null());
        }
    }
    if let Some(grade) = &stats.grade {
        let hex = grade.color.strip_prefix('#').unwrap_or_default();
        if !(hex.len() == 6 && hex.bytes().all(|byte| byte.is_ascii_hexdigit())) {
            stats.grade = None;
        }
    }
    stats
}

#[tauri::command]
pub async fn player_stats(current: State<'_, CurrentSession>, tokens: State<'_, SiteTokens>) -> Result<PlayerStats, String> {
    let session = session(&current).await?;
    let response = authorized(&tokens, &session, |http, base, token| http.get(format!("{base}/api/launcher/profile")).bearer_auth(token)).await?;
    let stats: PlayerStats = response.json().await.map_err(|_| "Réponse du site illisible.".to_owned())?;
    Ok(numbers_only(stats))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_site_profile() {
        let stats: PlayerStats = serde_json::from_str(
            r##"{"schema":1,"linked":true,"grade":{"label":"Gérant","color":"#eab308"},
            "level":{"level":27,"totalXp":216135,"into":3719,"needed":20675,"rank":1},
            "coins":374,"votes":{"total":34,"month":0},"streak":{"current":4,"best":13},
            "presence":{"firstSeen":1783836549150,"lastSeen":1791292461123,"lastServer":"Lobby","online":null},
            "playtime":{"total":348127,"longest":84092,"joins":909,"servers":[{"id":"Lobby","seconds":180609}]},
            "modes":[{"id":"practice","rank":1,"stats":{"rating":1005,"peakRating":null,"wins":47,"label":"<b>x</b>"}}],
            "achievements":null}"##,
        )
        .unwrap();
        let stats = numbers_only(stats);
        assert!(stats.linked);
        assert_eq!(stats.level.as_ref().unwrap().rank, Some(1));
        assert_eq!(stats.playtime.as_ref().unwrap().servers[0].id, "Lobby");
        let mode = &stats.modes.as_ref().unwrap()[0];
        assert!(mode.stats.contains_key("rating") && mode.stats.contains_key("peakRating") && !mode.stats.contains_key("label"));
    }

    #[test]
    fn keeps_only_valid_friends() {
        let stats: PlayerStats = serde_json::from_str(
            r#"{"friends":[{"uuid":"a","name":"Kanname","online":true,"server":"Practice","lastSeen":null,"status":null,"canJoin":true},
            {"uuid":"b","name":"../x","server":null,"lastSeen":1,"status":null}]}"#,
        )
        .unwrap();
        let friends = numbers_only(stats).friends.unwrap();
        assert_eq!(friends.len(), 1);
        assert!(friends[0].can_join && !friends[0].favorite);
    }

    #[test]
    fn keeps_the_rest_when_a_block_is_malformed() {
        let stats: PlayerStats = serde_json::from_str(r#"{"linked":false,"grade":{"label":"X","color":"red"},"level":"oops","coins":12}"#).unwrap();
        let stats = numbers_only(stats);
        assert!(stats.level.is_none() && stats.grade.is_none());
        assert_eq!(stats.coins, Some(12));
    }
}
