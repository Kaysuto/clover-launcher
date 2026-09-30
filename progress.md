# Progress Log

## Session : 2026-09-29

### Phase 1 : Cadrage & questions
- Contexte lu : `AGENTS.md` racine, `siteweb/AGENTS.md`, `siteweb/src/lib/minecraft-auth.ts`, doc proxy du plugin, mémoires Clover (migration 26.2, parc plugins, liaison tripartite, pack Content).
- Veille web : Rinaorc, Modrinth App, Lunar, Badlion, bibliothèques de lancement Node, Fabric/Iris 26.2 → `findings.md`.
- Création de `task_plan.md`, `findings.md` et `progress.md`.
- En attente : réponses aux 18 questions de `task_plan.md`.

### Phase 2 : Spec V1 & architecture
- Réponses aux 18 questions reçues ; décisions consignées dans `task_plan.md`.
- Vérifications : manifeste Mojang, Fabric 26.2, 25 mods Modrinth, DNS Cloudflare, Microsoft Store gratuit, R2 gratuit, licences des crates Rust, source des joueurs par mode → `findings.md`.
- `SPEC.md` rédigée (périmètre V1/V2, Tauri + cœur Rust, auth PKCE, manifeste signé, routes du site, distribution sans budget, risques).
- Mémoire `migration-minecraft-26-2` corrigée : 26.2 en prod, prochaine cible 26.4.
- En attente : validation de `SPEC.md` et 2 questions ouvertes (Mac, Rust).
- Questions ouvertes répondues : Mac disponible, Rust validé.
- Linear : le MCP connecté (`linear-jel`) donne accès au workspace Jelly, pas à `clover-games` → aucune issue créée.
- Poste de dev : Node 24.15, Visual Studio Build Tools 2022 (C++) présents ; **Rust absent** (rustup à installer avant le prototype).

### Phase 2 (fin) et Phase 4 (début)
- Kaysuto : Linear Clover connecté, Rust installé (1.98.1 MSVC), plateforme bureau Azure ajoutée.
- Linear : épopée CLO-266 (Coordination Clover Games), sous-tickets CLO-267 à CLO-277 avec dépendances, V2 = CLO-278 (Backlog). CLO-270 dans Plugin CloverCore, CLO-273 et CLO-276 dans Site web.
- Démarrage du prototype CLO-267.
- CLO-267 : scaffold Tauri 2 (react-ts, identifiant `fr.clovergames.launcher`) déplacé dans `launcher/`. `src-tauri/src/auth.rs` : PKCE + loopback, chaîne Xbox → XSTS → Minecraft, refresh token dans le coffre du système (keyring 4). Commandes `login`, `restore_session`, `logout` ; jeton Minecraft gardé côté Rust. UI provisoire dans `src/App.tsx`.
- Vérifié : `tsc --noEmit` OK, `cargo test` 2/2, `cargo clippy` sans alerte hors `minecraft_token` inutilisé (servira à CLO-268).
- Vérifié côté Microsoft : l'app Azure accepte `http://localhost:<port>` (page de connexion servie), alors qu'une URI non enregistrée renvoie `redirect_uri not valid`.
- Reste à valider par une vraie connexion : échange du code sans secret (client public) et `login_with_xbox` 200.
- Ligne `launcher/` ajoutée au tableau de `AGENTS.md` racine.
- CLO-267 validé par Kaysuto (connexion réelle OK) → Réalisé dans Linear.
- CLO-268 : module `src-tauri/src/game/` (`version.rs` règles/arguments/bibliothèques, `download.rs` téléchargements parallèles vérifiés SHA-1, `java.rs` runtimes Mojang, `install.rs`, `launch.rs`). Cible codée en dur : 26.2, Fabric 0.19.5, `play.clovergames.fr`. Dossier `~/.cloverlauncher/`, jeu dans `game/`, sortie du jeu dans `logs/game-output.log`. UI : bouton « Jouer » + barre de progression.
- Constats : 26.2 demande `java-runtime-epsilon` (Java 25.0.1, Mojang) ; Fabric 0.19.5 ne liste plus d'intermediary (26.x non obfusqué) et publie `fabric-loader` sans SHA-1 (lu sur Maven) ; pas de runtime Mojang pour Linux ARM.
- Vérifié : `cargo test` 8/8, clippy propre, `tsc --noEmit` OK.
- Reconnexion au démarrage : `login_with_xbox` a renvoyé HTTP 429 (chaque rebuild de `tauri dev` refaisait toute la chaîne). Correctif : session Minecraft (jeton + expiration) gardée dans le coffre du système et réutilisée tant qu'il reste plus d'1 h ; 429 → message « Trop de connexions… ». Déconnexion efface les deux entrées.
- Inspiration Laby Launcher ajoutée (demande de Kaysuto) : `findings.md` (veille), `SPEC.md` (aperçu 3D du skin sur l'accueil en V1 ; canal serveur ↔ mod façon LabyMod Server API, prise en charge de la LabyMod Server API par le plugin, bibliothèque de skins, amis, `.rpm`/Flathub), Linear CLO-269 et CLO-278.
- CLO-268 validé par Kaysuto : installation depuis un dossier vierge (~720 Mo) puis connexion au Lobby (`Connecting to play.clovergames.fr, 25565`) → Réalisé dans Linear. Logs `[game] Minecraft lancé` / `fermé (code …)` ajoutés.
- Constat serveur : pack de ressources Clover sans `min_format`/`max_format` (chargé en repli) et sprite `turntable_disk` 20×172 invalide. Consigné en commentaire sur CLO-268.
- Dépôt privé `Kaysuto/clover-launcher` créé, premier commit `6467fd2` poussé sur `main` (README, AGENTS.md ajoutés ; `.claude/`, `.serena/`, `manifest/dist/` ignorés).
- CLO-279 ouvert (Plugin CloverCore) : `writePackMeta` écrit `min_format`/`max_format` à la racine au lieu de `pack` ; `turntable_disk.png` 20×172 non multiple de 20.
- CLO-272 en cours : `manifest/prod.json` (source) + `manifest/manifest.mjs` (résolution Modrinth avec dépendances obligatoires, signature ed25519, `serial` anti-rejeu). Clé privée générée dans `Sécurités/clover-launcher-manifest.pem` (hors dépôt), clé publique `X/zKDL8d…` embarquée. Build prod : 18 mods du catalogue + 6 dépendances (fabric-api, cloth-config, placeholder-api, fabric-language-kotlin, yacl, searchables), tous disponibles en 26.2.
- Côté Rust (préparé dans `scratchpad/wip`, pas encore copié dans `src-tauri/` car Minecraft tournait et `tauri dev` relance l'appli à chaque modification) : `game/manifest.rs` (vérification, cache, anti-rejeu, `minLauncherVersion`), `game/mods.rs` (synchro de `mods/`), `Download.checksum` SHA-1/SHA-512. `cargo test` 13/13, clippy propre.
- Code CLO-272 copié dans `src-tauri/` après fermeture de Minecraft. Test réel avec `CLOVER_MANIFEST_DIR=manifest/dist/prod` : manifeste n°1790708181 vérifié et mis en cache, 6 mods par défaut + fabric-api + cloth-config installés dans `game/mods/`, Fabric charge 63 mods (sous-modules de Fabric API inclus), connexion à `play.clovergames.fr`.
- CLO-271 (partie R2) : Kaysuto a activé R2 dans le tableau de bord ; via le MCP Cloudflare (compte `fa46a912…`, zone `clovergames.fr`) : bucket `clover-launcher` (WEUR), domaine `cdn.clovergames.fr` (TLS ≥ 1.2), dépôt de `launcher/prod/manifest.json(.sig)` après vérification SHA-256. Restent : jeton R2 pour la CI, compte Microsoft Store.
- Launcher relancé sans `CLOVER_MANIFEST_DIR` : manifeste n°1790708181 lu et vérifié depuis `cdn.clovergames.fr` (aucun repli sur le cache), Minecraft lancé.
- Microsoft Store : produit « Clover Launcher » réservé (Application MSIX), identité du paquet consignée dans `SPEC.md` §3.7 et CLO-275.
- CLO-269 : maquettes codées en React (écrans réutilisables pour CLO-274) + planche `design/board.html` ; Tailwind v4, shadcn (switch, slider, dialog, tooltip), Montserrat, Lilita One, Monocraft (OFL, sous-ensemble), skinview3d ; icônes de l'appli régénérées depuis le monogramme officiel. Direction dans `design/README.md`. Éditeur Store souhaité : « Clover Games ».

## Session : 2026-09-30

### CLO-274 — branchement de l'interface
- Éditeur Store : on garde « Kaysuto Kimiya » (le nom d'éditeur n'est pas modifiable après l'inscription).
- Rust : `store.rs` (réglages + comptes dans `~/.cloverlauncher/launcher.json`, écriture atomique), multi-comptes dans `auth.rs` (clés `refresh:<uuid>` / `session:<uuid>`, migration automatique de l'ancien compte unique), `status.rs` (Server List Ping), `storage.rs` (espace par catégorie, nettoyage des vieux journaux), `skins.rs` (bibliothèque, skins par défaut lus dans le client, application via l'API Mojang), zone de notification, démarrage avec l'ordinateur (`--minimized`), instance unique, réglages appliqués au lancement (mémoire, arguments Java, plein écran, mods choisis, comportement au lancement).
- Piège : le coffre de Windows limite une entrée à 2 560 caractères ; la session n'y garde plus skin ni capes (relus à la reprise via `minecraft/profile`).
- Front : `App.tsx` réécrit (premier lancement, reconnexion, accueil, mods, skins, paramètres, plantage), `src/lib/api.ts`. Fonctions pas encore branchées masquées (`UPCOMING`) : notifications bureau, mise à jour auto, réglages recommandés, Steam, changer de dossier ; actualités, votes, notifications et mes mods vides en attendant leurs routes.
- Vérifié : `cargo test` 25/25, clippy propre, `tsc --noEmit` et `vite build` OK, lancement réel (capture de la fenêtre).

### CLO-273 — accueil branché sur le site, Quick Play par mode
- Site (`a72229c`, en ligne) : `/api/launcher/news` (`blog_posts`), `/status` (dernier échantillon du cron d'analytique + maintenance), `/votes` (`vote_totals.last_vote_at` du plugin). CLO-270 annulé : les joueurs par serveur existaient déjà côté site.
- Launcher : `site.rs` + commande `site_feed`, relue toutes les 60 s ; bandeau des votes, article à la une, actualités et joueurs par mode.
- Quick Play : `modes[].host` dans le manifeste (n°1790759444 publié sur R2, SHA-256 vérifié) ; un clic sur la carte lance `--quickPlayMultiplayer <host>`. DNS `*.play.clovergames.fr` (CNAME, hors proxy Cloudflare) créé. `send-on-join: true` mis sur tous les serveurs par Kaysuto.
- Reste : `forced_hosts` du proxy FlameCord (accès SFTP au proxy manquant) ; sans eux, un clic sur un mode mène au Lobby.
