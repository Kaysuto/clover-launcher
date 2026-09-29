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

const APPLICATION_ID: &str = "857776082777276426";
/// Clé de l'image téléversée dans Rich Presence → Art Assets de l'application Discord.
const LOGO_KEY: &str = "logo";
const SERVER_HOST: &str = "play.clovergames.fr";
const DISCORD_URL: &str = "https://discord.gg/theclovergames";
const SITE_URL: &str = "https://clovergames.fr";

/// Ce que voient les amis Discord.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum State {
    /// Launcher ouvert, pas de partie.
    Launcher,
    /// Minecraft tourne depuis `since` (secondes Unix).
    Playing { since: i64 },
}

impl State {
    pub fn playing_now() -> Self {
        let since = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs() as i64);
        Self::Playing { since }
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
}

impl Presence {
    /// Active ou désactive le statut (réglage « Afficher mon activité sur Discord »).
    pub async fn set_enabled(&self, enabled: bool) {
        let mut inner = self.inner.lock().await;
        inner.enabled = enabled;
        if enabled {
            let state = inner.state;
            inner.publish(state);
        } else if let Some(mut client) = inner.client.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }
    }

    pub async fn set_state(&self, state: State) {
        let mut inner = self.inner.lock().await;
        inner.state = Some(state);
        if inner.enabled {
            inner.publish(Some(state));
        }
    }
}

impl Inner {
    fn publish(&mut self, state: Option<State>) {
        let Some(state) = state else { return };
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
            if client.set_activity(activity(state)).is_ok() {
                return;
            }
            self.client = None;
        }
    }
}

fn activity(state: State) -> Activity<'static> {
    let base = Activity::new()
        .assets(Assets::new().large_image(LOGO_KEY).large_text("Clover Games"))
        .buttons(vec![Button::new("Rejoindre le Discord", DISCORD_URL), Button::new("Site", SITE_URL)]);
    match state {
        State::Launcher => base.details("Dans le launcher").state("Prépare sa partie"),
        State::Playing { since } => base
            .details("Joue à Clover Games")
            .state(format!("Sur {SERVER_HOST}"))
            .timestamps(Timestamps::new().start(since)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playing_state_carries_start_time() {
        let State::Playing { since } = State::playing_now() else { panic!("attendu : Playing") };
        assert!(since > 1_700_000_000);
    }

    #[test]
    fn builds_both_activities() {
        let _ = activity(State::Launcher);
        let _ = activity(State::Playing { since: 1_790_000_000 });
    }

    #[tokio::test]
    async fn disabled_presence_never_connects() {
        let presence = Presence::default();
        presence.set_state(State::Launcher).await;
        assert!(presence.inner.lock().await.client.is_none());
    }
}
