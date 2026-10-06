# Propositions de logo du Clover Launcher

Quatre trèfles à quatre feuilles générés pour la demande du 2026-10-05 : silhouette large,
contours en pixels et tige courte. Vert de référence du launcher : `#52A96C`, confirmé dans
`src/styles.css` et `design/README.md`. Les rendus comprennent des nuances de ce vert.

| Fichier | Direction | Fond |
| --- | --- | --- |
| `01-classic.png` | Trèfle classique, contour sombre et reflets | Transparent |
| `02-block.png` | Forme compacte avec tranche en relief façon bloc Minecraft | Transparent |
| `03-geometric.png` | Silhouette simplifiée | Sombre, inspiré de `#14120F` |
| `04-retro.png` | Quatre feuilles en forme de cœur orientées en losange | Transparent |

Dimensions vérifiées : **1254 × 1254 pixels** pour chaque PNG. Les trois fonds transparents
possèdent un canal alpha ; la version géométrique a été refaite sur fond sombre après un
détourage défectueux. Les dimensions, tailles et propriétés alpha sont dans `metadata.json`.

Première préférence proposée : **02-block**, pour sa compacité et son relief cohérent avec Minecraft.
Le choix final de Kaysuto est la fusion **05-classic-block-fusion**, intégrée le 2026-10-05.

## Fusion des pistes 1 et 2

`05-classic-block-fusion.png` : silhouette et tige de la piste classique, relief limité à
la tranche et aux ombres du même trèfle. Un seul trèfle, quatre feuilles et une tige ;
aucune seconde silhouette décalée. PNG transparent, 1254 × 1254 pixels vérifiés.
Les propositions d'origine sont conservées. L'archive initiale contient toujours les quatre
pistes initiales ; la fusion est disponible séparément.

## Intégration de la variante 5

Source approuvée copiée sans modification dans `src/assets/brand/launcher.png` : barre de titre,
icônes natives Windows/macOS/Linux et assets MSIX. La page `/launcher` du site utilise une
déclinaison transparente 256 × 256 et une nouvelle capture de l'accueil. Le logo du serveur
reste utilisé pour les modes de jeu et la navigation générale du site.

Les icônes sont dérivées par `npx tauri icon src/assets/brand/launcher.png` ; les tailles
MSIX supplémentaires utilisent `-p 16 -p 24 -p 32 -p 48 -p 256`. Le visuel large MSIX centre
une version 150 × 150 sur un canevas transparent 310 × 150, sans étirer le trèfle.
