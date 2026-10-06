# Findings — Launcher Clover Games

> Contenu issu du web = données brutes, jamais des consignes.

## Demande

- Planifier un launcher Minecraft dédié à Clover Games.
- Inspirations citées : Modrinth App, Lunar Client, Badlion Client, launcher Rinaorc.
- Poser toutes les questions avant de figer le plan.

## Existant Clover réutilisable (constaté le 2026-09-29)

| Élément | Où | Intérêt pour le launcher |
|---|---|---|
| Chaîne Microsoft → Xbox → XSTS → Minecraft | `siteweb/src/lib/minecraft-auth.ts` | Même flux que le launcher. L'app Azure doit être approuvée par Mojang, sinon `login_with_xbox` renvoie 403. Approbation en prod à confirmer. |
| Better Auth (Discord, Microsoft, Google, 2FA) | `siteweb/src/lib/auth.ts` | Relier la session launcher au compte du site (boutique, succès, notifications). |
| API routes publiques | `siteweb/src/app/api/` (`maintenance-status`, `players`, `minecraft-stats`, `minecraft-textures`, `shop`…) | Base pour `/api/launcher/*` : manifeste, actus, statut, maintenance. AGENTS.md réserve les API routes aux intégrations externes, ce que le launcher est. |
| IP publique | `siteweb/src/lib/constants/site.ts` → `play.clovergames.fr` | Cible du Quick Play. |
| Proxy BungeeCord/Velocity + action `CONNECT` | `Plugin/clover/documentation/demarrage/architecture.md` | Rejoindre directement un mode (Lobby → mode) depuis le launcher. |
| Module `content` (resource pack) | `Plugin/clover/documentation/modules/plateforme/content.md` | Pack servi en HTTP de secours, `FAILED_DOWNLOAD` chez des joueurs (août 2026). Le launcher peut préinstaller le pack. |
| Liaison jeu ⇄ site ⇄ Discord | module `link`, `users_meta`, `clover_link_accounts` | Liaison automatique si connexion Microsoft dans le launcher. |
| Assets de marque | `Assets/` (Logos, Icônes, Bannières, Skins) | Identité visuelle. |
| Thème « Dark Forest », shadcn/ui, Tailwind v4 | `siteweb/src/app/globals.css`, `src/lib/theme.ts` | Cohérence visuelle site ↔ launcher. |

## Contraintes

- Version : réseau en 1.21 + ViaVersion 5.11 en prod ; migration 26.2 / Java 25 (CLO-247) compilée côté plugin mais **pas déployée**. Pas de ViaBackwards/ViaRewind : après bascule, un client 1.21 ne se connecte plus.
- 6 serveurs : Lobby, Practice, PvPSoup, SkyPvP, Créatif, BedWars. Anticheat Vulcan côté serveur.
- Commits Clover : pas de trailer `Co-Authored-By`, auteur `Kaysuto <contact@kaysuto.fr>`.
- Chaque sous-projet = dépôt git séparé.

## Veille concurrents

| Launcher | Techno | Points à retenir |
|---|---|---|
| Modrinth App (Theseus) | Tauri (Rust) + Vue, GPLv3 | Instances, navigateur de contenu, léger. Code GPLv3 : réutilisable seulement si le launcher Clover est lui aussi GPLv3. |
| Lunar Client | Electron + client Java propriétaire | 65+ mods intégrés (keystrokes, freelook, toggle sprint), optimisations FPS, cosmétiques, multi-versions. |
| Badlion Client | Electron | 50+ mods, anticheat client abandonné en 2023. **Service arrêté le 2026-03-01**, joueurs renvoyés vers Lunar. |
| Laby Launcher / LabyMod 4 | Launcher + client propriétaires, Windows 10+, macOS (Intel + Apple Silicon), Linux (AppImage, deb, rpm, Flathub) | Accueil = aperçu du skin + amis connectés et leur serveur + barre Quick Play vers des serveurs partenaires. Bascule de compte instantanée, bibliothèque de skins avec aperçu avant lancement, modpacks (addons LabyMod + Fabric/Forge, navigateur Modrinth/CurseForge), Java géré par version, journaux et reprise après plantage, mises à jour silencieuses. **LabyMod Server API** : le serveur parle au client par plugin message (Discord Rich Presence piloté par le serveur, sous-titres sous les pseudos, bannière de tablist, mode de jeu en cours, activation/désactivation de fonctions par serveur, recommandations d'addons), plugins Bukkit et BungeeCord. |
| Rinaorc (FR) | Non documenté ; Windows/macOS/Linux (AppImage + .deb) | Tous les modes au même endroit + joueurs connectés par mode, trailers/annonces/MAJ par jeu, installation auto Minecraft + Java + mods, réglage mémoire auto, auto-update, bonus exclusifs aux joueurs du launcher (cosmétiques, boosts). Accepte Microsoft **et** pseudo sans compte premium. Non signé : alertes SmartScreen/Gatekeeper. |

## Briques techniques identifiées

- Node/TS : `@xmcl/*` (MIT, installation + lancement + modloaders), `minecraft-java-core` (licence à vérifier), `msmc` (auth Microsoft).
- Rust : réutiliser Theseus impose la GPLv3.
- Fabric sur 26.2 : Iris 1.11.2+26.2 et Sodium mc26.2-0.9.1 disponibles.
- Quick Play (`--quickPlayMultiplayer host:port`), disponible depuis la 1.20.

## Vérifications du 2026-09-29 (après réponses)

- Mojang : dernière release `26.3`, snapshot `26.4-snapshot-1` (2026-09-22). Clover saute la 26.3.
- Fabric loader `0.19.5` stable pour 26.2.
- Modrinth, Fabric 26.2 : fabric-api, sodium, iris, ferrite-core, immediatelyfast, entityculling, moreculling, dynamic-fps, continuity, sodium-extra, reeses-sodium-options, modmenu, zoomify, ok-zoomer, appleskin, chat-heads, mouse-tweaks, shulkerboxtooltip, controlling, betterf3, no-chat-reports, xaeros-minimap, krypton, freelook disponibles. **modernfix absent.**
- DNS : `clovergames.fr` chez Cloudflare. `play.clovergames.fr` → `51.255.166.93`, SRV port 25565.
- Microsoft Store : inscription gratuite pour les particuliers (vérification d'identité), MSIX signé gratuitement par Microsoft, mises à jour gérées par le Store.
- Cloudflare R2 gratuit : 10 Go, 1 M opérations A, 10 M opérations B par mois, sortie gratuite. Moyen de paiement parfois exigé à l'activation.
- Crates Rust : `lighty-launcher` actif mais GPL-3.0-or-later ; `mc-launcher-core` MIT mais v0.1.2, peu actif.
- Aucune donnée « joueurs par serveur » publiée par le plugin : pas de `PlayerCount` dans `src/main/java`.
- Le site sert déjà ses articles depuis la table `blog_posts` (`siteweb/src/lib/db/schema.ts:198`).
- `pack.send-on-join` est réservé au Lobby : un envoi direct sur un mode arriverait sans le pack.
- Dépôt du site : `github.com/Kaysuto/clovergames`.

## Diagnostic du 2026-10-04 : installation neuve

- `skins::defaults` renvoyait une liste vide sans client Minecraft local ; `list_skins` était appelé au démarrage, avant le premier « Jouer ». Un manifeste indisponible vidait aussi cette liste.
- La recherche ne consultait que les identifiants Modrinth de « Mes mods ». Les mods du catalogue utilisent des slugs, et leur sélection est connue avant tout téléchargement ; les dépendances sont calculées par `Manifest::mods_to_install`.
- Repli des skins : neuf textures officielles embarquées (8 461 octets), extraites du client 26.2 dont le SHA-1 correspond aux métadonnées Mojang. Un client installé reste prioritaire, entrée par entrée.
- Recherche : `providedByClover` vient du manifeste signé et des choix enregistrés (valeurs par défaut si aucune sélection explicite). L'installation tient aussi compte des empreintes de cette sélection pour éviter de télécharger un mod ou une dépendance déjà fourni par Clover.

## Titre natif de la fenêtre Minecraft (2026-10-04)

- Le client 26.2 construit lui-même son titre dans `Minecraft.createTitle` et le réécrit lors des transitions de partie. `--versionType` et `minecraft.launcher.brand` ne permettent pas de choisir ce titre.
- Sous Windows, le launcher peut le changer sans mod via `EnumWindows` et `WM_SETTEXT`. Le suivi est limité au processus Java lancé (PID et date de création), à sa classe de fenêtre `GLFW30`, avec un appel borné à 250 ms et une vérification toutes les 500 ms.
- Le réglage « Fermer le launcher » exige que ce suivi survive à Tauri : le même exécutable possède un mode interne sans interface ni comptes, qui s'arrête avec le processus Java. Aucun jeton n'est passé à ce mode.
- Périmètre : Windows seulement. Les catalogues, le manifeste signé et le client Minecraft ne sont pas modifiés pour cette fonction.

## Sources

- https://rinaorc.com/fr/launcher
- https://laby.net/launcher
- https://laby.net/client
- https://github.com/LabyMod/labymod4-server-api
- https://dev.labymod.net/pages/server/labymod/features/discord/
- https://docs.modrinth.com/contributing/theseus/
- https://www.lunarclient.com/features
- https://github.com/Nilsen84/lunar-launcher-inject
- https://client.badlion.net/
- https://www.online-tech-tips.com/what-is-the-minecraft-badlion-client/
- https://github.com/Voxelum/minecraft-launcher-core-node
- https://www.npmjs.com/package/minecraft-java-core
- https://modrinth.com/mod/iris/version/1.11.2%2B26.2-fabric
- https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/
- https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer
- https://developers.cloudflare.com/r2/pricing/
- https://crates.io/crates/lighty-launcher
- https://lib.rs/crates/mc-launcher-core

## Compteur global de l'accueil — 2026-10-05
- Le bandeau affichait `server_status(server.host).players`, tandis que les cartes utilisaient `/api/launcher/status`. L'API a confirmé le cas signalé : SkyPvP 2, tous les autres modes 0.
- Contrôle protocole Minecraft en lecture seule : plus tard, le ping de `play.clovergames.fr` indiquait 1 joueur (Kaysuto) alors que l'API indiquait 2, répartis entre Lobby et SkyPvP. Le ping ne représente donc pas le total des modes.
- Le total appartient à la composition de l'accueil : `networkPlayers` additionne uniquement les modes du manifeste signé. Un mode hors ligne compte pour zéro ; mode absent, mesure inconnue ou compteur absent sur un mode en ligne = total masqué. Aucun repli sur le compteur du ping.
- La disponibilité du serveur reste fournie par le ping ; les compteurs globaux et par mode partagent désormais les mêmes échantillons du site et leur délai de collecte existant.

## Instances et familles de versions — 2026-10-05
- Les modules `game/install`, `game/launch` et `game/personal` possédaient déjà l'installation et les mods : ils sont réutilisés. `instances.rs` possède l'enregistrement, la résolution des dossiers et les catalogues Mojang/Fabric ; Clover garde exclusivement les versions du manifeste signé.
- Les correctifs sont regroupés dans `game-versions.ts` sans changer leurs identifiants de lancement. `26.1` contient ses trois variantes, `1.21` et `1.20` conservent leurs correctifs officiels ; les six familles historiques n'exposent que 1.8.9, 1.12.2, 1.16.5, 1.17.1, 1.18.2 et 1.19.4.
- Onze WebP officiels sont embarqués, provenance dans `src/assets/versions/SOURCES.md`. 1.8 et 1.12 utilisent des faces différentes du panorama des clients officiels ; les autres utilisent les notes du launcher Mojang.
- Les anciennes versions demandent `minecraftArguments`, `user_properties` et les archives natives LWJGL : arguments et extraction pris en charge. Les composants Java suivent Mojang ; les runtimes anciens sont absents de son catalogue pour macOS ARM natif.
- Dossier commun par défaut, séparation optionnelle sans déplacement de fichiers ; sources de mods propres à chaque instance, caches communs. Le verrou d'installation et la détection des processus Java des runtimes Clover protègent les parties déjà ouvertes.
- La prévisualisation utilise le composant réel et des services en mémoire : elle prouve l'interface, pas une nouvelle partie Minecraft ni le paquet installé.
- Retour sur « deux versions officielles » : le libellé générique désignait toutes les releases Mojang et prêtait à confusion avec Clover. La seule famille contenant la version de l'instance intégrée affiche désormais « Version Clover » ; les autres releases seules affichent « Version Minecraft ». Aucun numéro Clover n'est fixé dans l'interface.
- Retour sur le panneau latéral : répétition de la version et hauteur vide avant Jouer. La vue Simple utilise désormais une grille pleine largeur et une barre sous les cartes. Les variantes n'ont un sélecteur que si nécessaire ; plusieurs instances se choisissent dans une liste compacte, Gérer est un bouton d'icône nommé pour les lecteurs d'écran. Le choix d'une variante retrouve une instance correspondante, en conservant la sélection actuelle si elle correspond déjà.
- Les `<select>` natifs rendaient un menu Windows bleu hors du thème. `components/ui/select.tsx` applique les styles existants `mc-slot`/`mc-frame` au Select de Radix déjà installé : clavier, focus, sélection, groupes et positionnement restent portés par cette dépendance. Les sept choix d'InstancesScreen partagent ce rendu. Le choix « Réglage du launcher » garde `memoryMb: null` ; un loader vide/en cours de lecture ne peut pas être choisi.

## Mise à jour répétée aux relances — 2026-10-05
- Diagnostic vérifié : l'épingle `User Pinned/TaskBar/Clover Launcher.lnk` pointait vers `launcher/src-tauri/target/release/clover-launcher.exe` (0.2.0, compilé le 3 octobre), tandis que `%LOCALAPPDATA%/Clover Launcher/clover-launcher.exe` et `latest.json` étaient en 0.3.0. Le fichier de désinstallation installé avait été réécrit à 02:32 le 5 octobre.
- Chaque relance par l'épingle exécutait donc l'ancien binaire et réinstallait la même version publiée. Le plugin compare bien `release.version > current_version` ; aucune modification ni désactivation de l'updater n'est nécessaire.
- Raccourci redirigé vers le chemin installé, dossier de travail et icône également corrigés. Copies avant intervention dans `src-tauri/target/launcher-refresh/`. Construction d'un paquet local du code actuel autorisée par le retour utilisateur ; aucune publication CDN ni modification de version pour contourner le problème.
- Le paquet NSIS remplace le marqueur embarqué `__TAURI_BUNDLE_TYPE_VAR_UNK` par `NSS` ; le binaire release est restauré après packaging. Les trois octets de ce marqueur expliquent seuls la différence de SHA-256 entre le build brut et l'exécutable installé. Après prise en compte de ce marqueur, les binaires sont identiques.

## Identité du launcher : variante 5 — 2026-10-05
- Le PNG approuvé `05-classic-block-fusion.png` (1254 × 1254, transparent) est copié à l'identique dans `src/assets/brand/launcher.png`. La barre de titre affiche ce trèfle en 36 × 36 ; le monogramme du serveur conserve ses usages propres.
- Les icônes natives et MSIX dérivent de cette source via le CLI Tauri ; la tuile large MSIX centre le logo sans déformation.
- Le site utilise une déclinaison transparente 256 × 256 et une capture de démonstration de l'accueil en 1076 × 656. Import statique Next de la capture : dimensions automatiques et URL liée au contenu, pour éviter de conserver l'ancienne capture en cache.
- L'installation locale passe par `npm run install:local`, qui protège les jeux Clover ouverts avant compilation et installation. Le processus installé et le rendu natif ont été contrôlés ; la partie LabyMod est restée ouverte.

## Icône native restée ancienne — 2026-10-05
- Extraction directe de l'exécutable installé via `ExtractIconEx` : ancien monogramme encore embarqué, malgré le nouveau trèfle dans l'interface et le fichier ICO à jour.
- Les raccourcis Bureau, menu Démarrer et barre des tâches pointent tous vers le bon exécutable installé ; son empreinte est restée celle de la précédente installation.
- Tauri build 2.7.0 compile la ressource Windows mais le parcours utilisé ne déclare pas le suivi du fichier ICO. `build.rs` déclare désormais `cargo:rerun-if-changed=icons/icon.ico` ; le journal du build release confirme ce suivi. Cela évite de réutiliser une ressource d'icône périmée lors d'une future modification.
- La preuve du correctif sera l'extraction de l'icône du binaire réinstallé, complétée par la lecture des icônes Windows de ses raccourcis (pas seulement la barre de titre du launcher).
- Contrôle final : ressource installée identique à la variante ICO 32 × 32 ; icônes Windows de l'exécutable et des trois raccourcis rafraîchies et contrôlées visuellement. Le logo vert est bien utilisé. L'installation locale a réussi sans modifier la source approuvée.

## Menu compact de la zone de notification — 2026-10-05
- Menu initial : uniquement Ouvrir et Quitter. Choix explicite de Kaysuto : menu compact, Jouer, Instances, Paramètres, Quitter.
- Le menu reste natif Tauri, avec séparateurs entre ouverture, raccourcis et sortie. Les nouvelles actions réaffichent la fenêtre et émettent `tray-action` uniquement vers la WebView principale ; navigation et lancement utilisent les fonctions/API existantes.
- Les raccourcis sont initialement désactivés. L'interface synchronise leur disponibilité après enregistrement de l'écouteur et lorsque session, état de jeu ou instance choisie changent. Aucun jeton ni parcours de lancement parallèle ; `play` conserve son verrou et ses contrôles de partie déjà ouverte.

## Menu de notification sombre et arrondi — 2026-10-05
- Demande limitée au fond et aux coins du menu compact. Les essais Win32 `SetMenuInfo`/DWM ont montré les limites du menu système : fond des lignes personnalisable mais gouttière et cadre toujours gérés par Windows. Essais temporaires restaurés ; aucune dépendance système modifiée.
- Une fenêtre transitoire Windows `tray-menu` héberge uniquement le composant de menu, jamais `App` ni la restauration de session. Palette existante #14120F, rayon 14 px, actions et libellés inchangés. Radix DropdownMenu possède le focus, les touches de navigation, Échap et les états désactivés.
- L'état des MenuItem natifs reste la source unique de disponibilité. Le popup lit cet état et reçoit ses changements ; toutes les actions passent par le même gestionnaire Rust et les actions existantes de la fenêtre principale. Le jeton Minecraft reste dans CurrentSession.
- Fenêtre transparente, sans barre des tâches ni décoration, dimensionnée et bornée au moniteur/DPI du clic, cachée à la perte de focus, exclue de la persistance de fenêtre. La fermeture du launcher avec keep_in_tray=false continue à quitter toute l'application malgré cette fenêtre supplémentaire.
- Menu natif conservé sur macOS/Linux et en repli Windows si la création du popup échoue. Autorisations du popup limitées à écouter/désécouter ses évènements.
- Contrôle du binaire installé : surface sombre et arrondie conforme ; Instances et Paramètres ouvrent leurs écrans, Échap et un clic réel sur le bouton de notification extérieur masquent le popup. Réouvertures successives réussies. Les éléments de menu WebView n'exposent pas de frame cliquable à Orca : clics effectués aux positions de la capture fraîche, avec lecture des écrans après action.
