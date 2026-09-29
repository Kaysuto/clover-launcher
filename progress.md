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
