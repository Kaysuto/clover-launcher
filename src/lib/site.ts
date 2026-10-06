import type { Catalogue, SiteFeed } from "./api";

/** Total des modes du manifeste ; une donnée manquante ne vaut jamais zéro. */
export function networkPlayers(feed: SiteFeed, modes: Catalogue["modes"]): number | null {
  if (!feed.modes || modes.length === 0) return null;
  let total = 0;
  for (const { id } of modes) {
    const status = feed.modes.find((mode) => mode.id === id);
    if (!status || status.online === null) return null;
    if (!status.online) continue;
    if (status.players === null) return null;
    total += status.players;
  }
  return total;
}
