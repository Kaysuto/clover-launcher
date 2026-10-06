import { Box, Clover, Layers } from "lucide-react";

import type { InstanceEntry, InstanceKind } from "@/types";

export const KINDS: Record<InstanceKind, { label: string; hint: string; Icon: typeof Box }> = {
  clover: { label: "Clover", hint: "Version et mods du serveur, toujours à jour", Icon: Clover },
  vanilla: { label: "Vanilla", hint: "Minecraft sans mods", Icon: Box },
  fabric: { label: "Fabric", hint: "Avec tes propres mods", Icon: Layers },
};

/** Ligne de détail : « 1.21.11 · Fabric 0.19.5 ». */
export function instanceSummary(entry: InstanceEntry): string {
  return `${entry.minecraft ?? "…"} · ${KINDS[entry.kind].label}${entry.loader ? ` ${entry.loader}` : ""}`;
}

/** Seule une instance Clover rejoint play.clovergames.fr ; les autres ouvrent le menu du jeu. */
export const joinsServer = (entry: InstanceEntry) => entry.kind === "clover";
