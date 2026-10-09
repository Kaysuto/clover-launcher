import { House, Newspaper, Puzzle, Shirt, SquareTerminal, Boxes } from "lucide-react";

import launcherLogo from "@/assets/brand/launcher.png";
import { PlayerHead } from "@/components/PlayerHead";
import { navItem } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types";

export const TAB_LABELS: Record<Tab, string> = {
  home: "Accueil",
  news: "Actualités",
  instances: "Instances",
  mods: "Mods",
  skins: "Skins",
  profile: "Profil",
  console: "Console",
  settings: "Paramètres",
};

const ITEMS: { id: Exclude<Tab, "settings" | "profile">; Icon: typeof House }[] = [
  { id: "home", Icon: House },
  { id: "news", Icon: Newspaper },
  { id: "instances", Icon: Boxes },
  { id: "mods", Icon: Puzzle },
  { id: "skins", Icon: Shirt },
  { id: "console", Icon: SquareTerminal },
];

/**
 * Navigation principale en colonne, coiffée du logo : icône et nom de chaque section, la section
 * ouverte dans un fond teinté de la couleur principale (réglable dans Paramètres › Apparence). Le
 * profil du compte actif ferme la colonne, avec la tête de son skin pour icône.
 */
export function SideNav({ tab, onTab, head }: { tab: Tab; onTab: (tab: Tab) => void; head?: string | null }) {
  return (
    <nav aria-label="Sections" className="tile flex w-[84px] shrink-0 flex-col gap-1 p-1.5">
      <img src={launcherLogo} alt="Clover Launcher" width={44} height={44} className="pixelated mx-auto mt-2 mb-1" />
      <div aria-hidden className="mx-3 mb-1 h-px bg-border" />
      {ITEMS.map(({ id, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onTab(id)}
            className={cn("flex flex-col items-center gap-1.5 rounded-lg px-1 pt-3 pb-2 transition-colors", navItem(active))}
          >
            <Icon className="size-5" strokeWidth={2.25} aria-hidden />
            <span className="text-[11px] font-semibold">{TAB_LABELS[id]}</span>
          </button>
        );
      })}
      <button
        type="button"
        aria-current={tab === "profile" ? "page" : undefined}
        onClick={() => onTab("profile")}
        className={cn("mt-auto flex flex-col items-center gap-1.5 rounded-lg px-1 pt-3 pb-2 transition-colors", navItem(tab === "profile"))}
      >
        <PlayerHead skin={head ?? null} size={22} className={cn("ring-1", tab === "profile" ? "ring-primary/60" : "ring-white/10")} />
        <span className="text-[11px] font-semibold">{TAB_LABELS.profile}</span>
      </button>
    </nav>
  );
}
