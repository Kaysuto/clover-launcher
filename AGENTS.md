# AGENTS.md — Clover Launcher

Dépôt privé indépendant (`Kaysuto/clover-launcher`) dans le workspace Clover Games. Lire
[SPEC.md](SPEC.md) avant toute modification, [README.md](README.md) pour les commandes.
`task_plan.md`, `findings.md` et `progress.md` tiennent l'état du chantier.

## Règles

- Tout texte visible par le joueur est en français ; identifiants de code en anglais.
- Le jeton Minecraft ne quitte jamais le poste du joueur et ne passe jamais à l'interface : il
  reste côté Rust (`CurrentSession`).
- Aucune clé privée dans le dépôt : la clé de signature du manifeste vit dans
  `Sécurités/` du workspace et dans les secrets de la CI ; seule la clé publique est dans le code.
- Le launcher suit le serveur : version de Minecraft, loader, mods et modes viennent du manifeste
  signé, jamais de constantes dans le code.
- Vérifier avec `cargo test`, `cargo clippy --all-targets` (dans `src-tauri/`) et `npx tsc --noEmit`.
- Commits signés `Kaysuto <contact@kaysuto.fr>`, sans trailer `Co-Authored-By`.

## Pièges

- `login_with_xbox` limite fortement les appels (HTTP 429) : ne jamais refaire la chaîne Xbox à
  chaque démarrage, la session en cache (`auth::restore`) existe pour ça.
- `npm run tauri dev` relance l'application à chaque modification de `src-tauri/` : si Minecraft
  tourne, il peut être fermé avec elle.
