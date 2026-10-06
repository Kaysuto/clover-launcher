//! Profil de la machine (mémoire, processeur, carte graphique) et niveau qui en découle, pour les
//! réglages de départ du jeu et des mods (CLO-280). Détecté une fois par lancement du launcher.

use std::sync::OnceLock;

use serde::Serialize;

/// Niveau de la machine ; mêmes noms que les préréglages du manifeste.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Modest,
    Standard,
    Powerful,
}

impl Level {
    pub fn key(self) -> &'static str {
        match self {
            Self::Modest => "modest",
            Self::Standard => "standard",
            Self::Powerful => "powerful",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    /// Mémoire vidéo dédiée ; `None` si le système ne la donne pas (puce Apple, pilote Linux).
    pub vram_mb: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub memory_mb: u64,
    pub cores: usize,
    pub gpu: Option<Gpu>,
    pub level: Level,
}

/// Une carte sans mémoire dédiée notable est intégrée au processeur.
const INTEGRATED_VRAM_MB: u64 = 1024;

pub fn level(memory_mb: u64, cores: usize, gpu: Option<&Gpu>) -> Level {
    let vram = gpu.and_then(|gpu| gpu.vram_mb);
    let apple = gpu.is_some_and(|gpu| gpu.name.starts_with("Apple"));
    // Puce Apple : mémoire partagée, mais carte graphique honorable ; le reste se juge à la RAM.
    let integrated = !apple && vram.is_some_and(|vram| vram < INTEGRATED_VRAM_MB);
    if memory_mb < 7 * 1024 || cores < 4 || integrated && memory_mb < 12 * 1024 {
        Level::Modest
    } else if memory_mb >= 15 * 1024 && cores >= 6 && (vram.is_some_and(|vram| vram >= 6 * 1024) || apple && memory_mb >= 15 * 1024) {
        Level::Powerful
    } else {
        Level::Standard
    }
}

pub fn profile() -> &'static Profile {
    static PROFILE: OnceLock<Profile> = OnceLock::new();
    PROFILE.get_or_init(|| {
        let memory_mb = crate::game::total_memory_mb();
        let cores = std::thread::available_parallelism().map_or(2, |cores| cores.get());
        let gpu = gpu();
        Profile { memory_mb, cores, level: level(memory_mb, cores, gpu.as_ref()), gpu }
    })
}

/// Carte graphique principale : celle qui a le plus de mémoire dédiée.
#[cfg(windows)]
fn gpu() -> Option<Gpu> {
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};
    // SAFETY: appels DXGI documentés ; chaque interface est libérée à sa sortie de portée.
    let factory: IDXGIFactory1 = unsafe { CreateDXGIFactory1() }.ok()?;
    let mut best: Option<Gpu> = None;
    for index in 0.. {
        let Ok(adapter) = (unsafe { factory.EnumAdapters1(index) }) else { break };
        let Ok(description) = (unsafe { adapter.GetDesc1() }) else { continue };
        if description.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
            continue;
        }
        let end = description.Description.iter().position(|&c| c == 0).unwrap_or(description.Description.len());
        let gpu = Gpu { name: String::from_utf16_lossy(&description.Description[..end]).trim().to_owned(), vram_mb: Some(description.DedicatedVideoMemory as u64 / 1024 / 1024) };
        if best.as_ref().is_none_or(|best| gpu.vram_mb > best.vram_mb) {
            best = Some(gpu);
        }
    }
    best
}

#[cfg(target_os = "macos")]
fn gpu() -> Option<Gpu> {
    let output = std::process::Command::new("system_profiler").args(["SPDisplaysDataType", "-json"]).output().ok()?;
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
    let card = report["SPDisplaysDataType"].as_array()?.first()?;
    let name = card["sppci_model"].as_str()?.to_owned();
    // « 8 GB » ou « 1536 MB » ; absent sur les puces Apple (mémoire partagée).
    let vram_mb = card["spdisplays_vram"].as_str().or(card["spdisplays_vram_shared"].as_str()).and_then(|text| {
        let (value, unit) = text.split_once(' ')?;
        let value: u64 = value.parse().ok()?;
        Some(if unit.starts_with('G') { value * 1024 } else { value })
    });
    let apple = name.starts_with("Apple");
    Some(Gpu { vram_mb: vram_mb.filter(|_| !apple), name })
}

#[cfg(target_os = "linux")]
fn gpu() -> Option<Gpu> {
    // NVIDIA : nvidia-smi ; AMD : mémoire vidéo dans sysfs ; sinon carte inconnue.
    if let Ok(output) = std::process::Command::new("nvidia-smi").args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]).output() {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some((name, vram)) = text.lines().next().and_then(|line| line.split_once(',')) {
            return Some(Gpu { name: name.trim().to_owned(), vram_mb: vram.trim().parse().ok() });
        }
    }
    let cards = std::fs::read_dir("/sys/class/drm").ok()?;
    cards.flatten().find_map(|card| {
        let bytes: u64 = std::fs::read_to_string(card.path().join("device/mem_info_vram_total")).ok()?.trim().parse().ok()?;
        Some(Gpu { name: "Carte graphique AMD".into(), vram_mb: Some(bytes / 1024 / 1024) })
    })
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn gpu() -> Option<Gpu> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(name: &str, vram_mb: Option<u64>) -> Gpu {
        Gpu { name: name.into(), vram_mb }
    }

    #[test]
    fn machines_get_a_level() {
        let gb = 1024;
        assert_eq!(level(4 * gb, 4, None), Level::Modest);
        assert_eq!(level(16 * gb, 2, None), Level::Modest);
        assert_eq!(level(8 * gb, 8, Some(&card("Intel(R) UHD Graphics", Some(128)))), Level::Modest);
        assert_eq!(level(16 * gb, 8, Some(&card("Intel(R) Iris(R) Xe", Some(128)))), Level::Standard);
        assert_eq!(level(16 * gb, 6, Some(&card("NVIDIA GeForce GTX 1650", Some(4 * gb)))), Level::Standard);
        assert_eq!(level(32 * gb, 12, Some(&card("NVIDIA GeForce RTX 4070", Some(12 * gb)))), Level::Powerful);
        assert_eq!(level(16 * gb, 8, Some(&card("Apple M2", None))), Level::Powerful);
        assert_eq!(level(8 * gb, 8, Some(&card("Apple M1", None))), Level::Standard);
        assert_eq!(level(16 * gb, 8, None), Level::Standard);
    }

    #[test]
    #[ignore = "matériel du poste"]
    fn detects_this_machine() {
        println!("{:?}", profile());
    }
}
