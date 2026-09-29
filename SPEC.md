# Clover Launcher — Spécification V1 et architecture

Statut : brouillon du 2026-09-29, à valider. Décisions issues des réponses de Kaysuto (voir `task_plan.md`).

## 1. Promesse

Un clic sur « Jouer » installe et lance **exactement** la version de Minecraft que fait tourner Clover Games (26.2 aujourd'hui, 26.4 ensuite), avec Fabric et des mods utiles au quotidien choisis par le joueur, puis le connecte au serveur.

Le launcher suit le serveur : la version, les mods et les modes sont décrits dans un **manifeste distant**. Passer le réseau en 26.4 revient à publier un nouveau manifeste, sans republier le launcher.

## 2. Périmètre

### V1

| Écran / fonction | Détail |
|---|---|
| Connexion | Microsoft uniquement. Le compte doit posséder Minecraft Java, sinon message clair et lien d'achat. Plusieurs comptes, bascule en un clic. |
| Accueil | Bouton « Jouer » (Quick Play sur `play.clovergames.fr`, arrivée au Lobby). Aperçu 3D du skin du compte actif (façon Laby Launcher). Cartes des 6 modes avec le nombre de joueurs connectés. Actualités du blog du site. Bandeau de maintenance. |
| Mods | Catalogue organisé (performance, confort), chaque mod activable/désactivable. Un mod indisponible pour la version du serveur est grisé. |
| Paramètres | RAM (automatique ou manuelle), dossier du jeu, arguments Java avancés, canal bêta (staff). |
| Installation | Java, Minecraft, Fabric et mods téléchargés, vérifiés (hash), reprise après coupure. |
| Mises à jour | Launcher mis à jour automatiquement ; contenu du jeu resynchronisé à chaque lancement. |
| Plantages | Accord demandé au premier lancement. Plantage du launcher envoyé à Sentry si accepté. Plantage du jeu : écran dédié avec copie du log. |
| Langue | Français uniquement. |

### V2 (après la bêta)

- Mod Fabric **Clover** : signale au serveur que le joueur vient du launcher (bonus : cosmétiques, boosts), envoie directement sur le mode choisi depuis sa carte.
- **Canal serveur ↔ mod Clover**, sur le modèle de la LabyMod Server API : Discord Rich Presence piloté par le serveur (mode et partie en cours), fonctions autorisées par mode (par exemple une minimap permise en Créatif et bloquée en PvP, ce qui rouvrirait des mods exclus en V1), bannière de tablist.
- Côté plugin, indépendamment du launcher : prendre en charge la LabyMod Server API pour les joueurs déjà sous LabyMod (Discord RPC, mode de jeu en cours).
- Compte du site dans le launcher : boutique, succès, notifications.
- Discord Rich Presence, bibliothèque de skins avec aperçu avant lancement, amis connectés et leur mode sur l'accueil (module `friends` du plugin).

### Hors périmètre

Autres serveurs, parties solo mises en avant, installations multiples façon Modrinth, mods libres ajoutés par le joueur, comptes non premium.

## 3. Architecture

```
┌──────────────── Clover Launcher (Tauri 2) ────────────────┐
│ UI : React + TypeScript + Tailwind v4 + shadcn/ui          │
│      (tokens du thème « Dark Forest » du site)             │
│ Cœur Rust : auth · installation · lancement · mises à jour │
└───────┬───────────────┬────────────────┬──────────────────┘
        │               │                │
  Microsoft/Xbox   Mojang, Fabric,   cdn.clovergames.fr (Cloudflare R2)
  api.minecraft-   Modrinth (CDN     manifeste signé, binaires du
  services.com     publics)          launcher, images des modes
                                         │
                          clovergames.fr/api/launcher/* (siteweb, Vercel)
                          actualités · joueurs par mode · maintenance
                                         │
                          MySQL du plugin (statut des serveurs)
```

### 3.1 Technologie

**Tauri 2 + Rust**, installeur d'environ 10 Mo, la même base que Modrinth App. Electron pèse plus de 100 Mo, et sa mise à jour automatique sur macOS exige une app signée par Apple, donc payante.

Cœur de lancement **écrit en interne** : il ne gère qu'une version à la fois (celle du serveur) et Fabric, ce qui en limite fortement la taille. Les bibliothèques existantes ne conviennent pas à un dépôt privé : Theseus (Modrinth) et `lighty-launcher` sont sous GPL, `mc-launcher-core` (MIT) est peu maintenu.

Crates prévues : `reqwest` (rustls), `tokio`, `serde`, `sha1`/`sha2`, `keyring` (jetons dans le coffre du système), `sysinfo` (RAM), plugins Tauri `updater`, `single-instance`, `log`, `sentry`.

### 3.2 Authentification

1. OAuth 2.0 *authorization code* + PKCE dans le navigateur du système, redirection loopback `http://localhost:<port>` (RFC 8252). Client **public**, sans secret embarqué.
2. Microsoft → Xbox Live → XSTS → `login_with_xbox` → `entitlements/mcstore` → profil. Même chaîne que `siteweb/src/lib/minecraft-auth.ts`.
3. Refresh token Microsoft stocké dans le coffre du système : Gestionnaire d'identification Windows, Trousseau macOS, Secret Service sous Linux. Jamais en clair sur le disque.

**Réutilisation de l'app Azure du site** : l'approbation Mojang est attachée à l'ID de l'application. On ajoute à la même app une plateforme « Applications mobiles et de bureau » (redirection `http://localhost`) et on active les flux clients publics. Le secret du site reste côté Vercel. À vérifier au prototype : `login_with_xbox` doit répondre 200 depuis le launcher.

**Preuve d'identité envers le site (V2)** : le launcher n'envoie jamais son jeton Minecraft à Clover. Il appelle `sessionserver.mojang.com/session/minecraft/join` avec un nonce fourni par le site, puis le site vérifie via `hasJoined`, le mécanisme d'authentification des serveurs Minecraft. Le site délivre alors un jeton launcher court, lié à `users_meta.minecraft_uuid`.

### 3.3 Manifeste distant

Publié sur `cdn.clovergames.fr/launcher/<canal>/manifest.json` (canaux `prod` et `beta`), **signé en ed25519**. Le launcher embarque la clé publique et refuse un manifeste non signé. Sans cette signature, un accès volé au compte Cloudflare suffirait à pousser un mod malveillant chez tous les joueurs.

```json
{
  "schema": 1,
  "minecraft": { "version": "26.2", "sha1": "<sha1 du JSON de version Mojang>" },
  "fabric": { "loader": "0.19.5" },
  "server": { "host": "play.clovergames.fr" },
  "modes": [
    { "id": "bedwars", "name": "BedWars", "image": "https://cdn.clovergames.fr/launcher/modes/bedwars.webp" }
  ],
  "mods": [
    {
      "id": "sodium", "name": "Sodium", "category": "performance",
      "default": true,
      "url": "https://cdn.modrinth.com/data/…/sodium-….jar",
      "sha512": "…", "size": 1234567
    }
  ],
  "minLauncherVersion": "1.0.0"
}
```

Source dans le dépôt (`manifest/prod.json`, `manifest/beta.json`). Un script résout les versions Modrinth compatibles avec la version cible et fige URL et hash. La CI vérifie, signe et envoie le fichier sur R2. L'historique git sert de journal des changements de version.

### 3.4 Installation et lancement

- **Dossier du jeu** : `~/.cloverlauncher/` sur les trois OS, séparé de `.minecraft`, modifiable. Hors d'`AppData`, il échappe aussi à la virtualisation MSIX (voir 3.7).
- **Java** : le composant indiqué par le JSON de version (`javaVersion.component`, Java 25 pour 26.x) est pris dans le manifeste des runtimes Mojang, avec Adoptium en secours pour une plateforme absente.
- **Minecraft** : JSON de version, `client.jar`, bibliothèques filtrées par règles OS/architecture, index et objets d'assets. Hash vérifié, téléchargements parallèles, reprise.
- **Fabric** : profil `meta.fabricmc.net/v2/versions/loader/<mc>/<loader>/profile/json`, fusionné avec le JSON vanilla.
- **Mods** : depuis le CDN Modrinth (URL + sha512 figés dans le manifeste). Les jars absents du manifeste sont retirés de `mods/`.
- **Lancement** : arguments JVM et jeu reconstruits, `-Xmx` selon le réglage RAM, `--quickPlayMultiplayer play.clovergames.fr`.
- **RAM automatique** : quart de la mémoire totale, borné entre 2 et 6 Go.

### 3.5 Catalogue de mods V1

Tous disponibles pour Fabric 26.2 (Modrinth, vérifié le 2026-09-29) :

- **Performance** (activés par défaut) : Sodium, FerriteCore, ImmediatelyFast, EntityCulling, More Culling, Dynamic FPS.
- **Visuel** (désactivés par défaut) : Iris, Continuity, Sodium Extra, Reese's Sodium Options.
- **Confort** (désactivés par défaut) : Mod Menu, Zoomify, AppleSkin, Chat Heads, Mouse Tweaks, Shulker Box Tooltip, Controlling, BetterF3.
- **Exclus** : minimaps (Xaero's), freelook et tout ce qui avantage en PvP. ModernFix n'existe pas encore pour 26.2.

Chaque ajout est testé contre Vulcan en bêta : un mod qui provoque des faux positifs est retiré.

### 3.6 Routes du site (`siteweb/src/app/api/launcher/`)

| Route | Contenu | Source |
|---|---|---|
| `GET /api/launcher/news` | 5 derniers articles publiés : titre, extrait, image, URL | table `blog_posts` |
| `GET /api/launcher/status` | Joueurs par mode, état de maintenance | MySQL (nouvelle table ci-dessous) + logique de `api/maintenance-status` |
| `GET /api/launcher/session/challenge`, `POST /api/launcher/session` | Preuve d'identité `hasJoined` (V2) | Mojang + `users_meta` |

**Joueurs par mode** : aucune donnée n'existe aujourd'hui, les backends restent derrière le proxy. Chaque serveur écrira toutes les 15 s une ligne `clover_server_status(server_name, online, max, updated_at)` indexée par `storage.server-name`. Le site la lit avec sa connexion MySQL de lecture. Côté plugin, une nouvelle table impose une nouvelle version de baseline SQL : ne pas modifier une baseline déjà appliquée.

### 3.7 Distribution sans budget

| OS | Canal principal | Signature | Mises à jour |
|---|---|---|---|
| Windows | **Microsoft Store** (inscription gratuite pour les particuliers depuis 2025, vérification d'identité) | MSIX signé gratuitement par Microsoft | Gérées par le Store |
| Windows | `.exe` NSIS sur le site (secours) | Aucune : SmartScreen affiche « Informations complémentaires → Exécuter quand même » | Updater Tauri |
| macOS | `.dmg` universel (Intel + Apple Silicon) sur le site, testé sur le Mac de l'équipe | Ad hoc seulement : guide « Réglages → Confidentialité et sécurité → Ouvrir quand même » | Updater Tauri |
| Linux | AppImage + `.deb` + `.rpm` sur le site ; Flathub plus tard (gratuit) | Inutile | Updater Tauri (AppImage) |

- L'**updater Tauri** vérifie une signature ed25519 gratuite, indépendante de la signature du système : une mise à jour non signée par Clover est refusée.
- Les binaires et `latest.json` sont servis depuis R2 : les releases d'un dépôt GitHub privé ne se téléchargent pas publiquement.
- Plus tard, si macOS compte : Apple Developer Program (99 $/an) supprime l'alerte Gatekeeper.
- **Cloudflare R2** reste gratuit à cette échelle : 10 Go stockés, 1 M d'écritures et 10 M de lectures par mois, sortie de données gratuite. `clovergames.fr` est déjà chez Cloudflare, donc `cdn.clovergames.fr` se branche en quelques clics. Activer R2 peut exiger d'enregistrer une carte ou un compte PayPal.
- **Page `/launcher` du site** : détection de l'OS, badge Microsoft Store, liens directs, guides d'ouverture macOS et Windows.

### 3.8 CI

GitHub Actions sur un dépôt privé `Kaysuto/clover-launcher` : lint, tests Rust et TS, build Windows/macOS/Linux, signatures updater et manifeste, envoi sur R2. Les minutes gratuites d'un dépôt privé sont limitées et macOS en consomme le plus : builds complets seulement sur tag de release.

## 4. Risques à lever au prototype

1. `login_with_xbox` doit accepter l'app Azure du site depuis un client public. Sinon : nouvelle demande d'approbation Mojang, délai inconnu.
2. MSIX + Store : un launcher qui télécharge et exécute Java est accepté (Steam, Epic et EA App sont sur le Store), mais il faut valider la politique 10.2 et le comportement de Java lancé depuis un paquet MSIX avec une soumission de test.
3. Vulcan : faux positifs possibles avec certains mods de confort.
4. 26.4 : mods Fabric pas tous prêts le jour de la bascule. Le launcher grise les mods manquants, le serveur ne doit donc pas attendre.

## 5. Découpage (Linear, équipe CLO, projet existant)

1. Prototype : auth, installation 26.2 + Fabric, Quick Play (Windows).
2. Manifeste signé, script de résolution Modrinth, publication R2.
3. UI V1 : connexion, accueil, mods, paramètres, installation.
4. Plugin : table `clover_server_status`. Site : `/api/launcher/news` et `/status`.
5. Packaging 3 OS, updater, CI, soumission Store.
6. Page `/launcher` du site, bêta staff, puis lancement public.
7. V2 : mod Clover, session site, bonus, envoi direct sur un mode, Discord RPC, skins, amis.
