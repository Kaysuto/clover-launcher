//! Connexion Microsoft → Xbox Live → XSTS → Minecraft.
//!
//! OAuth 2.0 « authorization code » + PKCE dans le navigateur du système, redirection loopback
//! (RFC 8252). Client public : aucun secret n'est embarqué. L'application Azure est celle du site,
//! déjà approuvée par Mojang pour `login_with_xbox` ; elle doit exposer la plateforme
//! « Applications mobiles et de bureau » avec la redirection `http://localhost`.
//!
//! Même chaîne que `siteweb/src/lib/minecraft-auth.ts`.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const CLIENT_ID: &str = "196369a3-ff72-4d87-9a19-278991fd58f1";
const AUTHORIZE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";

const KEYRING_SERVICE: &str = "fr.clovergames.launcher";
const REFRESH_TOKEN_ACCOUNT: &str = "microsoft-refresh-token";
const SESSION_ACCOUNT: &str = "minecraft-session";

/// Marge avant expiration du jeton Minecraft (valable 24 h) sous laquelle on le renouvelle.
const SESSION_MARGIN_SECS: u64 = 3600;

/// Durée laissée au joueur pour se connecter dans son navigateur.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Connexion annulée.")]
    Cancelled,
    #[error("La connexion a expiré, réessaie.")]
    Timeout,
    #[error("Réponse de connexion invalide.")]
    InvalidCallback,
    #[error("Microsoft a refusé la connexion : {0}")]
    Microsoft(String),
    #[error("{0}")]
    Xsts(String),
    #[error("Le launcher n'est pas autorisé par Mojang (login_with_xbox → 403).")]
    NotApprovedByMojang,
    #[error("Ce compte Microsoft ne possède pas Minecraft: Java Edition.")]
    NoMinecraft,
    #[error("Trop de connexions à Minecraft en peu de temps, réessaie dans quelques minutes.")]
    RateLimited,
    #[error("Échec à l'étape {step} (HTTP {status}).")]
    Http { step: &'static str, status: u16 },
    #[error("Erreur réseau : {0}")]
    Network(#[from] reqwest::Error),
    #[error("Coffre du système indisponible : {0}")]
    Keyring(#[from] keyring::Error),
    #[error("Erreur interne : {0}")]
    Io(#[from] std::io::Error),
}

impl Serialize for AuthError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, AuthError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    /// UUID avec tirets, comme partout ailleurs chez Clover.
    pub uuid: String,
    pub name: String,
}

/// Gardée dans le coffre du système jusqu'à son expiration : `login_with_xbox` limite
/// sévèrement le nombre d'appels (HTTP 429), il ne faut pas refaire la chaîne à chaque démarrage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub profile: Profile,
    /// Jeton passé au jeu (`--accessToken`). Ne quitte jamais le poste du joueur.
    pub minecraft_token: String,
    /// Expiration du jeton Minecraft, en secondes Unix.
    pub expires_at: u64,
}

impl Session {
    pub fn is_fresh(&self) -> bool {
        self.expires_at > now() + SESSION_MARGIN_SECS
    }
}

#[derive(Deserialize)]
struct MicrosoftTokens {
    access_token: String,
    refresh_token: String,
}

/// Ouvre le navigateur, attend le retour de Microsoft et ouvre une session Minecraft.
pub async fn login(app: &AppHandle) -> Result<Session> {
    let verifier = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 16]>());

    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let redirect_uri = format!("http://localhost:{}", listener.local_addr()?.port());

    let mut url = url::Url::parse(AUTHORIZE_URL).expect("URL d'autorisation valide");
    url.query_pairs_mut()
        .append_pair("client_id", CLIENT_ID)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state)
        .append_pair("prompt", "select_account");
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| AuthError::Io(std::io::Error::other(e.to_string())))?;

    let code = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_code(&listener, &state))
        .await
        .map_err(|_| AuthError::Timeout)??;

    let tokens = request_tokens(&[
        ("client_id", CLIENT_ID),
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", &redirect_uri),
        ("code_verifier", &verifier),
        ("scope", SCOPE),
    ])
    .await?;
    open_session(tokens).await
}

/// Rouvre la session du dernier compte : jeton Minecraft encore valable, sinon renouvellement à
/// partir du refresh token Microsoft rangé dans le coffre du système.
pub async fn restore() -> Result<Option<Session>> {
    if let Some(session) = cached_session()? {
        if session.is_fresh() {
            return Ok(Some(session));
        }
    }
    let refresh_token = match keyring_entry(REFRESH_TOKEN_ACCOUNT)?.get_password() {
        Ok(token) => token,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let tokens = request_tokens(&[
        ("client_id", CLIENT_ID),
        ("grant_type", "refresh_token"),
        ("refresh_token", &refresh_token),
        ("scope", SCOPE),
    ])
    .await?;
    open_session(tokens).await.map(Some)
}

pub fn logout() -> Result<()> {
    for account in [SESSION_ACCOUNT, REFRESH_TOKEN_ACCOUNT] {
        match keyring_entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}

fn keyring_entry(account: &str) -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(KEYRING_SERVICE, account)?)
}

/// Une session illisible (format d'une ancienne version) est ignorée, pas bloquante.
fn cached_session() -> Result<Option<Session>> {
    match keyring_entry(SESSION_ACCOUNT)?.get_password() {
        Ok(json) => Ok(serde_json::from_str(&json).ok()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

async fn open_session(tokens: MicrosoftTokens) -> Result<Session> {
    // Microsoft fait tourner le refresh token à chaque usage : toujours ranger le dernier.
    keyring_entry(REFRESH_TOKEN_ACCOUNT)?.set_password(&tokens.refresh_token)?;
    let session = minecraft_session(&tokens.access_token).await?;
    let json = serde_json::to_string(&session).expect("session sérialisable");
    keyring_entry(SESSION_ACCOUNT)?.set_password(&json)?;
    Ok(session)
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs())
}

/// Accepte les connexions sur la redirection loopback jusqu'à recevoir le retour de Microsoft.
/// Les requêtes parasites (favicon, préconnexion du navigateur) sont ignorées.
async fn wait_for_code(listener: &TcpListener, expected_state: &str) -> Result<String> {
    loop {
        let (mut stream, _) = listener.accept().await?;
        let mut buffer = vec![0u8; 8192];
        let read = match tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buffer)).await {
            Ok(Ok(n)) if n > 0 => n,
            _ => continue,
        };
        let request = String::from_utf8_lossy(&buffer[..read]);
        let Some(target) = request.lines().next().and_then(|line| line.split_whitespace().nth(1)) else {
            continue;
        };
        let Ok(url) = url::Url::parse(&format!("http://localhost{target}")) else {
            continue;
        };
        let param = |key: &str| url.query_pairs().find(|(k, _)| k == key).map(|(_, v)| v.into_owned());

        let outcome = if let Some(error) = param("error") {
            Err(if error == "access_denied" {
                AuthError::Cancelled
            } else {
                AuthError::Microsoft(param("error_description").unwrap_or(error))
            })
        } else if let Some(code) = param("code") {
            if param("state").as_deref() == Some(expected_state) {
                Ok(code)
            } else {
                Err(AuthError::InvalidCallback)
            }
        } else {
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
            continue;
        };

        let message = match &outcome {
            Ok(_) => "Connexion réussie. Tu peux fermer cet onglet et revenir sur le Clover Launcher.",
            Err(_) => "La connexion a échoué. Reviens sur le Clover Launcher pour réessayer.",
        };
        let body = format!(
            "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><title>Clover Launcher</title>\
             <body style=\"font-family:system-ui;background:#0b1410;color:#e6efe9;display:grid;place-items:center;height:100vh;margin:0\">\
             <p>{message}</p></body></html>"
        );
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = stream.write_all(response.as_bytes()).await;
        return outcome;
    }
}

async fn request_tokens(form: &[(&str, &str)]) -> Result<MicrosoftTokens> {
    let response = reqwest::Client::new().post(TOKEN_URL).form(form).send().await?;
    if response.status().is_success() {
        return Ok(response.json().await?);
    }
    let body: Value = response.json().await.unwrap_or_default();
    let description = body["error_description"]
        .as_str()
        .or(body["error"].as_str())
        .unwrap_or("réponse illisible");
    // La première ligne porte le code AADSTS utile au diagnostic ; la suite est un horodatage.
    Err(AuthError::Microsoft(description.lines().next().unwrap_or_default().to_owned()))
}

async fn minecraft_session(microsoft_token: &str) -> Result<Session> {
    let http = reqwest::Client::new();

    // Étape 1 : Xbox Live
    let xbl = http
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={microsoft_token}"),
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT",
        }))
        .send()
        .await?;
    let xbl = checked(xbl, "Xbox Live").await?;
    let xbl_token = string_at(&xbl, "/Token", "Xbox Live")?;
    let user_hash = string_at(&xbl, "/DisplayClaims/xui/0/uhs", "Xbox Live")?;

    // Étape 2 : XSTS
    let xsts = http
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT",
        }))
        .send()
        .await?;
    if xsts.status() == reqwest::StatusCode::UNAUTHORIZED {
        let body: Value = xsts.json().await.unwrap_or_default();
        return Err(AuthError::Xsts(xsts_message(body["XErr"].as_u64().unwrap_or(0))));
    }
    let xsts = checked(xsts, "XSTS").await?;
    let xsts_token = string_at(&xsts, "/Token", "XSTS")?;

    // Étape 3 : jeton Minecraft
    let minecraft = http
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({ "identityToken": format!("XBL3.0 x={user_hash};{xsts_token}") }))
        .send()
        .await?;
    if minecraft.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(AuthError::NotApprovedByMojang);
    }
    let minecraft = checked(minecraft, "Minecraft").await?;
    let minecraft_token = string_at(&minecraft, "/access_token", "Minecraft")?;
    let expires_at = now() + minecraft["expires_in"].as_u64().unwrap_or(86_400);

    // Étape 4 : profil. 404 = le compte ne possède pas le jeu.
    let profile = http
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(&minecraft_token)
        .send()
        .await?;
    if profile.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AuthError::NoMinecraft);
    }
    let profile = checked(profile, "profil Minecraft").await?;
    let id = string_at(&profile, "/id", "profil Minecraft")?;
    let name = string_at(&profile, "/name", "profil Minecraft")?;

    Ok(Session {
        profile: Profile { uuid: hyphenate(&id), name },
        minecraft_token,
        expires_at,
    })
}

async fn checked(response: reqwest::Response, step: &'static str) -> Result<Value> {
    let status = response.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AuthError::RateLimited);
    }
    if !status.is_success() {
        return Err(AuthError::Http { step, status: status.as_u16() });
    }
    Ok(response.json().await?)
}

fn string_at(value: &Value, pointer: &str, step: &'static str) -> Result<String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or(AuthError::Http { step, status: 200 })
}

/// L'API Mojang renvoie l'UUID sans tirets.
fn hyphenate(id: &str) -> String {
    if id.len() != 32 {
        return id.to_owned();
    }
    format!("{}-{}-{}-{}-{}", &id[0..8], &id[8..12], &id[12..16], &id[16..20], &id[20..32])
}

/// Codes XErr renvoyés par XSTS (liste reprise du site).
fn xsts_message(code: u64) -> String {
    match code {
        2148916227 => "Le compte Xbox est banni.".into(),
        2148916229 => "Le compte Xbox ne peut pas jouer dans ce pays.".into(),
        2148916233 => "Aucun compte Xbox associé à ce compte Microsoft. Le compte doit être configuré sur xbox.com.".into(),
        2148916234 => "Le compte n'a pas accepté les conditions d'utilisation Xbox.".into(),
        2148916235 => "Xbox Live n'est pas disponible dans ce pays.".into(),
        2148916236 => "Une vérification d'âge adulte est requise (Corée du Sud).".into(),
        2148916237 => "Une vérification d'âge adulte est requise.".into(),
        2148916238 => "Compte enfant : doit être ajouté à une famille Xbox par un adulte.".into(),
        other => format!("Erreur XSTS inconnue (XErr : {other})."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hyphenates_mojang_uuid() {
        assert_eq!(
            hyphenate("069a79f444e94726a5befca90e38aaf5"),
            "069a79f4-44e9-4726-a5be-fca90e38aaf5"
        );
    }

    #[test]
    fn leaves_unexpected_ids_untouched() {
        assert_eq!(hyphenate("abc"), "abc");
    }
}
