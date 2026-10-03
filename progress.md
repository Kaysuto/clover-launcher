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
- Proxy FlameCord (VPS OVH, tmux) : `forced_hosts` des 5 modes appliqués, sauvegarde `config.yml.bak-20260930`, redémarré à 10:55 UTC sans joueur connecté. Vérifié par ping : chaque sous-domaine répond avec son serveur Paper 26.2. Premier test en jeu : arrivée au Lobby, car `balancer.on-join: true` de FlameCord passait avant les `forced_hosts` ; passé à `false` avec `force_default_server: true`, proxy relancé à 11:04 UTC (sauvegardes `*.bak-20260930*`).
- Site : Practice et Créatif affichés hors ligne à cause de leurs anciens ports de jeu dans `analytics_servers` (25562/25567 → RCON 25084/25085, corrigé en base) ; `rcon.end()` non rattrapé corrigé (`f5d13ae`). Le site est sur Coolify, plus sur Vercel.

## Session : 2026-10-01

### CLO-274 — comptes et « Mes mods »
- Barre de titre : le bouton du compte ouvre un menu (`AccountMenu`) pour changer de compte en un clic, en ajouter un ou ouvrir Paramètres › Générales ; bouton ✕ pour retirer un compte, partagé avec les paramètres. Le focus va sur le menu à l'ouverture, pas sur le premier ✕.
- « Mes mods » branché : `game/personal.rs` lit `fabric.mod.json` (ou repère Quilt, Forge, NeoForge), compare `depends.minecraft` à la version du serveur (plages Fabric : `>=`, `~`, `^`, `1.21.x`…) et, pour un mod incompatible, cherche sa version 26.2 sur Modrinth par empreinte SHA-512 (`/v2/version_files/update`). Fichiers dans `~/.cloverlauncher/personal-mods/`, désactivés dans `launcher.json` (`disabledPersonalMods`). Au lancement, les mods compatibles et activés sont copiés dans `game/mods/` ; un mod déjà fourni par le catalogue (même fichier ou même identifiant Fabric) est ignoré pour éviter le plantage « duplicate mod ».
- `dragDropEnabled: false` sur la fenêtre : sous Windows, Tauri interceptait les fichiers glissés et le glisser-déposer HTML (mods, skins) ne recevait rien.
- Vérifié : `cargo test` 32/32, clippy propre, `tsc --noEmit` OK, contrat de l'API Modrinth (un Sodium 1.21.4 renvoie `mc26.2-0.9.2-fabric`). Reste à tester dans l'application : ajout, glisser-déposer, mise à jour et lancement avec un mod personnel.
- Recherche de mods dans « Mes mods » (bouton « Rechercher un mod », la source n'est pas nommée dans l'interface) : `game/modrinth.rs` regroupe l'API Modrinth (recherche filtrée Fabric + 26.2 + côté client, version compatible, identification par empreinte). L'installation ajoute les dépendances obligatoires absentes ; les mods déjà présents sont reconnus par empreinte (« Installé »). Testé sur le vrai Modrinth (test ignoré `installs_from_modrinth_with_dependencies`) : Xaero's Minimap + Fabric API, rien de plus à la seconde installation. Les descriptions restent en anglais (texte des auteurs).
- Logos des mods du catalogue : `mods[].icon` (URL du logo Modrinth) ajouté par `manifest.mjs`, lu par `manifest.rs` (`#[serde(default)]`, compatible avec les manifestes déjà publiés), affiché dans une case d'inventaire (`ModIcon`, partagé avec la recherche). `Mod.version` manquait aussi dans `manifest.rs` : la version n'arrivait jamais sur les cartes, corrigé. Le manifeste publié n'a pas encore les logos : à reconstruire et republier.

## Session : 2026-10-02

### Accueil — Quick Play vers les autres serveurs déjà rejoints
- Jeu lancé avec `--quickPlayPath` (`has_quick_plays_support`) ; format vérifié sur le client 26.2 (`QuickPlayLog`, non obfusqué) : `[{"type":"multiplayer","id":<adresse>,"name":…,"lastPlayedTime":…,"gamemode":…}]`, fichier supprimé puis réécrit à chaque connexion avec la seule dernière. `game/quick_play.rs` le lit, `Stored::remember_server` tient l'historique (16, plus récent en tête), relu toutes les 5 s pendant la partie, à sa fermeture et au démarrage.
- `play` accepte `server` (refusé hors historique, `UnknownServer`) ; `game::Destination` remplace `mode`. Rich Presence : « Joue à Minecraft » sans adresse hors Clover.
- Accueil : `OtherServers`, une ligne de trois raccourcis à la place de l'astuce sous les modes (sinon la barre des mods sort de la fenêtre à 1100×680). Maquette : `design/board.tsx` (Hypixel, Funcraft, connexion directe).
- Icônes : `status.rs` renvoie `favicon` (seulement un `data:image/png`), accepte `hôte:port` (IPv6 entre crochets) et suit les SRV `_minecraft._tcp` (`hickory-resolver` ajouté) ; l'interface pingue les serveurs affichés une fois. Tests réseau ignorés : SRV de `play.rinaorc.com`, icône de Hypixel. Funcraft (SRV vers 25555) ne répond plus, même à la main. Deux serveurs seulement quand la colonne est étroite (`@container`, `@max-2xl:hidden`).
- Vérifié : `cargo test` 35/35 (6 ignorés, dont les 3 tests réseau passés à part), clippy propre, `tsc --noEmit` OK, captures de la maquette à 1100×680 et 1440×900. Reste à tester en jeu : rejoindre un autre serveur, vérifier qu'il apparaît au retour, le relancer depuis l'accueil.

### Manifeste n°1790960017 publié sur R2
- Reconstruit avec les logos des mods (`mods[].icon`) ; seul changement de version : chat-heads 1.3.0 → 1.3.1. Modes, serveur et `minLauncherVersion` inchangés.
- Envoyé par l'API Cloudflare (pas de wrangler sur le poste, l'API ne relit pas les objets R2) ; SHA-256 de `manifest.json` et `.sig` vérifiés avant l'envoi puis sur `cdn.clovergames.fr`.

## Session : 2026-10-03

### CLO-276 — page `/launcher` du site
- Site (non commité) : `src/app/(main)/(public)/launcher/page.tsx`, `src/lib/launcher-release.ts` (lecture et validation Zod de `downloads.json`), `src/hooks/use-visitor-platform.ts` (détection de l'OS, rendu serveur neutre), `src/components/launcher/` (bouton du hero, guides de première ouverture). Carte « Le plus simple : le Clover Launcher » en tête de `/jouer`, affichée seulement une fois une version publiée ; `/launcher` ajouté au sitemap.
- Contrat `downloads.json` consigné dans `SPEC.md` §3.7, à produire par la CI (CLO-275). Tant qu'il manque (404 aujourd'hui), la page affiche « En test, bientôt disponible ».
- Capture de l'accueil : `design/board.html?screen=home` à 1100×680 ×2, serveurs tiers (Hypixel, PikaNetwork) remplacés par l'astuce avant la capture, coins arrondis détourés, enregistrée en `siteweb/public/launcher/accueil.webp`. À refaire quand l'interface change.
- Vérifié : Vitest 29/29 (7 nouveaux), `tsc --noEmit` et ESLint propres. Rendu contrôlé en local dans les deux états (sans version ; version simulée avec Store), vu en visiteur Windows, macOS et Android.

### Console du jeu (demande de Kaysuto, façon Modrinth App / Lunar Client)
- `game/console.rs` : sorties du jeu lues par tubes au lieu d'être branchées sur le fichier. Les évènements XML log4j (configuration de journalisation de Mojang) deviennent des entrées (heure, fil, niveau, logger, message, exception) ; une ligne hors XML reste brute, et sur la sortie d'erreur « WARNING… » compte comme avertissement, le reste comme erreur. Jeton Minecraft masqué s'il apparaît. Chaque ligne est recopiée dans `logs/game-output.log` (`LineWriter`, fichier à jour pendant la partie). 10 000 entrées en mémoire ; au démarrage, les 4 derniers Mo du journal de la dernière partie sont relus.
- Commande `game_console(after)` (curseur sur `id`, `session` qui change à chaque lancement) à la place de `game_log_tail` ; l'écran de plantage montre les 40 dernières entrées de la console. La fermeture n'est annoncée qu'après la fin de la sortie (3 s au plus si un processus enfant garde les tubes).
- Écran « Console » dans la colonne de gauche (`ConsoleScreen`, interrogé toutes les 500 ms quand il est ouvert) : filtres par niveau avec compteurs, recherche, « Copier » au format de `latest.log`, « Ouvrir les journaux », suivi des dernières lignes. Maquettes `console` et `console-live`. `content-visibility: auto` retiré des lignes : la hauteur estimée empêchait de rester collé en bas.
- Changement de comportement : avec « Fermer le launcher » au lancement (sans zone de notification), `game-output.log` s'arrête quand le launcher se ferme ; `game/logs/latest.log` du jeu reste complet.
- Vérifié : `cargo test` 42/42 (7 ignorés), clippy propre, `tsc --noEmit` OK, console réelle sur le journal de la dernière partie (210 entrées : 137 infos, 72 avertissements, 1 erreur), maquette à 3 000 lignes. Reste à tester en jeu : lignes en direct, plantage.
- « Effacer » dans la console (`clear_game_console` : le cœur Rust vide ses entrées sans changer de session ni de curseur, `game-output.log` reste complet ; une réponse en vol pendant l'effacement est ignorée). Accueil en jeu : « Minecraft est ouvert. Voir la console » sous « Jouer » (maquette `playing`). `cargo test` 43/43, clippy propre, `tsc` OK.
