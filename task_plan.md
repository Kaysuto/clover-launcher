# Task Plan : Launcher Minecraft Clover Games

## Goal
Livrer « Clover Launcher » (Windows, macOS, Linux) qui installe et lance le bon Minecraft en un clic et envoie le joueur directement sur le mode choisi. Ce plan en fixe le périmètre et l'architecture avant tout code.

## Next Step
Instances (2026-10-05) : Clover, Vanilla et Fabric ; dossier partagé par défaut, isolé au choix.
Réutiliser installation/lancement et gestion des mods ; vues Simple/Expert sur la même liste persistée.
Acceptation : créer, sélectionner, renommer, retirer sans effacer les données, ouvrir les dossiers,
lancer une instance ; mods propres à chaque instance ; manifeste Clover inchangé ; verrou de lancement.
Implémentation et vérifications locales terminées : tests Rust, clippy, TypeScript et parcours
visuel navigateur. Images embarquées et familles de correctifs ajoutées ; versions historiques
1.8.9, 1.12.2, 1.16.5, 1.17.1, 1.18.2 et 1.19.4 incluses. Reste le contrôle en jeu des nouveaux
parcours en jeu. Paquet Windows installé localement et instances contrôlées dans l'application native ;
deux relances par l'épingle corrigée sans réinstallation. Aucune publication dans ce chantier.

Correctifs du 2026-10-04 validés localement : skins d'origine sur un poste neuf, reconnaissance des mods Clover activés dans la recherche et titre natif de la fenêtre Minecraft sous Windows (test réel réussi). Restent le contrôle visuel des skins/mods et la publication d'une nouvelle version après autorisation.

Import depuis les autres launchers (CLO-281, 2026-10-06) : terminé et commité sur la branche
`kaysuto/clo-281-…` ; reste la confirmation des emplacements macOS/Linux en bêta (CLO-277).

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

## Correctif du compteur global de l'accueil — 2026-10-05
- [x] Tracer le ping global et les mesures par mode ; reproduire le cas Lobby vide / SkyPvP à 2.
- [x] Calculer le total depuis les modes du manifeste ; masquer un total incomplet.
- [x] Vérifier les régressions du calcul et le rendu du composant d'accueil.
- [x] Installer le correctif local et vérifier le compteur dans l'application native, sans fermer les parties ouvertes.
- Vérifications générales et limites consignées dans progress.md ; aucune release publiée.

## Instances, illustrations et familles — 2026-10-05
- [x] Réutiliser les chemins, l'installation, le lancement et la gestion des mods existants.
- [x] Enregistrer création, sélection, réglages et vue Simple/Expert ; conserver les fichiers au retrait.
- [x] Partager le dossier par défaut, permettre sa séparation et isoler les sources de mods.
- [x] Préserver le manifeste signé Clover et empêcher une synchronisation pendant une partie ouverte.
- [x] Embarquer 11 illustrations et grouper les correctifs par famille, avec leur numéro exact avant lancement.
- [x] Distinguer « Version Clover » des autres versions Minecraft, depuis l'instance intégrée.
- [x] Remplacer le panneau latéral par une barre de lancement compacte sous les cartes.
- [x] Harmoniser les sept listes déroulantes des instances avec le thème Clover et conserver le clavier/défilement.
- [x] Vérifier les anciens arguments et natives, les métadonnées officielles, les tests et le rendu navigateur.
- [ ] Vérifier en jeu les nouveaux parcours Vanilla/Fabric et les versions historiques.
- Distribution non effectuée ; aucun commit ni publication.

## Relances et installation locale — 2026-10-05
- [x] Identifier le raccourci épinglé : ancien binaire 0.2.0 du dossier de compilation, malgré la 0.3.0 installée.
- [x] Sauvegarder exécutable/raccourci et rediriger l'épingle vers l'installation permanente.
- [x] Vérifier Rust, Clippy, TypeScript et les tests de regroupement/compteur.
- [x] Construire et installer le paquet Windows des changements récents.
- [x] Vérifier les instances dans l'application native et deux relances sans réinstallation.

## Logo 5 : intégration — 2026-10-05
- [x] Utiliser la fusion approuvée sans régénérer ni modifier le dessin source.
- [x] Remplacer le logo de la barre de titre et les icônes natives/installeurs/MSIX.
- [x] Ajouter le trèfle à la page `/launcher` du site et actualiser sa capture.
- [x] Vérifier Rust, Clippy, TypeScript, les tests du site, le lint ciblé et les rendus desktop/mobile.
- [x] Construire, installer et vérifier le launcher Windows du poste.
- Intégration locale terminée ; aucune publication de release ni mise en production du site.

## Icône native de l'exécutable — 2026-10-05
- [x] Reproduire l'ancienne icône en l'extrayant du binaire installé et vérifier les trois raccourcis.
- [x] Déclarer le fichier ICO comme dépendance de compilation dans `src-tauri/build.rs`.
- [x] Vérifier les tests Rust, Clippy et TypeScript.
- [x] Réinstaller le paquet et vérifier la ressource native et les icônes des raccourcis Windows.

## Menu compact de la zone de notification — 2026-10-05
- [x] Confirmer les raccourcis souhaités : Jouer, Instances, Paramètres et Quitter.
- [x] Étendre le menu natif existant et réutiliser les actions de l'interface.
- [x] Griser les raccourcis pendant la connexion et Jouer pendant l'installation/la partie.
- [x] Vérifier Rust, Clippy et TypeScript.
- [x] Installer localement et vérifier le menu et la navigation dans le launcher Windows.

## Menu de notification sombre et arrondi — 2026-10-05
- [x] Examiner les possibilités du menu natif et ses limites de fond/coins.
- [x] Garder les cinq actions existantes, leur disponibilité et le même parcours de lancement.
- [x] Réaliser une surface Windows transparente, fond Clover #14120F, coins de 14 px et navigation Radix au clavier.
- [x] Conserver le menu natif sur les autres plateformes et en repli si la fenêtre ne peut pas être créée.
- [x] Vérifier Rust, Clippy, TypeScript et le contrôle de style ciblé.
- [x] Installer et contrôler le rendu réel, les raccourcis et la fermeture du menu.
