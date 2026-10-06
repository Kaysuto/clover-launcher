# Clover Launcher

Launcher officiel de Clover Games pour Windows, macOS et Linux : connexion Microsoft, installation
de la version de Minecraft que fait tourner le réseau (Java, Fabric, mods choisis) et connexion
directe au serveur. Spécification : [SPEC.md](SPEC.md). Suivi : épopée Linear CLO-266.

L'écran **Instances** propose les vues Simple (familles de versions illustrées, correctif au
choix) et Expert (instances et réglages). Les instances personnelles Clover, Vanilla et Fabric
sont enregistrées : dossier de jeu partagé par défaut, séparé au choix, mods propres à chaque
instance. Retirer une instance conserve ses fichiers. Les versions Clover suivent le manifeste
signé ; Vanilla et Fabric ouvrent le menu Minecraft.

## Prérequis

- Node.js 24 et npm
- Rust stable (`rustup`), avec les outils de compilation C++ de Visual Studio sous Windows
- Dépendances système de Tauri 2 sous Linux (`webkit2gtk-4.1`, voir la doc Tauri)

## Commandes

```bash
npm install
npm run tauri dev        # launcher en développement (rechargement à chaud)
npm run tauri build      # installeurs de la plateforme courante
npm run install:local    # Windows : met à jour le launcher installé sur ce poste et le relance
cd src-tauri && cargo test && cargo clippy --all-targets
npx tsc --noEmit
```

## Manifeste

```bash
# Résout les mods sur Modrinth et signe (clé privée hors dépôt, dans Sécurités/ du workspace)
CLOVER_MANIFEST_KEY="../Sécurités/clover-launcher-manifest.pem" npm run manifest -- build prod

# Lancer le launcher sur un manifeste local (la signature reste vérifiée)
CLOVER_MANIFEST_DIR=manifest/dist/prod npm run tauri dev
```

En production, le manifeste se publie par la CI : Actions › Manifeste › Run workflow.

## Release

1. Monter `version` dans `src-tauri/Cargo.toml` (seule source : `tauri.conf.json` n'en a pas).
2. Committer, puis pousser le tag : `git tag v0.2.0 && git push origin v0.2.0`.
3. La CI (`.github/workflows/release.yml`) construit Windows, macOS et Linux, signe les paquets
   de mise à jour et publie sur `cdn.clovergames.fr/launcher/prod/` : paquets dans `<version>/`,
   puis `latest.json` (updater du launcher) et `downloads.json` (page `/launcher` du site).

Clé de l'updater : `Sécurités/clover-launcher-updater.key` (hors dépôt, sans mot de passe), clé
publique dans `tauri.conf.json`. Secrets du dépôt : `TAURI_SIGNING_PRIVATE_KEY`,
`CLOVER_MANIFEST_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

Le workflow produit aussi `msix-store` (artefact GitHub, pas sur le CDN) : le paquet MSIX à
soumettre dans Partner Center. En local, après `npm run tauri build` : `node scripts/msix.mjs`
(paquet) ou `node scripts/msix.mjs --layout` puis
`Add-AppxPackage -Register src-tauri/target/msix/layout/AppxManifest.xml` (mode développeur).

Build signé en local (Windows) :

```bash
TAURI_SIGNING_PRIVATE_KEY="../Sécurités/clover-launcher-updater.key" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run tauri build -- --bundles nsis
```

## Structure

| Chemin | Rôle |
|---|---|
| `src/` | Interface React + TypeScript |
| `src-tauri/src/auth.rs` | Connexion Microsoft → Xbox → Minecraft, jetons dans le coffre du système |
| `src-tauri/src/game/` | Manifeste, installation de Java/Minecraft/Fabric/mods, lancement |
| `src-tauri/src/instances.rs` | Instances enregistrées, dossiers et catalogues officiels de versions |
| `manifest/` | Sources du manifeste distant et script de résolution/signature |

Les données du joueur vivent dans `~/.cloverlauncher/` (jeu dans `game/`, sortie du jeu dans
`logs/game-output.log`). Les instances personnelles conservent leurs sources de mods et journaux
dans `instances/<id>/` ; leur dossier `game/` y est créé si la séparation est activée. Java,
bibliothèques et assets restent partagés.
