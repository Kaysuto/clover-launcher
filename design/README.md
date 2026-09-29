# Maquettes du Clover Launcher (CLO-269)

`npm run dev`, puis http://localhost:1420/design/board.html : chaque écran rendu avec des données
d'exemple, sans Tauri. `?screen=<id>` affiche un seul écran qui remplit le navigateur : la fenêtre
est redimensionnable (1100×680 par défaut, 1000×640 au minimum), ce qui permet de tester plusieurs
tailles :

```bash
msedge --headless=new --window-size=1100,680 --virtual-time-budget=8000 \
  --screenshot=home.png "http://localhost:1420/design/board.html?screen=home"
```

Écrans : `onboarding-first`, `onboarding-accounts`, `onboarding-error`, `onboarding-import`, `onboarding-done`,
`signin`, `home`, `notifications`, `installing`, `mods`, `mods-personal`, `skins`, `skin-editor`, `settings`, `crash`.

Les icônes des modes, les skins par défaut (`defaults/`), le skin et la cape de démonstration
sont extraits du client installé ou téléchargés dans `design/placeholder/` (ignoré par git) : ils ne
doivent pas entrer dans le dépôt. Les vraies
images viendront du champ `image` des modes du manifeste.

## Direction

- **Couleurs** : thème « Dark Forest » du site (`siteweb/src/lib/theme.ts`), fond brun-noir
  `#14120F`, trèfle `#52A96C`, or `#D9A441`. L'or du logo (`#FFD457` → `#F59E1B`, tranche
  `#8A3F0E`) est réservé au bouton « Jouer ».
- **Typographies** : Lilita One pour les titres et « Jouer » (lettrage épais, proche du logo),
  Montserrat pour le texte (celle du site), Monocraft pour les chiffres du jeu (joueurs, versions,
  mémoire).
- **Pas de gros logo** : l'accueil met en avant l'actualité à la une (titre, résumé, lien), le
  monogramme reste dans la barre de titre.
- **Fond du hero repris du site** (`src/components/Backdrop.tsx`, d'après `PageHero.tsx`, teinte
  « forest ») : aplat vert en dégradé, blocs de feuillage pixelisés, lueur. Bord bas droit, sans
  diagonale. Jamais de photo ni de capture derrière l'interface ; les images d'articles ne servent
  qu'en vignette dans la liste des actualités.
- **Fenêtre** : coins arrondis (14 px), sauf une fois agrandie.
- **Derniers votes** : à gauche du compte, une pastille fait défiler « Pseudo a voté pour le
  serveur » (tête du joueur) ; un clic ouvre la page de vote du site.
- **Signature** : le bouton « Jouer », dalle dorée en relief taillée comme les lettres du logo,
  dont la tranche s'écrase au clic et dont la face se remplit pendant l'installation.
- **Idiome Minecraft** : les modes sont une barre d'inventaire. Le nombre de joueurs s'affiche comme
  le nombre d'objets d'une case, et le cadre de sélection marque le serveur où « Jouer » envoie.
  Contours, cases et boutons reprennent les utilitaires `mc-frame`, `mc-slot` et `mc-bevel` du site.
- **Navigation** : colonne à gauche (`SideNav`), une case d'inventaire par section (Accueil, Mods,
  Skins) avec le cadre de sélection du jeu sur la section ouverte.
- **Barre de titre** : monogramme à gauche ; derniers votes, compte,
  paramètres (engrenage) et boutons de fenêtre (réduire, agrandir, fermer) en petits blocs en relief
  à droite.
- **Skins** (inspiré de Modrinth App) : onglet dédié avec l'aperçu 3D à gauche, « Mes skins »
  (ajout par clic ou glisser-déposer) et les skins par défaut du jeu, en vignettes 2D légères. La
  fenêtre « Modifier le skin » change la texture, les bras (classiques ou fins) et la cape parmi
  celles du compte. L'aperçu 3D ne tourne que de gauche à droite : ni inclinaison, ni zoom.
- **Premier lancement** (`OnboardingScreen`), trois étapes : **Comptes** (plusieurs comptes
  Microsoft d'affilée, un compte principal), **Importer** (installations trouvées dans les autres
  launchers, une à la fois, avec le choix de ce qu'on reprend), **Terminé** (récapitulatif, réglages
  recommandés pour la machine, accord pour les rapports de plantage, désactivé par défaut). Il n'y a
  pas d'écran de connexion séparé : l'étape Comptes, sans le suivi d'étapes, sert aussi de
  reconnexion quand plus aucun compte n'est enregistré (`signin`).
- **Mes mods** : onglet à côté du catalogue Clover, pour les mods du joueur (fichier `.jar` ou import
  d'un autre launcher). Non vérifiés, avec avertissement anticheat. Un mod fait pour une autre
  version de Minecraft ou pour un autre loader (Forge…) est signalé et ne peut pas être activé ; si
  Modrinth connaît une version pour la version du serveur, « Mettre à jour » la propose.
- **Notifications** : cloche à gauche des paramètres, pastille du nombre de non lues. Réunit les
  notifications du site (achats, votes, annonces) et les évènements du jeu (niveau, succès,
  récompenses). Les boutons de la barre de titre sont espacés, jamais collés.
- **Paramètres** : démarrer avec l'ordinateur, rester dans la zone de notification à la fermeture,
  Discord, rapports de plantage.
