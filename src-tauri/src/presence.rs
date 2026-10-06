//! Discord Rich Presence : « Joue à Clover Games ».
//!
//! L'identifiant d'application est public (il figure dans tout statut Discord) ; aucun secret.
//! Discord fermé ou absent n'est jamais une erreur : on réessaie discrètement au changement
//! d'état suivant. Le nom affiché après « Joue à » est celui de l'application Discord.

use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::{
    activity::{Activity, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use tokio::sync::Mutex;

const APPLICATION_ID: &str = "1556616919925268480";
/// Clé de l'image téléversée dans Rich Presence → Art Assets de l'application Discord.
const LOGO_KEY: &str = "logo";
const SERVER_HOST: &str = "play.clovergames.fr";
const DISCORD_URL: &str = "https://discord.gg/theclovergames";
const SITE_URL: &str = "https://clovergames.fr";
/// Tête du skin, rendue par Minotar ; Discord accepte une URL comme image. Pas Crafatar : il
/// renvoie le robot de Discord vers une page d'erreur (crafatar/crafatar#322).
const HEAD_URL: &str = "https://minotar.net/helm";

/// Compte actif, en petite image : sa tête et son pseudo au survol.
#[derive(Debug, Clone, PartialEq)]
pub struct Player {
    pub uuid: String,
    pub name: String,
}

/// Ce que voient les amis Discord.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum State {
    /// Launcher ouvert, pas de partie.
    Launcher,
    /// Minecraft tourne depuis `since` (secondes Unix), lancé sur Clover Games ou sur un autre serveur.
    Playing { since: i64, clover: bool },
}

impl State {
    pub fn playing_now(clover: bool) -> Self {
        let since = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs() as i64);
        Self::Playing { since, clover }
    }
}

#[derive(Default)]
pub struct Presence {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    client: Option<DiscordIpcClient>,
    enabled: bool,
    state: Option<State>,
    player: Option<Player>,
}

impl Presence {
    /// Active ou désactive le statut (réglage « Afficher mon activité sur Discord »).
    pub async fn set_enabled(&self, enabled: bool) {
        let mut inner = self.inner.lock().await;
        inner.enabled = enabled;
        if enabled {
            inner.publish();
        } else if let Some(mut client) = inner.client.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }
    }

    pub async fn set_state(&self, state: State) {
        let mut inner = self.inner.lock().await;
        inner.state = Some(state);
        if inner.enabled {
            inner.publish();
        }
    }

    /// Changement de compte actif (`None` : plus aucun compte connecté).
    pub async fn set_player(&self, player: Option<Player>) {
        let mut inner = self.inner.lock().await;
        if inner.player == player {
            return;
        }
        inner.player = player;
        if inner.enabled {
            inner.publish();
        }
    }
}

impl Inner {
    fn publish(&mut self) {
        let Some(state) = self.state else { return };
        // Une connexion coupée (Discord redémarré) échoue à l'envoi : on repart de zéro une fois.
        for _ in 0..2 {
            if self.client.is_none() {
                let mut client = DiscordIpcClient::new(APPLICATION_ID);
                if client.connect().is_err() {
                    return;
                }
                self.client = Some(client);
            }
            let client = self.client.as_mut().expect("client connecté");
            if client.set_activity(activity(state, self.player.as_ref())).is_ok() {
                return;
            }
            self.client = None;
        }
    }
}

fn activity(state: State, player: Option<&Player>) -> Activity<'static> {
    let mut assets = Assets::new().large_image(LOGO_KEY).large_text("Clover Games");
    if let Some(player) = player {
        assets = assets.small_image(format!("{HEAD_URL}/{}/64.png", player.uuid.replace('-', ""))).small_text(player.name.clone());
    }
    let base = Activity::new()
        .assets(assets)
        .buttons(vec![Button::new("Rejoindre le Discord", DISCORD_URL), Button::new("Site", SITE_URL)]);
    match state {
        State::Launcher => base.details("Dans le launcher").state("Prépare sa partie"),
        State::Playing { since, clover: true } => base
            .details("Joue à Clover Games")
            .state(format!("Sur {SERVER_HOST}"))
            .timestamps(Timestamps::new().start(since)),
        // L'adresse d'un autre serveur reste privée.
        State::Playing { since, clover: false } => base.details("Joue à Minecraft").timestamps(Timestamps::new().start(since)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playing_state_carries_start_time() {
        let State::Playing { since, .. } = State::playing_now(true) else { panic!("attendu : Playing") };
        assert!(since > 1_700_000_000);
    }

    #[test]
    fn builds_every_activity() {
        let player = Player { uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5".into(), name: "Notch".into() };
        let _ = activity(State::Launcher, None);
        let _ = activity(State::Playing { since: 1_790_000_000, clover: true }, Some(&player));
        let _ = activity(State::Playing { since: 1_790_000_000, clover: false }, Some(&player));
    }

    #[tokio::test]
    async fn disabled_presence_never_connects() {
        let presence = Presence::default();
        presence.set_state(State::Launcher).await;
        assert!(presence.inner.lock().await.client.is_none());
    }
}
