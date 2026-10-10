# Journal des versions

Ce qui a changé d'une version à l'autre du Clover Launcher. L'historique git du dépôt repart de la
0.4.4 : ce fichier garde la trace de tout ce qui précède.

## Pas encore publié

- Journaux : durée de conservation réglable dans Paramètres › Stockage (7, 14, 30, 90 jours ou
  toujours), appliquée au démarrage à toutes les instances, personnelles comprises. Chaque
  instance affiche ses journaux dans ses paramètres, avec « Ouvrir le dossier » et « Supprimer
  les journaux ». Les boutons « Ouvrir » de la console et de l'écran de plantage ouvrent les
  journaux de Minecraft de l'instance concernée.
- Skin 3D : glisser de côté le fait tourner, même sur le personnage ; glisser vers le haut ou le
  bas l'attrape.
- Plus de fenêtre « Modifier le skin » : les bras se choisissent sous l'aperçu de la page Skins,
  appliqués au skin porté après confirmation (annulable) ou au skin essayé, et gardés pour un skin
  de « Mes skins ».
- Bouton « Partager » dans la console et sur l'écran de plantage : le journal est publié sur
  mclo.gs après confirmation, et le lien est copié pour le support. Le jeton Minecraft en est
  retiré.
- Liens `clover://play` (ouvre le jeu avec l'instance Clover Games) et `clover://play/<mode>`
  (rejoint directement un mode), pour lancer une partie depuis le site.
- « Jouer dans ce monde » dans l'onglet Mondes d'une instance, à partir de Minecraft 1.20.
- Export d'une instance personnelle en modpack `.mrpack`, par clic droit ou depuis l'en-tête de
  sa page. Les mods publiés sur Modrinth seront téléchargés à l'import, les autres fichiers sont
  inclus dans l'archive. On choisit d'ajouter ou non les réglages des mods, les packs de
  ressources, les shaders et les réglages du jeu.

## 0.4.4 (9 octobre 2026)

### Nouveautés

- Les instances Forge et NeoForge des autres launchers s'importent avec leurs mods et leurs
  dépendances. La version du loader est gardée si elle est encore publiée.
- « Partager ma carte » sur la page Profil : le personnage avec sa cape, un fond au choix (Forêt,
  Nuit, Nether), le mode favori, l'ancienneté, l'XP et le lien du profil.
- Paramètres : une recherche qui parcourt tous les onglets, la taille de la fenêtre du jeu, et le
  choix de l'API graphique (OpenGL ou Vulkan) à partir de Minecraft 26.2.
- Skins : bascule entre cape et élytres, avec le vol et le plané dans l'aperçu.
- Accueil : chaque mode a son illustration. Le Lobby n'a plus de carte, et « Jouer » ouvre le
  menu du jeu.
- Instances : vue Simple revue avec les versions affichées sur les cartes, et import d'un modpack
  depuis « Nouvelle instance ».

### Corrections

- Les mods dont le `fabric.mod.json` contient des retours à la ligne bruts sont lus comme le fait
  Fabric Loader (import, Mes mods et lancement).

## 0.4.3 (7 octobre 2026)

- Le mod Clover s'installe avec l'instance Clover Games, sans apparaître dans la liste des mods.
  Il signale la partie au site et place un trèfle devant le nom des joueurs qui utilisent le
  launcher, dans la tablist et au-dessus des têtes.
- Instances Forge et NeoForge : installation par l'installateur officiel, recherche Modrinth,
  mises à jour et dépendances selon le loader. Shaders avec Iris, ou Oculus sous Forge.
- Page Profil : niveau, pièces, votes, série de jours, modes de jeu et classements, temps de jeu,
  amis, capes et succès.
- Skins : essayer un skin avant de le porter, l'exporter, le renommer. Nouveaux onglets Mes capes
  et Découverte (skins de la communauté, catalogue des capes et leurs porteurs). Aperçu 3D animé.
- Accueil : les articles s'ouvrent aussi dans le launcher, et un résumé « Ta semaine » apparaît.
- Import des modpacks CurseForge depuis leur fichier `.zip`.

## 0.4.2 (6 octobre 2026)

- Nouvelle page Actualités : le blog de Clover Games et les annonces officielles de Minecraft,
  avec les filtres Tout, Clover Games et Minecraft.
- Les articles du blog et les notes de version de Minecraft se lisent dans le launcher.
- Les annonces Minecraft restent en anglais, comme Mojang les publie, et sont marquées « EN ».
- Changement de pseudo Minecraft depuis le menu du compte : disponibilité vérifiée en direct, et
  date du prochain changement possible (Mojang impose 30 jours entre deux).

## 0.4.1 (6 octobre 2026)

### Nouveautés

- Paramètres propres à chaque instance : nom, mémoire et arguments Java.
- Les parties sont enregistrées dès le lancement : l'Aperçu d'une instance montre le temps de jeu
  et une grille d'activité, avec la série de jours et le record.
- Console : les anciens journaux et les rapports de plantage de chaque instance sont consultables.
- On peut renommer ses mondes solo et les serveurs déjà rejoints.
- Apparence : couleur principale, bandeau de l'accueil et coins carrés.
- « Fermer le jeu », puis « Forcer la fermeture » si le jeu ne répond plus. Plusieurs instances
  peuvent tourner en même temps.
- « Importer » dans les Instances : une installation d'un autre launcher devient une nouvelle
  instance.
- Clic droit sur une instance : jouer, paramètres, dossier, épingler, dupliquer, raccourci sur le
  bureau, retirer.
- Les évènements du jeu (niveaux, succès, récompenses) remontent dans les notifications du site.

### Corrections

- Le message de l'ajout à Steam tient compte d'un raccourci déjà chargé par Steam.
- La cloche des notifications explique ses erreurs au lieu de rester vide.

## 0.4.0 (6 octobre 2026)

### Nouveautés

- Nouveau logo en trèfle et nouvelles icônes sur toutes les plateformes.
- Instances Clover, Vanilla et Fabric : création, page détaillée (aperçu, mods, mondes,
  datapacks, packs de ressources, shaders, captures) et versions regroupées par famille.
- Reprise des installations du launcher officiel, de Modrinth App, de Prism Launcher, de MultiMC
  et de CurseForge, sans jamais lire leurs comptes.
- Les dépendances obligatoires d'un mod ajouté à la main s'installent avec lui.
- Menu de la zone de notification, et titre de la fenêtre de Minecraft sous Windows.
- Canal bêta pour les testeurs, et bandeau de maintenance sur l'accueil.
- Réglages recommandés selon la puissance de l'ordinateur.
- Ajout du launcher à la bibliothèque Steam, et déplacement de son dossier depuis les paramètres.
- Notifications du site (achats, votes, annonces, succès) dans le launcher.
- Taille du téléchargement annoncée avant de créer une instance, et changement de version du
  serveur signalé au joueur.
- Rapports de plantage, envoyés seulement avec l'accord du joueur.
- Fiche de chaque monde solo (mode, difficulté, version, dernière partie, datapacks).
- Nettoyage des versions de Minecraft et des Java qui ne servent plus.

### Corrections

- Le statut Discord se rétablit tout seul s'il se perd.
- Les mises à jour du launcher sont revérifiées toutes les 6 heures.
- Sous GNOME sans AppIndicator, fermer la fenêtre quitte le launcher au lieu de le cacher.
- Les dossiers synchronisés sont reconnus aussi pour un chemin Windows ouvert sous Linux.

## 0.3.0 (3 octobre 2026)

- Version Microsoft Store : les mises à jour passent alors par le Store.
- « Démarrer avec l'ordinateur » fonctionne aussi dans la version Microsoft Store.

## 0.2.0 (3 octobre 2026)

Première version publiée.

- Connexion avec un compte Microsoft, plusieurs comptes, et un premier lancement guidé.
- Installation de Java, de Minecraft 26.2 et de Fabric, avec des téléchargements vérifiés.
- Manifeste signé : la version de Minecraft, les mods et les modes suivent le serveur.
- Catalogue de mods à activer au choix, et « Mes mods » pour ses propres fichiers.
- Accueil : aperçu 3D du skin, cartes des modes avec les joueurs connectés, connexion directe à un
  mode, actualités, derniers votes et statut du serveur.
- Skins : bibliothèque et éditeur.
- Choix de la version de Minecraft sous le bouton « Jouer ».
- Paramètres en six onglets, et statut Discord.
- Console du jeu, et accès direct aux autres serveurs déjà rejoints.
- Mise à jour automatique du launcher.
