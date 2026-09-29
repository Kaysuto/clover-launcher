# Task Plan : Launcher Minecraft Clover Games

## Goal
Livrer « Clover Launcher » (Windows, macOS, Linux) qui installe et lance le bon Minecraft en un clic et envoie le joueur directement sur le mode choisi. Ce plan en fixe le périmètre et l'architecture avant tout code.

## Next Step
Maquettes UI (CLO-269) puis interface V1 (CLO-274) ; en parallèle, Kaysuto active R2 et le compte Microsoft Store (CLO-271).

## Current Phase
Phase 4 terminée ; phases 3 et 5 à lancer

## Phases

### Phase 1 : Cadrage & questions
- [x] Lire le contexte Clover (site, plugin, mémoires)
- [x] Veille : Modrinth App, Lunar, Badlion, Rinaorc
- [x] Obtenir les réponses aux questions bloquantes
- **Status:** complete

### Phase 2 : Spec V1 & architecture
- [x] Spec V1 : écrans, parcours joueur, hors-périmètre → `SPEC.md`
- [x] Stack, format du manifeste distant, endpoints `/api/launcher/*` du site, hébergement des fichiers
- [x] Validation de `SPEC.md` par Kaysuto
- [x] Issues Linear : épopée CLO-266, sous-tickets CLO-267 à CLO-277, V2 = CLO-278
- **Status:** complete

### Phase 3 : Maquettes UI (CLO-269, en parallèle du prototype)
- [ ] Direction visuelle alignée sur « Dark Forest » + `Assets/`
- [ ] Écrans : connexion, accueil (modes + joueurs + actus), paramètres, progression d'installation
- **Status:** pending

### Phase 4 : Prototype technique (CLO-267, CLO-268)
- [x] Auth Microsoft → profil Minecraft depuis le launcher (CLO-267, validé)
- [x] Installation Java + Minecraft + Fabric (CLO-268, validé ; cible encore codée en dur)
- [x] Lancement + Quick Play sur `play.clovergames.fr`
- **Status:** complete

### Phase 5 : V1
- [ ] Accueil : modes, joueurs connectés, actus du site, statut de maintenance
- [ ] Paramètres : RAM auto/manuelle, dossier, multi-comptes
- [ ] Auto-update du launcher + du contenu, installeurs 3 OS, Microsoft Store
- **Status:** pending

### Phase 6 : Bêta & lancement
- [ ] Bêta fermée staff, puis publique
- [ ] Page de téléchargement sur le site, annonce, wiki
- **Status:** pending

### Phase 7 : V2 (après retours)
- [ ] Mod Fabric Clover : détection launcher, récompenses, cosmétiques
- [ ] Session site (`hasJoined`), boutique, envoi direct sur un mode, Discord Rich Presence, skins, amis
- **Status:** pending

## Key Questions
Toutes répondues au 2026-09-29.

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Planifier avant de scaffolder | Demande explicite de Kaysuto |
| Dossier `launcher/` = futur dépôt git séparé | Convention du workspace |
| Dédié à Clover, version pilotée par manifeste distant signé | Q1-Q2 : le launcher suit le serveur (26.2, puis 26.4) |
| Microsoft seul, compte Minecraft premium obligatoire | Q3, Q5 |
| Réutiliser l'app Azure du site en client public PKCE | Q4 : approbation Mojang liée à l'ID d'app |
| Fabric + mods optionnels issus d'un catalogue fermé | Q6 |
| Launcher optionnel, bonus launcher en V2 via mod Clover | Q7-Q8 |
| Windows, macOS, Linux | Q9 |
| Pas de certificat payant : Microsoft Store (MSIX signé gratuitement), macOS ad hoc, updater signé ed25519 | Q10 |
| Tauri 2 + cœur Rust maison + React/TS | Q11 : léger ; bibliothèques existantes GPL ou abandonnées |
| Dépôt privé | Q12 |
| Cloudflare R2 sur `cdn.clovergames.fr` | Q13 : gratuit à cette échelle, DNS déjà chez Cloudflare |
| Routes `/api/launcher/*` dans `siteweb/` | Q14 |
| V1 : actus, joueurs par mode, multi-comptes, RAM ; le reste en V2 | Q15 : « Oui » lu comme accord sur la recommandation |
| Sentry opt-in | Q16 |
| Nom « Clover Launcher », FR seul | Q17 |
| Pas d'échéance, 2 développeurs, Linear équipe CLO existante | Q18 |
| Un Mac est disponible : macOS testé sur machine réelle | Question ouverte 1 |
| Cœur Rust validé pour la maintenance à deux | Question ouverte 2 |
| V1 : « Jouer » arrive au Lobby ; envoi direct sur un mode en V2 | Un envoi direct sauterait `pack.send-on-join`, réservé au Lobby |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `type Result<T>` masquait `Result<S::Ok, S::Error>` dans `impl Serialize` | 1 | Chemin complet `std::result::Result` |
| `cargo add reqwest --features rustls-tls` refusé (reqwest 0.13) | 1 | Feature renommée `rustls` |
| `FnOnce is not general enough` sur `stream::iter(downloads.iter())` | 1 | Itérer par valeur, `async move` possède le `Download` |
| Sortie de `tauri dev` vide via le wrapper rtk | 1 | `rtk proxy npm run tauri dev > scratchpad/dev.log` |
| `launcher.rinaorc.com` = page de redirection | 1 | Lu `rinaorc.com/fr/launcher` à la place |
| MCP Linear `linear-jel` = workspace Jelly (équipe JEL), pas Clover Games | 1 | Kaysuto a connecté `linear-clover` ; tickets créés dessus |
