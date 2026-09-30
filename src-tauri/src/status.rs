//! Statut du serveur par le protocole « Server List Ping » de Minecraft : ce que la liste des
//! serveurs du jeu affiche (en ligne, nombre de joueurs). Ne demande aucun service du site.

use std::time::Duration;

use serde::Serialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Debug, Clone, Serialize)]
pub struct ServerStatus {
    pub online: bool,
    pub players: Option<u64>,
    pub max: Option<u64>,
}

pub async fn ping(host: &str, port: u16) -> ServerStatus {
    match tokio::time::timeout(TIMEOUT, query(host, port)).await {
        Ok(Ok(status)) => status,
        _ => ServerStatus { online: false, players: None, max: None },
    }
}

async fn query(host: &str, port: u16) -> std::io::Result<ServerStatus> {
    let mut stream = TcpStream::connect((host, port)).await?;

    // Handshake : version du protocole indifférente pour un ping (-1), état suivant 1 = statut.
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
