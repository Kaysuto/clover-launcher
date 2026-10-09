//! Journal Quick Play de Minecraft (`--quickPlayPath`) : à chaque connexion à un monde ou à un
//! serveur, le jeu remplace ce fichier par cette seule connexion. Le launcher le relit pendant et
//! après la partie pour garder l'historique des serveurs rejoints (`Stored::recent_servers`).

use std::path::Path;

use serde::Deserialize;

use crate::store::RecentServer;

/// Entrée écrite par `QuickPlayLog` : `type` vaut `singleplayer`, `multiplayer` ou `realms`, `id`
/// est l'adresse du serveur. Les autres champs (`lastPlayedTime`, `gamemode`) ne servent pas.
#[derive(Deserialize)]
struct Entry {
    #[serde(rename = "type")]
    kind: String,
    id: String,
    name: String,
}

/// Dernier serveur rejoint, `None` sans journal, pour un monde solo ou Realms, ou si le jeu est en
/// train de réécrire le fichier.
pub fn last_server(path: &Path) -> Option<RecentServer> {
    let bytes = std::fs::read(path).ok()?;
    parse(&bytes)
}

fn parse(bytes: &[u8]) -> Option<RecentServer> {
    let entries: Vec<Entry> = serde_json::from_slice(bytes).ok()?;
    let entry = entries.into_iter().next()?;
    (entry.kind == "multiplayer").then_some(RecentServer { address: entry.id, name: entry.name })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_last_server_only() {
        let log = br#"[{"type":"multiplayer","id":"mc.hypixel.net","name":"Hypixel","lastPlayedTime":"2026-10-02T18:04:11.204Z","gamemode":"adventure"}]"#;
        assert_eq!(parse(log), Some(RecentServer { address: "mc.hypixel.net".into(), name: "Hypixel".into() }));
        let world = br#"[{"type":"singleplayer","id":"Nouveau monde","name":"Nouveau monde","lastPlayedTime":"2026-10-02T18:04:11Z","gamemode":"survival"}]"#;
        assert_eq!(parse(world), None);
        assert_eq!(parse(br#"[{"type":"multipla"#), None);
    }
}
