# Clover Launcher — Spécification V1 et architecture

Statut : brouillon du 2026-09-29, à valider. Décisions issues des réponses de Kaysuto (voir `task_plan.md`).

## 1. Promesse

Identité du launcher (choix du 2026-10-05) : trèfle vert à quatre feuilles en pixel art,
variante `05-classic-block-fusion`, source transparente `src/assets/brand/launcher.png`.
Elle sert à la barre de titre, aux icônes des plateformes/installeurs et à la page `/launcher`
du site ; l'identité générale du serveur reste distincte.

Un clic sur « Jouer » installe et lance **exactement** la version de Minecraft que fait tourner Clover Games (26.2 aujourd'hui, 26.4 ensuite), avec Fabric et des mods utiles au quotidien choisis par le joueur, puis le connecte au serveur.

Le launcher suit le serveur : la version, les mods et les modes sont décrits dans un **manifeste distant**. Passer le réseau en 26.4 revient à publier un nouveau manifeste, sans republier le launcher.

## 2. Périmètre

### V1

| Écran / fonction | Détail |
|---|---|
| Premier lancement | Trois étapes. **Comptes** : plusieurs comptes Microsoft d'affilée (chacun doit posséder Minecraft Java), un compte principal. **Importer** : installations trouvées dans les autres launchers, une à la fois, avec le choix de ce qu'on reprend (voir 3.5 bis). **Terminé** : récapitulatif, réglages recommandés pour la machine, accord pour les rapports de plantage. |
| Connexion | Microsoft uniquement, sans écran séparé : l'étape Comptes sert aussi de reconnexion quand plus aucun compte n'est enregistré. Bascule entre comptes en un clic. |
| Version de Minecraft | La version qui sera lancée est écrite sous « Jouer » (« Minecraft 26.2 · Fabric », « · solo » si elle ne peut pas rejoindre le serveur). À droite du bouton, une dalle avec l'icône d'échange ouvre la liste, sur le modèle du Laby Launcher : la version du serveur en premier, les autres (solo, autres serveurs) avec l'avertissement « Ne peut pas rejoindre Clover Games ». Téléchargement à la demande, version choisie mémorisée. Quand le serveur change de version (manifeste), le launcher repasse d'office sur la nouvelle. |
| Accueil | Bouton « Jouer » (Quick Play sur `play.clovergames.fr`, arrivée au Lobby). Aperçu 3D du skin du compte actif (façon Laby Launcher). Cartes des 6 modes avec le nombre de joueurs connectés ; un clic lance le jeu directement sur le mode (voir 3.6 bis). Dessous, « Tes autres serveurs » : les trois derniers serveurs hors Clover Games rejoints en jeu, en raccourcis Quick Play (voir 3.6 ter). Actualités du blog du site. Bandeau de maintenance. |
| Mods | Deux onglets. **Catalogue Clover** : organisé (performance, visuel, confort), chaque mod activable, grisé s'il n'existe pas pour la version du serveur. **Mes mods** : mods ajoutés par le joueur (`.jar` ou import d'un autre launcher), non vérifiés, avec avertissement anticheat ; ceux faits pour une autre version ou un autre loader sont signalés et ne peuvent pas être activés, une mise à jour est proposée quand Modrinth en connaît une. Nom et logo viennent de Modrinth (sinon du `.jar`). **Recherche** Modrinth en une fenêtre, pour la version de l'instance choisie : mods Fabric, packs de ressources (`resourcepacks/`), shaders Iris (`shaderpacks/`, Iris activé dans le catalogue Clover ou installé dans une instance Fabric ; pas pour Vanilla), datapacks (dans le monde choisi) et modpacks Fabric (`.mrpack` : une nouvelle instance séparée, téléchargements limités aux hôtes autorisés par le format, chemins confinés à l'instance). Ouverte depuis Mes mods, les onglets de la page d'une instance et le bouton Modpacks des instances. |
| Skins | Bibliothèque de skins (ajout d'un `.png`, neuf skins par défaut disponibles dès le premier démarrage, textures du client installé prioritaires), éditeur : texture, bras classiques ou fins, cape parmi celles du compte. Appliqué au compte Minecraft via l'API Mojang. Aperçu 3D en rotation horizontale seule. |
| Paramètres | Six onglets. **Générales** : comptes, démarrer avec l'ordinateur, zone de notification, notifications bureau, mises à jour, canal bêta (staff). **Apparence** : taille de l'interface, animations, skin animé, derniers votes. **Jeu** : mémoire, comportement du launcher au lancement, plein écran, réglages recommandés, Java et arguments avancés. **Stockage** : espace utilisé par catégorie, nettoyage, dossier du jeu. **Intégrations** : Discord, Steam (ajout du launcher à la bibliothèque), rapports de plantage. **À propos** : versions, aide. |
| Notifications | Cloche à gauche des paramètres, pastille du nombre de non lues. Réunit les notifications du site (achats, votes, annonces, succès) et les évènements du jeu (niveau gagné, succès, récompenses). Notification système quand la fenêtre est fermée. |
| Installation | Java, Minecraft, Fabric et mods téléchargés, vérifiés (hash), reprise après coupure. |
| Mises à jour | Launcher mis à jour automatiquement ; contenu du jeu resynchronisé à chaque lancement. |
| Discord | (ID d’application public `1556616919925268480`, embarqué dans `src-tauri/src/presence.rs`) Statut « Joue à Clover Games » via Discord Rich Presence : dans le launcher, puis en jeu avec la durée de la partie, logo Clover, tête du compte actif en petite image (Minotar, pseudo au survol) et boutons « Rejoindre le Discord » et « Site ». Désactivable dans les paramètres. Le mode en cours (BedWars, Practice…) arrive en V2 avec le mod Clover. |
| Console | Sortie du jeu en direct pendant la partie, sinon celle de la dernière partie (relue au démarrage du launcher). Filtres infos / avertissements / erreurs, recherche, copie des lignes affichées, « Effacer » (vide la console, pas le fichier journal), accès au dossier des journaux. Pendant la partie, « Voir la console » sous « Jouer » y mène. Le jeton Minecraft est masqué s'il apparaît dans la sortie. |
| Plantages | Accord demandé au premier lancement, désactivé par défaut, modifiable dans Paramètres › Intégrations. Plantage du launcher envoyé à Sentry si accepté (voir 3.8 bis). Plantage du jeu : écran dédié avec la fin de la console et sa copie. |
| Langue | Français uniquement. |

Zone de notification : clic gauche pour rouvrir le launcher ; menu compact avec Ouvrir,
Jouer (instance sélectionnée), Instances, Paramètres et Quitter, séparés par groupes.
Les raccourcis de l'application sont désactivés tant que la session n'est pas prête ; Jouer
est également désactivé pendant une installation ou une partie. Le lancement utilise le même
parcours que le bouton de l'accueil et conserve les protections Rust contre deux jeux simultanés.
Sous Windows, ce menu reprend le fond Clover `#14120F` et des coins de 14 px dans une
fenêtre transitoire transparente. Il se ferme par Échap, choix d'une action ou perte de focus.
Les autres plateformes conservent le menu natif, également utilisé en repli sous Windows.

### V2 (après la bêta)

- Mod Fabric **Clover** : signale au serveur que le joueur vient du launcher (bonus : cosmétiques, boosts), envoie directement sur le mode choisi depuis sa carte.
- **Canal serveur ↔ mod Clover**, sur le modèle de la LabyMod Server API : Discord Rich Presence piloté par le serveur (mode et partie en cours), fonctions autorisées par mode (par exemple une minimap permise en Créatif et bloquée en PvP, ce qui rouvrirait des mods exclus en V1), bannière de tablist.
- Côté plugin, indépendamment du launcher : prendre en charge la LabyMod Server API pour les joueurs déjà sous LabyMod (Discord RPC, mode de jeu en cours).
- Compte du site dans le launcher : boutique, succès, notifications.
- Discord Rich Presence détaillée : mode et partie en cours, fournis par le serveur au mod Clover. Amis connectés et leur mode sur l'accueil (module `friends` du plugin).

### Hors périmètre

Comptes non premium, loaders autres que Fabric, import de modpacks.

### Instances — première version (2026-10-05)

- Une instance Clover intégrée suit toujours le manifeste signé ; des instances personnelles Clover,
  Vanilla ou Fabric peuvent être créées. Versions personnelles : Minecraft 1.20 et suivantes,
  ainsi que 1.8.9, 1.12.2, 1.16.5, 1.17.1, 1.18.2 et 1.19.4 ; métadonnées officielles Mojang,
  snapshots masqués par défaut ; loaders compatibles issus de Fabric.
- Vue Simple : une carte illustrée par famille (26.1, 1.21, 1.20…) ; un clic choisit l'instance
  la plus récemment jouée de la famille, ou ouvre la création sur cette version. La barre du bas
  montre l'instance choisie (variante à lancer si la famille en a plusieurs), Modifier et Jouer.
  Vue Expert : toutes les instances avec recherche, tri, Jouer, dossier, modifier et retirer. Un
  clic sur une instance la choisit et ouvre sa page : Aperçu (temps de jeu, parties, moyenne, plus
  longue, barres du temps de jeu par jour ou par semaine sur 7 jours, 30 jours ou 6 mois comparé
  à la période d'avant, fiche, dernières parties avec plantages, serveurs
  rejoints), Mods (même écran que l'onglet Mods, sauf Vanilla), Mondes, Datapacks (ceux de tous
  les mondes, avec leur monde), Packs de ressources, Shaders (sauf Vanilla) et Captures. Comme dans
  « Mes mods », un pack publié sur Modrinth (reconnu par empreinte) prend le nom et le logo de son
  projet ; sinon le nom du fichier et le logo `pack.png` du pack. Empreintes gardées en mémoire tant
  que le fichier ne change pas. Packs de ressources, shaders et datapacks s'activent et se désactivent
  (un pack désactivé est rangé dans le sous-dossier `.disabled/`, que Minecraft et Iris ignorent, sous
  le même nom) ; packs, mondes (après confirmation, refusé pendant une partie Clover) et captures
  partent à la corbeille du système, jamais supprimés directement.
  Les parties sont enregistrées à la fermeture du jeu dans `play-history.json` (1000 au plus) ;
  les images (icônes de monde, captures) passent par le protocole `asset`, limité aux fichiers
  listés. Vue mémorisée. Création et modification passent par un même panneau, à droite de l’écran (non modal) :
  type, version (groupée par famille, Fabric le plus récent compatible choisi d'office), nom
  facultatif, dossier séparé, mémoire. Le sélecteur à droite de « Jouer » sur l'accueil liste les
  instances, en crée une nouvelle et mène à l'écran. Images embarquées du launcher officiel Mojang, panoramas client pour
  1.8 et 1.12. Arguments anciens et archives natives LWJGL pris en charge ; runtime Java dicté
  par Mojang. Les runtimes anciens ne sont pas fournis par Mojang pour macOS ARM natif.
- Sélection mémorisée ; « Jouer » de l'accueil lance toujours l'instance choisie.
- Dossier de jeu partagé `game/` par défaut ; dossier `instances/<id>/game/` en option. Aucun
  déplacement automatique : changer ce choix retrouve ou crée le dossier correspondant.
  Java, assets et bibliothèques restent mutualisés. La sélection/source des mods est propre à
  chaque instance et resynchronisée avant le lancement ; Vanilla ne charge aucun mod.
- Un seul jeu lancé depuis Clover à la fois : les installations et la synchronisation ne peuvent
  pas modifier un jeu encore ouvert, y compris après fermeture/réouverture du launcher.
- Retirer une instance retire uniquement son entrée ; ses mondes et autres fichiers restent sur
  disque. L'instance Clover intégrée ne peut pas être retirée. Aucun jeton ne passe à l'interface.
- Les instances personnelles ouvrent le menu
  Minecraft ; les raccourcis de modes sur l'accueil lancent toujours Clover.

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
                          clovergames.fr/api/launcher/* (siteweb, Coolify)
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

**Réutilisation de l'app Azure du site** : l'approbation Mojang est attachée à l'ID de l'application. On ajoute à la même app une plateforme « Applications mobiles et de bureau » (redirection `http://localhost`) et on active les flux clients publics. Le secret du site reste dans les variables du site (Coolify). À vérifier au prototype : `login_with_xbox` doit répondre 200 depuis le launcher.

**Preuve d'identité envers le site (V2)** : le launcher n'envoie jamais son jeton Minecraft à Clover. Il appelle `sessionserver.mojang.com/session/minecraft/join` avec un nonce fourni par le site, puis le site vérifie via `hasJoined`, le mécanisme d'authentification des serveurs Minecraft. Le site délivre alors un jeton launcher court, lié à `users_meta.minecraft_uuid`.

### 3.3 Manifeste distant

Publié sur `cdn.clovergames.fr/launcher/<canal>/manifest.json` avec sa signature `manifest.json.sig` (ed25519, base64). Le launcher embarque la clé publique et refuse un manifeste non signé ou mal signé. Sans cette signature, un accès volé au compte Cloudflare suffirait à pousser un mod malveillant chez tous les joueurs.

Le champ `serial` (horodatage de construction) croît à chaque publication : le launcher refuse un manifeste plus ancien que le dernier accepté, pour qu'on ne puisse pas lui rejouer une ancienne version signée. Le dernier manifeste valide est gardé dans `~/.cloverlauncher/manifest/` et sert hors ligne.

```json
{
  "schema": 1,
  "serial": 1790709000,
  "minLauncherVersion": "0.1.0",
  "minecraft": { "version": "26.2" },
  "fabric": { "loader": "0.19.5" },
  "server": { "host": "play.clovergames.fr" },
  "modes": [{ "id": "bedwars", "name": "BedWars", "image": null }],
  "mods": [
    {
      "id": "iris", "name": "Iris Shaders", "description": "Shaders : éclairage et ombres réalistes.",
      "category": "visual", "default": false, "hidden": false, "available": true,
      "version": "1.11.4+26.2-fabric", "requires": ["sodium"],
      "file": { "filename": "iris-….jar", "url": "https://cdn.modrinth.com/data/…", "sha512": "…", "size": 1234567 }
    }
  ]
}
```

- `hidden` : dépendance ajoutée par le script (Fabric API, Cloth Config…), jamais affichée, installée avec les mods qui la requièrent.
- `available` : faux si le mod ou l'une de ses dépendances n'a pas de version pour cette version de Minecraft ; le launcher le grise.
- `default` : état initial pour un nouveau joueur.
- `body` : description complète en français (Markdown), lue dans `manifest/descriptions/<slug>.md` ; remplace sur la page du mod la description Modrinth, souvent en anglais. Absente : la page garde celle de Modrinth. Le launcher la convertit et la nettoie (`modrinth::description_html`) avant affichage.

Source dans le dépôt : `manifest/<canal>.json` (version, loader, serveur, modes, catalogue par slug Modrinth avec catégorie, état par défaut et description en français). `node manifest/manifest.mjs build <canal>` résout sur Modrinth la version Fabric compatible de chaque mod et de ses dépendances obligatoires, fige URL, SHA-512 et taille, puis signe avec la clé désignée par `CLOVER_MANIFEST_KEY`. La CI publiera le résultat sur R2 (CLO-275). L'historique git des sources sert de journal des changements de version.

En développement, tant que le CDN n'existe pas, `CLOVER_MANIFEST_DIR=manifest/dist/prod` fait lire le manifeste local au launcher ; la signature reste vérifiée.

### 3.4 Installation et lancement

- **Dossier du jeu** : `~/.cloverlauncher/` sur les trois OS, séparé de `.minecraft`, déplaçable depuis Paramètres › Stockage (`location.rs`) : sélecteur de dossier du système, refus d'un dossier synchronisé (OneDrive, Dropbox, Google Drive, iCloud), sans droit d'écriture, dans l'actuel ou non vide (un sous-dossier « Clover Launcher » est alors créé). Renommage sur le même disque, sinon copie avec progression puis suppression de l'original ; un échec retire la copie et laisse l'original. L'emplacement est noté dans `location.json` du dossier de configuration de l'application, puis le launcher redémarre. Refusé pendant une partie ou une installation. Hors d'`AppData`, il échappe aussi à la virtualisation MSIX (voir 3.7).
- **Java** : le composant indiqué par le JSON de version (`javaVersion.component`, Java 25 pour 26.x) est pris dans le manifeste des runtimes Mojang, avec Adoptium en secours pour une plateforme absente.
- **Minecraft** : JSON de version, `client.jar`, bibliothèques filtrées par règles OS/architecture, index et objets d'assets. Hash vérifié, téléchargements parallèles, reprise.
- **Fabric** : profil `meta.fabricmc.net/v2/versions/loader/<mc>/<loader>/profile/json`, fusionné avec le JSON vanilla.
- **Mods** : depuis le CDN Modrinth (URL + sha512 figés dans le manifeste). Les jars absents du manifeste sont retirés de `mods/`. Dépendances obligatoires : déclarées par `requires` dans le manifeste pour le catalogue ; résolues sur Modrinth pour « Mes mods » (recherche, `.jar` ajouté à la main, import), sauf si la sélection Clover les fournit déjà.
- **Lancement** : arguments JVM et jeu reconstruits, `-Xmx` selon le réglage RAM, `--quickPlayMultiplayer play.clovergames.fr`. Sous Windows, titre de la fenêtre `Minecraft <version du jeu> | Clover <version du launcher>`, appliqué via l'API native, sans mod. Un mode interne sans interface du même exécutable suit uniquement la fenêtre GLFW du processus Java lancé (PID et date de création vérifiés), réapplique le titre s'il change et s'arrête avec le jeu ; il reste actif si le launcher se ferme. macOS et Linux gardent le titre fourni par Minecraft.
- **RAM automatique** : quart de la mémoire totale, borné entre 2 et 6 Go, 1 Go de plus avec Iris (shaders), jamais plus de la moitié de la mémoire.
- **Réglages recommandés** (CLO-280) : profil de la machine (`machine.rs` : mémoire, cœurs, carte graphique par DXGI sous Windows, `system_profiler` sous macOS, `nvidia-smi` ou sysfs AMD sous Linux) → niveau `modest`, `standard` ou `powerful`. Le manifeste signé publie un préréglage par niveau (`manifest/presets.json`, `common` ajouté à chacun) : lignes d'`options.txt` (avec `version:` = numéro de données du client, lu dans son `version.json`) et fichiers de `config/` (chemins sous `config/` seulement). Écrits au lancement d'une instance Clover s'ils n'existent pas ; « Rétablir les réglages recommandés » (Paramètres › Jeu) réécrit ceux de l'instance Clover Games et garde les anciens en `.bak`. Les serveurs du réseau (adresse principale et des modes) reçoivent une entrée cachée de `servers.dat` avec `acceptTextures` : le pack du serveur est accepté sans question. Sodium 0.9 suit les réglages graphiques du jeu : aucun fichier de Sodium n'est imposé ; Dynamic FPS et Entity Culling gardent leurs valeurs par défaut.

### 3.4 bis Steam (CLO-285)

« Ajouter à Steam » (Paramètres › Intégrations) écrit un raccourci « jeu non-Steam » « Clover Games » dans `userdata/<compte>/config/shortcuts.vdf` de chaque compte Steam du poste (KeyValues binaires, `src-tauri/src/steam.rs`), avec les images de la bibliothèque dans `config/grid/<appid>` (`p.png` 600×900, `.png` 920×430, `_hero.png` 1920×620, `_logo.png`, `_icon.png`, générées par `design/steam/make-art.py` et embarquées). `appid` : CRC32 de l'exécutable et du nom, bit haut levé, comme Steam. Steam est trouvé par le registre (`HKCU\Software\Valve\Steam`, `SteamPath`) ou ses dossiers habituels (macOS, Linux et Flatpak). Rien n'est écrit tant que Steam tourne (il réécrit le fichier en quittant) ; un `shortcuts.vdf` illisible n'est jamais touché ; l'ancien est gardé en `.bak` ; les autres raccourcis restent à l'identique. Version Store : lancement par `explorer.exe shell:AppsFolder\<famille>!CloverLauncher`. AppImage : chemin de `APPIMAGE`. « Retirer de Steam » enlève l'entrée et ses images.

### 3.5 Catalogue de mods V1

Tous disponibles pour Fabric 26.2 (Modrinth, vérifié le 2026-09-29) :

- **Performance** (activés par défaut) : Sodium, FerriteCore, ImmediatelyFast, EntityCulling, More Culling, Dynamic FPS.
- **Visuel** (désactivés par défaut) : Iris, Continuity, Sodium Extra, Reese's Sodium Options.
- **Confort** (désactivés par défaut) : Mod Menu, Zoomify, AppleSkin, Chat Heads, Mouse Tweaks, Shulker Box Tooltip, Controlling, BetterF3.
- **Exclus** : minimaps (Xaero's), freelook et tout ce qui avantage en PvP. ModernFix n'existe pas encore pour 26.2.

Chaque ajout est testé contre Vulcan en bêta : un mod qui provoque des faux positifs est retiré.

### 3.5 bis Import depuis les autres launchers

Détection au premier lancement (et depuis les paramètres) des installations du launcher officiel (`.minecraft`, `launcher_profiles.json`), de Modrinth App, de Prism Launcher / MultiMC et de CurseForge (`src-tauri/src/import.rs`).

- **Emplacements** : `.minecraft` dans `%APPDATA%` (Windows), `~/Library/Application Support/minecraft` (macOS), `~/.minecraft` (Linux), plus le `gameDir` de chaque profil de `launcher_profiles.json` ; `ModrinthApp/profiles/*` (et l'ancien `com.modrinth.theseus`) dans le dossier de données ; `PrismLauncher/instances/*` (ou `InstanceDir` de `prismlauncher.cfg`, Flatpak compris) et `multimc/instances/*` ; `~/curseforge/minecraft/Instances/*` et `~/Documents/curseforge/…`. Vérifiés sur Windows (officiel, Modrinth App) ; macOS et Linux à confirmer en bêta.
- **Version affichée** : profil officiel le plus récent, `mmc-pack.json` (Prism), `minecraftinstance.json` (CurseForge) ; pour Modrinth App, première ligne « Loading Minecraft … » du journal, car `app.db` contient aussi les comptes et n'est jamais ouvert.
- **Destination** : dossier de jeu de l'instance Clover intégrée. Une entrée déjà présente (même nom) est gardée ; `options.txt` remplacé est sauvegardé en `options.txt.bak` ; `servers.dat` est fusionné (adresses nouvelles seulement, entrées masquées ignorées). Copie entrée par entrée sous un nom provisoire puis renommée : un import interrompu se relance sans doublon. Refusé pendant une partie lancée par Clover.

- **Copié, jamais déplacé** : les autres launchers ne sont pas modifiés.
- **Repris au choix** : réglages et touches (`options.txt`, avec les réglages des mods de `config/`), serveurs enregistrés (`servers.dat`), packs de ressources, shaders, captures d'écran, mondes solo. Mondes et captures décochés par défaut (volumineux).
- **Mods** (décision de Kaysuto, 2026-10-06) : empreintes comparées au catalogue (API Modrinth `version_files`) ; les équivalents du catalogue sont activés plutôt que copiés. Les autres mods Fabric sont copiés dans « Mes mods » de l'instance Clover, activés comme un mod ajouté à la main ; un mod déjà présent (même identifiant Fabric) est gardé. Les mods Forge, NeoForge ou Quilt sont listés comme non repris. Leurs dépendances obligatoires (d'après leur version Modrinth) absentes de « Mes mods » et de la sélection Clover sont téléchargées pour la version du serveur ; une dépendance sans version compatible est signalée.
- **Recherche** : animée d'après les évènements réels du cœur Rust (`import-scan` : installations annoncées une à une, puis reconnaissance des mods). Le résultat est gardé pour la session : une réouverture l'affiche aussitôt et le rafraîchit ; seuls les mods ajoutés ou modifiés (taille, date) sont relus et seules les empreintes inconnues partent à Modrinth.
- **Versions** : une instance plus ancienne est acceptée ; Minecraft convertit réglages et mondes à l'ouverture.
- **Sécurité** : ne jamais lire les jetons ou comptes enregistrés par un autre launcher. Chaque compte passe par la connexion Microsoft du Clover Launcher.

### 3.6 Routes du site (`siteweb/src/app/api/launcher/`)

| Route | Contenu | Source |
|---|---|---|
| `GET /api/launcher/news` | 5 derniers articles publiés : titre, extrait, catégorie, image, URL | table `blog_posts` |
| `GET /api/launcher/status` | Joueurs par mode, état de maintenance | dernier échantillon de `server_samples` (`getServerHealth()`) + `site_settings` |
| `GET /api/launcher/votes` | 10 derniers votants (pseudo, heure) | `vote_totals.last_vote_at` du plugin, connexion Vote en lecture |
| `GET /api/launcher/session/challenge`, `POST /api/launcher/session` | Preuve d'identité `hasJoined` (V2) | Mojang + `users_meta` |

Chaque réponse porte `schema: 1` ; ne changer la forme qu'en incrémentant ce numéro, les anciens launchers lisent ces routes longtemps. Le cœur Rust les lit toutes les 60 s (`site.rs`, commande `site_feed`) ; `CLOVER_SITE_URL` remplace `https://clovergames.fr` en développement.

**Joueurs par mode** : le cron d'analytique du site interroge déjà chaque serveur en RCON toutes les 5 min (`analytics_servers`, dont le `slug` suit `storage.server-name` et les `modes[].id` du manifeste). Pas de table côté plugin (CLO-270 annulé). `online`/`players` valent `null` quand l'échantillon a plus de 20 min : la carte n'affiche alors pas de compteur.

Le compteur global de l'accueil additionne les joueurs des modes du manifeste à partir de ces mêmes données (un mode hors ligne contribue zéro). Si un mode manque ou si sa mesure est inconnue, le total est masqué. Le ping de `server.host` indique uniquement la disponibilité du serveur : son compteur peut ne couvrir que le Lobby.

### 3.6 quater Notifications (CLO-283)

- **Session du launcher sur le site** : `GET /api/launcher/session?uuid=` donne un `serverId` (HMAC de l'UUID et de la minute) ; le launcher l'annonce à Mojang (`session/minecraft/join`, jeton Minecraft resté sur le poste) ; `POST /api/launcher/session { uuid, name }` vérifie par `hasJoined` (minute en cours ou précédente) et rend un jeton signé de 30 jours lié à l'UUID (clé dérivée de `BETTER_AUTH_SECRET`). Jeton gardé en mémoire par le launcher, redemandé sur un 401.
- `GET /api/launcher/notifications` (Bearer) : 30 dernières notifications du compte du site lié (`users_meta.minecraft_uuid`), `linked: false` sinon ; `POST /api/launcher/notifications/read { ids? }`. Types du launcher : `purchase` (lien `/shop`), `reward` (type `success`), `announcement`.
- Launcher : relève toutes les 60 s fenêtre visible, 5 min sinon ; clic = page du site + lu ; « Tout marquer lu ». Compte non lié : la cloche propose `/settings/minecraft`. Bulle du système (`tauri-plugin-notification`) pour une nouvelle notification fenêtre cachée ou sans focus, si « Afficher les notifications sur le bureau » est actif.
- **Reste** : évènements du jeu (niveau, succès, récompenses) écrits par le plugin dans une table MySQL lue par le site ; non commencé (plugin et déploiement sur les 6 serveurs).

### 3.6 bis Quick Play par mode

Un mode dont l'entrée du manifeste porte `host` (ex. `bedwars.play.clovergames.fr`) devient cliquable : le launcher lance `--quickPlayMultiplayer <host>`. Sans `host`, la carte reste informative et le joueur passe par le Lobby. Activer un mode demande, dans l'ordre :

1. DNS : `*.play.clovergames.fr` vers la même cible que `play.clovergames.fr` (hors proxy Cloudflare).
2. Proxy FlameCord (VPS OVH, `/srv/flamecord/config.yml`, session tmux `flamecord`) : `forced_hosts` associe chaque adresse à son serveur (`bedwars.play.clovergames.fr: bedwars`). Lu au démarrage seulement : redémarrer le proxy après modification. Le répartiteur de FlameCord (`flamecord.yml`, `balancer.on-join`) doit rester à `false`, sinon il envoie tout le monde au Lobby avant les `forced_hosts` ; `force_default_server: true` garde `play.clovergames.fr` sur le Lobby au lieu du dernier serveur mémorisé (`locations.yml`). Un forced host ne joue qu'à la connexion initiale ; un serveur éteint renvoie vers `priorities` (Lobby).
3. Plugin : `pack.send-on-join: true` sur le backend cible, sinon un joueur arrivé sans passer par le Lobby n'a pas le resource pack. `ContentPackListener` évite déjà le renvoi aux joueurs transférés depuis un autre serveur Clover.
4. Manifeste : ajouter `host` au mode, puis publier.

### 3.6 ter Autres serveurs déjà rejoints

Le jeu est lancé avec `--quickPlayPath ~/.cloverlauncher/quick-play.json` : à chaque connexion, Minecraft remplace ce fichier par cette seule connexion (type, adresse, nom donné dans sa liste de serveurs). Le launcher le relit toutes les 5 s pendant la partie, à sa fermeture et au démarrage du launcher (partie jouée launcher fermé), et garde les 16 derniers serveurs multijoueur dans `launcher.json` (`recentServers`). L'accueil en montre trois (deux si la colonne est étroite, plutôt que trois noms tronqués), hors `play.clovergames.fr`, adresses des modes et leurs sous-domaines ; ils prennent la place de l'astuce sous les modes, faute de hauteur à 1100×680. Chacun porte l'icône que le serveur renvoie au ping (`server_status`, comme la liste du jeu), à défaut l'icône « lancer ». Le ping suit l'enregistrement SRV `_minecraft._tcp.<hôte>` comme le jeu (`hickory-resolver`) : sans lui, un serveur hors 25565 paraît hors ligne. Un clic lance `--quickPlayMultiplayer <adresse>` avec la version, Fabric et les mods de Clover : un serveur qui refuse la 26.2 refuse la connexion. Le cœur n'accepte qu'une adresse de cet historique. Discord affiche alors « Joue à Minecraft », sans l'adresse.

### 3.7 Distribution sans budget

| OS | Canal principal | Signature | Mises à jour |
|---|---|---|---|
| Windows | **Microsoft Store** (inscription gratuite pour les particuliers depuis 2025, vérification d'identité) | MSIX signé gratuitement par Microsoft | Gérées par le Store |
| Windows | `.exe` NSIS sur le site (secours) | Aucune : SmartScreen affiche « Informations complémentaires → Exécuter quand même » | Updater Tauri |
| macOS | `.dmg` universel (Intel + Apple Silicon) sur le site, testé sur le Mac de l'équipe | Ad hoc seulement : guide « Réglages → Confidentialité et sécurité → Ouvrir quand même » | Updater Tauri |
| Linux | AppImage + `.deb` + `.rpm` sur le site ; Flathub plus tard (gratuit) | Inutile | Updater Tauri (AppImage) |

- **Identité Microsoft Store** (produit « Clover Launcher », réservé le 2026-09-29, type Application MSIX) : `Package/Identity/Name` = `KaysutoKimiya.CloverLauncher`, `Package/Identity/Publisher` = `CN=7A72D843-0285-46BE-A2AB-807CB9EC917B`, `Package/Properties/PublisherDisplayName` = `Kaysuto Kimiya` (le nom d'éditeur d'un compte Partner Center ne peut pas être modifié après l'inscription : pour afficher « Clover Games », il faudrait un nouveau compte, de type société, et donc une nouvelle identité de paquet ; décision reportée). Le MSIX doit porter exactement ces valeurs. Tauri ne produit pas de MSIX : `scripts/msix.mjs` assemble l'exécutable, les logos et `scripts/msix/AppxManifest.xml` (version `X.Y.Z.0`, `runFullTrust`), puis `makeappx` ; la CI le publie en artefact `msix-store`. Le même exécutable sert au NSIS et au MSIX : lancé depuis un paquet (`src-tauri/src/msix.rs`, `GetCurrentPackageFullName`), le launcher ne cherche pas de mise à jour et masque « Mettre à jour automatiquement » ; « Démarrer avec l'ordinateur » y passe par la tâche de démarrage du paquet (`windows.startupTask`, coupée par défaut) au lieu de la clé `Run` du registre, virtualisée. Première soumission avant fin décembre 2026, sinon la réservation du nom expire.
- L'**updater Tauri** vérifie une signature ed25519 gratuite, indépendante de la signature du système : une mise à jour non signée par Clover est refusée.
- **Canal bêta** : `cdn.clovergames.fr/launcher/beta/` (manifeste et `latest.json`), à côté de `prod/`. Un tag de préversion (`v0.4.0-beta.1`) publie le launcher sur `beta` sans paquet Store ; le workflow « Manifeste » publie `manifest/beta.json` sur `beta`. Le réglage « Canal bêta » n'apparaît qu'aux comptes listés dans `betaTesters` du manifeste (UUID Minecraft), ou à qui l'a déjà activé. Un canal bêta sans publication suit prod ; chaque canal a son cache de manifeste (`manifest/beta/`), leurs numéros anti-rejeu ne se comparent pas.
- Les binaires et `latest.json` sont servis depuis R2 : les releases d'un dépôt GitHub privé ne se téléchargent pas publiquement.
- Le launcher vérifie `latest.json` au démarrage puis toutes les 6 h (il peut rester des jours dans la zone de notification). Réglage « Mettre à jour le launcher automatiquement » (actif par défaut) : téléchargement, installation et redémarrage aussitôt ; sinon, ou après un échec, la mise à jour est proposée dans un encart. Jamais pendant une partie lancée par le launcher. Le build MSIX du Store devra couper l'updater : le Store gère ses mises à jour.
- Plus tard, si macOS compte : Apple Developer Program (99 $/an) supprime l'alerte Gatekeeper.
- **Cloudflare R2** reste gratuit à cette échelle : 10 Go stockés, 1 M d'écritures et 10 M de lectures par mois, sortie de données gratuite. `clovergames.fr` est déjà chez Cloudflare, donc `cdn.clovergames.fr` se branche en quelques clics. Activer R2 peut exiger d'enregistrer une carte ou un compte PayPal.
- **Page `/launcher` du site** (`siteweb/src/app/(main)/(public)/launcher/`) : détection de l'OS, bouton Microsoft Store, liens directs, guides d'ouverture Windows, macOS et Linux. Elle lit `cdn.clovergames.fr/launcher/prod/downloads.json`, que la CI publie (CLO-275) après les binaires : `latest.json` ne convient pas, il pointe vers les paquets de mise à jour et non vers `.dmg`, `.deb` et `.rpm`. Tant que ce fichier manque, la page affiche « bientôt disponible ». Le bouton Store apparaît quand `MS_STORE_ID` (`siteweb/src/lib/constants/launcher.ts`) est renseigné.

  ```json
  {
    "schema": 1,
    "version": "0.2.0",
    "date": "2026-10-20T12:00:00Z",
    "files": [
      { "kind": "exe", "url": "https://cdn.clovergames.fr/launcher/prod/0.2.0/…-setup.exe", "size": 9123456, "sha256": "<64 hex>" }
    ]
  }
  ```

  `kind` : `exe`, `dmg`, `appimage`, `deb` ou `rpm` (le système s'en déduit). Les URL doivent être versionnées, en `https://cdn.clovergames.fr`. Un fichier invalide ou un format inconnu est ignoré sans masquer les autres. Changer la forme impose d'incrémenter `schema`.

### 3.8 CI

GitHub Actions sur un dépôt privé `Kaysuto/clover-launcher` : lint, tests Rust et TS, build Windows/macOS/Linux, signatures updater et manifeste, envoi sur R2. Les minutes gratuites d'un dépôt privé sont limitées et macOS en consomme le plus : builds complets seulement sur tag de release.

- `ci.yml` : sur `main` et les pull requests, Linux seul (`npm run build`, `cargo clippy -D warnings`, `cargo test`).
- `release.yml` : sur un tag `v<version>` égal à la version de `src-tauri/Cargo.toml`. Rejoue `ci.yml`, construit NSIS (Windows), `.app`/`.dmg` universels signés ad hoc (macOS), AppImage, `.deb`, `.rpm` (Ubuntu 22.04), puis `scripts/release.mjs` vérifie que rien ne manque et écrit `latest.json` et `downloads.json`, envoyés sur R2 après les paquets.
- `manifest.yml` : à la main ; résout le catalogue sur Modrinth, signe et publie le manifeste prod.

### 3.8 bis Rapports de plantage (Sentry)

Projet Sentry (région UE, `ingest.de.sentry.io`) ; DSN public par nature, embarqué dans `src-tauri/src/crash.rs` et transmis à l'interface par `system_info`. Rien ne part sans l'accord du joueur :

- **Cœur Rust** (crate `sentry`, transport `reqwest`/rustls déjà présent) : client créé au démarrage du launcher, `before_send` jette tout tant que `crash_reports` est faux ; paniques capturées (le gestionnaire envoie avant l'arrêt, même avec `panic = "abort"`). Ni suivi de session ni nom de machine ; dossier personnel remplacé par `~` dans les messages ; étiquette `canal` (prod ou beta), environnement `production` ou `development`, version `clover-launcher@<version>`.
- **Interface** (`@sentry/react`, `src/lib/crash-reports.ts`) : démarré seulement quand l'accord est donné, fermé quand il est retiré ; erreurs non rattrapées, promesses rejetées et erreurs de rendu React. Sans `BrowserSession`, sans rapports d'envoi, `dataCollection` coupé (utilisateur, cookies, en-têtes, corps, paramètres) ; dossiers personnels retirés des messages et du fil d'actions.
- Pas de traces de performance (OpenTelemetry) : hors du périmètre accepté par le joueur.

## 4. Risques à lever au prototype

1. `login_with_xbox` doit accepter l'app Azure du site depuis un client public. Sinon : nouvelle demande d'approbation Mojang, délai inconnu.
2. MSIX + Store : un launcher qui télécharge et exécute Java est accepté (Steam, Epic et EA App sont sur le Store), mais il faut valider la politique 10.2 et le comportement de Java lancé depuis un paquet MSIX avec une soumission de test.
3. Vulcan : faux positifs possibles avec certains mods de confort.
4. 26.4 : mods Fabric pas tous prêts le jour de la bascule. Le launcher grise les mods manquants, le serveur ne doit donc pas attendre.

## 5. Découpage (Linear, équipe CLO, projet existant)

1. Prototype : auth, installation 26.2 + Fabric, Quick Play (Windows).
2. Manifeste signé, script de résolution Modrinth, publication R2.
3. UI V1 : connexion, accueil, mods, paramètres, installation.
4. Site : `/api/launcher/news`, `/status` et `/votes`.
5. Packaging 3 OS, updater, CI, soumission Store.
6. Page `/launcher` du site, bêta staff, puis lancement public.
7. V2 : mod Clover, session site, bonus, Discord RPC, skins, amis.
