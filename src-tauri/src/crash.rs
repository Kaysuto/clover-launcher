//! Rapports de plantage du launcher vers Sentry, seulement avec l'accord du joueur
//! (« Envoyer les rapports à l'équipe Clover Games », désactivé par défaut, RGPD).
//!
//! Le client est créé au démarrage du launcher, mais `before_send` jette tout tant que l'accord
//! manque : sans accord, rien ne part (ni suivi de session ni autre envoi dans ce build). Un rapport
//! contient la version, le système, le message d'erreur et la pile d'appels ; le nom de la machine
//! est retiré et le dossier personnel remplacé par `~`. L'interface envoie ses propres erreurs avec
//! le même DSN (`src/lib/crash-reports.ts`).
//!
//! Le DSN est public par nature : il ne permet que d'envoyer des rapports au projet.

use std::sync::atomic::{AtomicBool, Ordering};

use sentry::protocol::Event;
use serde::Serialize;

pub const DSN: &str = "https://17efdfdc4459b3cc9622f860cafd18b6@o4511050530160640.ingest.de.sentry.io/4512208732094544";

static CONSENT: AtomicBool = AtomicBool::new(false);
static BETA: AtomicBool = AtomicBool::new(false);

/// Ce que l'interface reprend pour ses propres rapports.
#[derive(Debug, Clone, Serialize)]
pub struct Reporting {
    pub dsn: &'static str,
    pub release: String,
    pub environment: &'static str,
}

fn environment() -> &'static str {
    if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    }
}

pub fn reporting() -> Reporting {
    Reporting { dsn: DSN, release: release(), environment: environment() }
}

fn release() -> String {
    format!("clover-launcher@{}", env!("CARGO_PKG_VERSION"))
}

/// Client Sentry du processus, sans accord tant que `set` ne l'a pas donné. À garder vivant
/// jusqu'à la fin du launcher.
pub fn init() -> sentry::ClientInitGuard {
    let mut options = sentry::ClientOptions::default();
    options.release = Some(release().into());
    options.environment = Some(environment().into());
    options.send_default_pii = false;
    options.before_send = Some(std::sync::Arc::new(before_send));
    sentry::init((DSN, options))
}

/// Accord du joueur et canal (bêta ou non), relus à chaque rapport.
pub fn set(consent: bool, beta: bool) {
    CONSENT.store(consent, Ordering::Relaxed);
    BETA.store(beta, Ordering::Relaxed);
}

fn before_send(event: Event<'static>) -> Option<Event<'static>> {
    if !CONSENT.load(Ordering::Relaxed) {
        return None;
    }
    Some(scrub(event, home().as_deref()))
}

fn home() -> Option<String> {
    std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).ok().filter(|home| home.len() > 3)
}

/// Retire le nom de la machine et remplace le dossier personnel (qui contient le nom d'utilisateur)
/// par `~` dans les messages.
fn scrub(mut event: Event<'static>, home: Option<&str>) -> Event<'static> {
    event.server_name = None;
    event.user = None;
    event.tags.insert("canal".into(), if BETA.load(Ordering::Relaxed) { "beta" } else { "prod" }.into());
    let Some(home) = home else { return event };
    let clean = |text: &mut String| {
        // Windows : chemins sans casse, avec l'une ou l'autre barre.
        for variant in [home.to_owned(), home.replace('\\', "/")] {
            // Minuscules ASCII : mêmes positions d'octets que le texte d'origine.
            while let Some(start) = text.to_ascii_lowercase().find(&variant.to_ascii_lowercase()) {
                text.replace_range(start..start + variant.len(), "~");
            }
        }
    };
    if let Some(message) = event.message.as_mut() {
        clean(message);
    }
    if let Some(entry) = event.logentry.as_mut() {
        clean(&mut entry.message);
    }
    for exception in &mut event.exception.values {
        if let Some(value) = exception.value.as_mut() {
            clean(value);
        }
    }
    event
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::{Exception, Values};

    #[test]
    fn nothing_leaves_without_consent_and_reports_are_scrubbed() {
        let event = || Event {
            server_name: Some("PC-DE-KEVIN".into()),
            message: Some(r"Erreur disque : C:\Users\Kevin\.cloverlauncher\launcher.json".into()),
            exception: Values::from(vec![Exception { ty: "panic".into(), value: Some("c:/users/kevin/.cloverlauncher absent".into()), ..Default::default() }]),
            ..Default::default()
        };
        set(false, false);
        assert!(before_send(event()).is_none());

        set(true, true);
        let sent = scrub(event(), Some(r"C:\Users\Kevin"));
        assert_eq!(sent.server_name, None);
        assert_eq!(sent.message.as_deref(), Some(r"Erreur disque : ~\.cloverlauncher\launcher.json"));
        assert_eq!(sent.exception.values[0].value.as_deref(), Some("~/.cloverlauncher absent"));
        assert_eq!(sent.tags.get("canal").map(String::as_str), Some("beta"));
        set(false, false);
    }

    /// Réseau : envoie un rapport de test au projet Sentry (lancer avec `--ignored`).
    #[test]
    #[ignore]
    fn sends_a_test_report() {
        let guard = init();
        set(true, false);
        let id = sentry::capture_message("Test d'intégration du Clover Launcher (rapports de plantage)", sentry::Level::Info);
        assert!(guard.flush(Some(std::time::Duration::from_secs(10))));
        set(false, false);
        println!("rapport envoyé : {id}");
    }
}
