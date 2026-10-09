//! Pseudo Minecraft : disponibilité et changement par l'API de Mojang, qui n'en permet qu'un
//! tous les 30 jours. Le jeton Minecraft ne quitte pas le poste.

use std::time::Duration;

use serde::Serialize;
use serde_json::Value;

use crate::auth::{self, Session};

const PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
/// Le changement garde la session verrouillée pendant l'appel : Mojang ne la bloque pas plus longtemps.
const TIMEOUT: Duration = Duration::from_secs(20);

fn http() -> reqwest::Client {
    reqwest::Client::builder().timeout(TIMEOUT).build().expect("client HTTP valide")
}

#[derive(Debug, thiserror::Error)]
pub enum NameError {
    #[error("Un pseudo fait 3 à 16 caractères : lettres sans accent, chiffres et _.")]
    Invalid,
    #[error("Ce pseudo est déjà pris.")]
    Taken,
    #[error("Mojang n'autorise pas ce pseudo.")]
    NotAllowed,
    #[error("Ton pseudo a déjà changé il y a moins de 30 jours.")]
    TooSoon,
    #[error("Trop de demandes en peu de temps, réessaie dans quelques minutes.")]
    RateLimited,
    #[error("Minecraft a refusé le changement (HTTP {0}).")]
    Rejected(u16),
    #[error("Erreur réseau : {0}")]
    Network(#[from] reqwest::Error),
    #[error("{0}")]
    Auth(#[from] auth::AuthError),
}

impl Serialize for NameError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, NameError>;

/// Réponse de Mojang à « ce pseudo est-il libre ? ».
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Availability {
    Available,
    Taken,
    NotAllowed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NameChange {
    /// Faux dans les 30 jours qui suivent un changement.
    pub allowed: bool,
    /// Dernier changement (ISO 8601), d'où l'interface déduit la date du prochain.
    pub changed_at: Option<String>,
    /// Création du compte Minecraft (ISO 8601), affichée sur la page Profil.
    pub created_at: Option<String>,
}

pub async fn change_info(session: &Session) -> Result<NameChange> {
    let response = http().get(format!("{PROFILE_URL}/namechange")).bearer_auth(&session.minecraft_token).send().await?;
    let body = checked(response).await?;
    Ok(NameChange { allowed: body["nameChangeAllowed"].as_bool().unwrap_or(false), changed_at: body["changedAt"].as_str().map(str::to_owned), created_at: body["createdAt"].as_str().map(str::to_owned) })
}

pub async fn availability(session: &Session, name: &str) -> Result<Availability> {
    validate(name)?;
    let response = http().get(format!("{PROFILE_URL}/name/{name}/available")).bearer_auth(&session.minecraft_token).send().await?;
    Ok(match checked(response).await?["status"].as_str() {
        Some("AVAILABLE") => Availability::Available,
        Some("DUPLICATE") => Availability::Taken,
        _ => Availability::NotAllowed,
    })
}

/// Change le pseudo du compte, puis renvoie la session avec le profil à jour.
pub async fn change(session: &Session, name: &str) -> Result<Session> {
    validate(name)?;
    let response = http().put(format!("{PROFILE_URL}/name/{name}")).bearer_auth(&session.minecraft_token).send().await?;
    let status = response.status();
    if status.is_success() {
        return Ok(auth::update_profile(session, &response.json().await?)?);
    }
    let body: Value = response.json().await.unwrap_or_default();
    Err(refusal(status.as_u16(), &body))
}

/// Mojang précise la cause dans `details.status` ; un 403 sans précision est le délai de 30 jours.
fn refusal(status: u16, body: &Value) -> NameError {
    match (status, body.pointer("/details/status").and_then(Value::as_str)) {
        (429, _) => NameError::RateLimited,
        (_, Some("DUPLICATE")) => NameError::Taken,
        (_, Some("NOT_ALLOWED")) | (400, _) => NameError::NotAllowed,
        (403, _) => NameError::TooSoon,
        (status, _) => NameError::Rejected(status),
    }
}

async fn checked(response: reqwest::Response) -> Result<Value> {
    let status = response.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(NameError::RateLimited);
    }
    if !status.is_success() {
        return Err(NameError::Rejected(status.as_u16()));
    }
    Ok(response.json().await?)
}

/// Règle de Mojang, vérifiée aussi ici : le pseudo entre tel quel dans l'adresse de la requête.
fn validate(name: &str) -> Result<()> {
    if (3..=16).contains(&name.len()) && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_') {
        Ok(())
    } else {
        Err(NameError::Invalid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_only_mojang_names() {
        for name in ["Kaysuto", "abc", "a_b_c_d_e_f_g_h_", "Player_42"] {
            assert!(validate(name).is_ok(), "{name}");
        }
        for name in ["ab", "a_b_c_d_e_f_g_h_i", "Kaÿsuto", "un pseudo", "../skins", "a/b", ""] {
            assert!(validate(name).is_err(), "{name}");
        }
    }

    #[test]
    fn maps_mojang_refusals() {
        let details = |status: &str| json!({ "details": { "status": status } });
        assert!(matches!(refusal(403, &details("DUPLICATE")), NameError::Taken));
        assert!(matches!(refusal(403, &details("NOT_ALLOWED")), NameError::NotAllowed));
        assert!(matches!(refusal(400, &json!({})), NameError::NotAllowed));
        assert!(matches!(refusal(403, &json!({})), NameError::TooSoon));
        assert!(matches!(refusal(429, &details("DUPLICATE")), NameError::RateLimited));
        assert!(matches!(refusal(500, &json!({})), NameError::Rejected(500)));
    }
}
