//! Statut d'un serveur par le protocole « Server List Ping » de Minecraft : ce que la liste des
//! serveurs du jeu affiche (en ligne, nombre de joueurs, icône). Ne demande aucun service du site.

use std::net::IpAddr;
use std::time::Duration;

use hickory_resolver::proto::rr::RData;
use hickory_resolver::TokioResolver;
use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const TIMEOUT: Duration = Duration::from_secs(6);
const DEFAULT_PORT: u16 = 25565;

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub online: bool,
    pub players: Option<u64>,
    pub max: Option<u64>,
    /// Icône du serveur (PNG 64×64 en `data:` URL), si le serveur en a une.
    pub favicon: Option<String>,
}

/// `address` : telle que le joueur la tape dans le jeu, `hôte` ou `hôte:port`.
pub async fn ping(address: &str) -> ServerStatus {
    let (host, port) = split(address);
    match tokio::time::timeout(TIMEOUT, query(host, port)).await {
        Ok(Ok(status)) => status,
        _ => ServerStatus { online: false, players: None, max: None, favicon: None },
    }
}

/// Découpe comme le jeu (`ServerAddress`) : port absent ou illisible = 25565, IPv6 entre crochets.
fn split(address: &str) -> (&str, u16) {
    let address = address.trim();
    let (host, port) = match address.strip_prefix('[') {
        Some(rest) => rest.split_once(']').map_or((rest, None), |(host, rest)| (host, rest.strip_prefix(':'))),
        // Plus d'un « : » : IPv6 sans crochets, donc sans port.
        None if address.matches(':').count() == 1 => address.split_once(':').map_or((address, None), |(host, port)| (host, Some(port))),
        None => (address, None),
    };
    (host, port.and_then(|port| port.parse().ok()).unwrap_or(DEFAULT_PORT))
}

/// Serveur réellement joint : comme le jeu, un enregistrement SRV `_minecraft._tcp.<hôte>` peut
/// rediriger une adresse sans port (ou en 25565) vers un autre hôte et un autre port.
async fn redirect(host: &str, port: u16) -> Option<(String, u16)> {
    if port != DEFAULT_PORT || host.parse::<IpAddr>().is_ok() {
        return None;
    }
    let resolver = TokioResolver::builder_tokio().ok()?.build().ok()?;
    let lookup = resolver.srv_lookup(format!("_minecraft._tcp.{host}.")).await.ok()?;
    let srv = lookup
        .answers()
        .iter()
        .filter_map(|record| match &record.data {
            RData::SRV(srv) => Some(srv),
            _ => None,
        })
        .min_by_key(|srv| srv.priority)?;
    Some((srv.target.to_utf8().trim_end_matches('.').to_owned(), srv.port))
}

async fn query(host: &str, port: u16) -> std::io::Result<ServerStatus> {
    let (target, target_port) = redirect(host, port).await.unwrap_or_else(|| (host.to_owned(), port));
    let mut stream = TcpStream::connect((target.as_str(), target_port)).await?;

    // Handshake avec l'adresse tapée, pas celle du SRV (comme le jeu) : un proxy s'en sert pour
    // choisir le serveur. Version du protocole indifférente pour un ping (-1), état suivant 1 = statut.
    let mut handshake = Vec::new();
    write_varint(&mut handshake, 0x00);
    write_varint(&mut handshake, -1);
    write_varint(&mut handshake, host.len() as i32);
    handshake.extend_from_slice(host.as_bytes());
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1);
    send_packet(&mut stream, &handshake).await?;
    send_packet(&mut stream, &[0x00]).await?;

    let _length = read_varint(&mut stream).await?;
    let _packet_id = read_varint(&mut stream).await?;
    let json_length = read_varint(&mut stream).await? as usize;
    if json_length > 1 << 20 {
        return Err(std::io::Error::other("réponse de statut trop longue"));
    }
    let mut json = vec![0u8; json_length];
    stream.read_exact(&mut json).await?;

    let value: serde_json::Value = serde_json::from_slice(&json).map_err(std::io::Error::other)?;
    Ok(ServerStatus {
        online: true,
        players: value["players"]["online"].as_u64(),
        max: value["players"]["max"].as_u64(),
        // Seule une image PNG est affichée : rien d'autre qu'un `data:` PNG n'arrive à l'interface.
        favicon: value["favicon"].as_str().filter(|icon| icon.starts_with("data:image/png;base64,")).map(str::to_owned),
    })
}

async fn send_packet(stream: &mut TcpStream, payload: &[u8]) -> std::io::Result<()> {
    let mut packet = Vec::with_capacity(payload.len() + 5);
    write_varint(&mut packet, payload.len() as i32);
    packet.extend_from_slice(payload);
    stream.write_all(&packet).await
}

fn write_varint(buffer: &mut Vec<u8>, value: i32) {
    let mut value = value as u32;
    loop {
        if value & !0x7F == 0 {
            buffer.push(value as u8);
            return;
        }
        buffer.push((value & 0x7F | 0x80) as u8);
        value >>= 7;
    }
}

async fn read_varint(stream: &mut TcpStream) -> std::io::Result<i32> {
    let mut result = 0i32;
    for position in 0..5 {
        let byte = stream.read_u8().await?;
        result |= ((byte & 0x7F) as i32) << (7 * position);
        if byte & 0x80 == 0 {
            return Ok(result);
        }
    }
    Err(std::io::Error::other("VarInt trop long"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Ping réel du serveur (`cargo test -- --ignored`).
    #[tokio::test]
    #[ignore]
    async fn pings_the_real_server() {
        let result = tokio::time::timeout(TIMEOUT, query("play.clovergames.fr", 25565)).await;
        println!("{result:?}");
        assert!(matches!(result, Ok(Ok(ServerStatus { online: true, .. }))));
    }

    /// `play.rinaorc.com` renvoie par SRV vers ses serveurs `javaN.rinaorc.com`.
    #[tokio::test]
    #[ignore]
    async fn follows_srv_records() {
        let (target, _) = redirect("play.rinaorc.com", DEFAULT_PORT).await.expect("enregistrement SRV");
        assert!(target.ends_with(".rinaorc.com") && target != "play.rinaorc.com", "{target}");
        assert!(ping("play.rinaorc.com").await.online);
    }

    #[tokio::test]
    #[ignore]
    async fn reads_the_favicon() {
        assert!(ping("mc.hypixel.net").await.favicon.is_some_and(|icon| icon.len() > 100));
    }

    #[test]
    fn splits_addresses_like_minecraft() {
        assert_eq!(split("mc.hypixel.net"), ("mc.hypixel.net", 25565));
        assert_eq!(split(" play.example.fr:25570 "), ("play.example.fr", 25570));
        assert_eq!(split("play.example.fr:abc"), ("play.example.fr", 25565));
        assert_eq!(split("[2001:db8::1]:25570"), ("2001:db8::1", 25570));
        assert_eq!(split("2001:db8::1"), ("2001:db8::1", 25565));
    }

    #[test]
    fn encodes_varints_like_minecraft() {
        let encode = |value| {
            let mut buffer = Vec::new();
            write_varint(&mut buffer, value);
            buffer
        };
        assert_eq!(encode(0), [0x00]);
        assert_eq!(encode(300), [0xAC, 0x02]);
        assert_eq!(encode(-1), [0xFF, 0xFF, 0xFF, 0xFF, 0x0F]);
    }
}
