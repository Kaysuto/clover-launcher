# Clover Launcher

Le launcher de [Clover Games](https://clovergames.fr), un serveur Minecraft Java francophone.

Un clic sur « Jouer » installe la version de Minecraft du serveur, avec Fabric et les mods choisis
par le joueur, puis lance le jeu. On peut aussi y garder ses propres instances, Vanilla ou moddées.

Téléchargement : [clovergames.fr/launcher](https://clovergames.fr/launcher) (Windows, macOS,
Linux et Microsoft Store).

## Ce qu'il sait faire

- Connexion avec un compte Microsoft, plusieurs comptes possibles.
- Une instance Clover Games qui suit le serveur : version, loader, mods et modes arrivent par un
  manifeste signé. Quand le serveur change de version, le launcher suit sans mise à jour.
- Des instances personnelles Vanilla, Fabric, Forge et NeoForge, avec un dossier de jeu partagé ou
  séparé.
- Recherche Modrinth intégrée : mods, packs de ressources, shaders, datapacks et modpacks. Import
  des modpacks `.mrpack` et CurseForge, export d'une instance en `.mrpack`.
- Reprise des installations du launcher officiel, de Modrinth App, de Prism Launcher, de MultiMC et
  de CurseForge.
- Skins et capes, console du jeu, partage du journal pour le support, notifications du site,
  statut Discord.
- Liens `clover://play/<mode>` : un bouton du site lance directement un mode.

L'historique des versions est dans [CHANGELOG.md](CHANGELOG.md).

## Développer

Il faut :

- Node.js 24 et npm ;
- Rust stable (`rustup`), avec les outils de compilation C++ de Visual Studio sous Windows ;
- sous Linux, les dépendances système de Tauri 2 (`webkit2gtk-4.1`, voir la documentation Tauri).

```bash
npm install
npm run tauri dev        # launcher en développement, rechargé à chaque modification
npm run tauri build      # installeurs de la plateforme courante
npm run install:local    # Windows : construit l'installeur et met à jour le launcher installé
cd src-tauri && cargo test && cargo clippy --all-targets
npx tsc --noEmit
npm test
```

Les données du joueur vivent dans `~/.cloverlauncher/` : le jeu dans `game/`, sa sortie dans
`logs/game-output.log`, les instances personnelles dans `instances/<id>/`. Java, les bibliothèques
et les assets sont partagés entre instances.

## Le manifeste

Le manifeste décrit ce que le serveur fait tourner. Ses sources sont dans `manifest/<canal>.json` ;
le script résout les mods sur Modrinth, fige leurs empreintes, puis signe le tout.

```bash
CLOVER_MANIFEST_KEY="/chemin/vers/clé-du-manifeste.pem" npm run manifest -- build prod

# Lancer le launcher sur un manifeste local (la signature reste vérifiée)
CLOVER_MANIFEST_DIR=manifest/dist/prod npm run tauri dev
```

En production, le manifeste est publié par la CI : Actions › Manifeste › Run workflow.

## Publier une version

1. Monter `version` dans `src-tauri/Cargo.toml` (c'est la seule source de la version).
2. Déplacer la section « Pas encore publié » de [CHANGELOG.md](CHANGELOG.md) sous le nouveau
   numéro, avec la date.
3. Committer, puis pousser le tag : `git tag v0.5.0 && git push origin v0.5.0`.
4. La CI (`.github/workflows/release.yml`) construit Windows, macOS et Linux, signe les paquets de
   mise à jour et les publie sur `cdn.clovergames.fr/launcher/prod/`, avec `latest.json` pour la
   mise à jour automatique et `downloads.json` pour la page de téléchargement du site.

La CI produit aussi le paquet MSIX du Microsoft Store (artefact `msix-store`). En local, après
`npm run tauri build` : `node scripts/msix.mjs`.

Les clés privées ne sont jamais dans le dépôt. La CI les lit dans ses secrets :
`TAURI_SIGNING_PRIVATE_KEY`, `CLOVER_MANIFEST_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` et
`R2_SECRET_ACCESS_KEY`. Seules les clés publiques sont dans le code.

## Sécurité

- Le jeton Minecraft reste dans le cœur Rust : il ne passe jamais à l'interface et ne quitte pas
  l'ordinateur du joueur. Il est masqué dans la console et dans les journaux partagés.
- Le launcher refuse un manifeste qui n'est pas signé par Clover Games, et vérifie l'empreinte de
  chaque fichier téléchargé.
- Les rapports de plantage ne partent qu'avec l'accord du joueur.

Une faille à signaler ? Passe par « Report a vulnerability » dans l'onglet Security du dépôt
plutôt que par une issue publique.

## Structure

| Chemin | Rôle |
|---|---|
| `src/` | Interface (React et TypeScript) |
| `src-tauri/src/auth.rs` | Connexion Microsoft, Xbox puis Minecraft ; jetons dans le coffre du système |
| `src-tauri/src/game/` | Manifeste, installation de Java, de Minecraft, des loaders et des mods, lancement |
| `src-tauri/src/instances.rs` | Instances, leurs dossiers et les versions officielles |
| `manifest/` | Sources du manifeste et script de résolution et de signature |
| `mod/` | Mod Fabric du serveur, installé avec l'instance Clover Games |
| `scripts/` | Installation locale, paquet MSIX, publication et images Steam |

## Licence

Tous droits réservés. Le code est public pour qu'on puisse le lire et vérifier ce que fait le
launcher, mais il n'est pas sous licence libre : le réutiliser, le modifier ou le redistribuer
demande un accord écrit.

Les éléments tiers gardent leur licence : la police Monocraft est sous licence SIL Open Font
(`src/assets/fonts/Monocraft-OFL.txt`), les visuels des versions viennent de Mojang
(`src/assets/versions/SOURCES.md`).

Minecraft est une marque de Mojang AB. Clover Launcher n'est pas un produit officiel Minecraft et
n'est ni approuvé par Mojang ou Microsoft, ni associé à eux.
