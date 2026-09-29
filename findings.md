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
