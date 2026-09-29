# Maquettes du Clover Launcher (CLO-269)

`npm run dev`, puis http://localhost:1420/design/board.html : chaque écran rendu avec des données
d'exemple, sans Tauri. `?screen=<id>` affiche un seul écran qui remplit le navigateur : la fenêtre
est redimensionnable (1100×680 par défaut, 1000×640 au minimum), ce qui permet de tester plusieurs
tailles :

```bash
msedge --headless=new --window-size=1100,680 --virtual-time-budget=8000 \
  --screenshot=home.png "http://localhost:1420/design/board.html?screen=home"
```

Écrans : `login`, `login-error`, `home`, `installing`, `mods`, `settings`, `crash`, `consent`.

Les icônes des modes sont des textures du jeu extraites du client installé dans
`design/placeholder/` (ignoré par git) : elles ne doivent pas entrer dans le dépôt. Les vraies
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
- **Pas de photo en fond** : ni capture du serveur ni image d'article derrière l'interface. Le fond
  (`src/components/Backdrop.tsx`) se limite à deux lueurs vert trèfle et or et à des pixels épars
  comme des particules. Les images d'articles ne servent qu'en vignette dans la liste des actualités.
- **Signature** : le bouton « Jouer », dalle dorée en relief taillée comme les lettres du logo,
  dont la tranche s'écrase au clic et dont la face se remplit pendant l'installation.
- **Idiome Minecraft** : les modes sont une barre d'inventaire. Le nombre de joueurs s'affiche comme
  le nombre d'objets d'une case, et le cadre de sélection marque le serveur où « Jouer » envoie.
  Contours, cases et boutons reprennent les utilitaires `mc-frame`, `mc-slot` et `mc-bevel` du site.
- **Barre de titre** : Accueil et Mods à gauche ; compte, paramètres (engrenage) et boutons de
  fenêtre (réduire, agrandir, fermer) en petits blocs en relief à droite.
