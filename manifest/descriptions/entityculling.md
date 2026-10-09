Minecraft ne dessine pas ce qui se trouve derrière toi, mais il dessine encore tout ce que les murs et les plafonds te cachent. Entity Culling corrige ça pour les entités (joueurs, mobs, objets au sol…) et pour les blocs spéciaux comme les coffres, les panneaux ou les bannières.

Il calcule en continu ce qui est réellement visible depuis ta position, sur les cœurs du processeur que le jeu laisse libres, et ignore le reste. Plus il y a d'entités cachées autour de toi, plus le gain est important : bases remplies de coffres, fermes, spawns très fréquentés.

### Bon à savoir

- Les entités cachées sont aussi moins mises à jour de ton côté, sans rien changer sur le serveur : les fermes et le comportement des mobs restent identiques.
- Ses réglages permettent d'exclure certaines entités si un affichage pose problème.
