# Clover Launcher

Launcher officiel de Clover Games pour Windows, macOS et Linux : connexion Microsoft, installation
de la version de Minecraft que fait tourner le réseau (Java, Fabric, mods choisis) et connexion
directe au serveur. Spécification : [SPEC.md](SPEC.md). Suivi : épopée Linear CLO-266.

## Prérequis

- Node.js 24 et npm
- Rust stable (`rustup`), avec les outils de compilation C++ de Visual Studio sous Windows
- Dépendances système de Tauri 2 sous Linux (`webkit2gtk-4.1`, voir la doc Tauri)

## Commandes

```bash
npm install
npm run tauri dev        # launcher en développement (rechargement à chaud)
npm run tauri build      # installeurs de la plateforme courante
cd src-tauri && cargo test && cargo clippy --all-targets
npx tsc --noEmit
```

## Structure

| Chemin | Rôle |
|---|---|
| `src/` | Interface React + TypeScript |
| `src-tauri/src/auth.rs` | Connexion Microsoft → Xbox → Minecraft, jetons dans le coffre du système |
| `src-tauri/src/game/` | Manifeste, installation de Java/Minecraft/Fabric/mods, lancement |
| `manifest/` | Sources du manifeste distant et script de résolution/signature |

Les données du joueur vivent dans `~/.cloverlauncher/` (jeu dans `game/`, sortie du jeu dans
`logs/game-output.log`).
