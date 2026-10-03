import { House, Puzzle, Shirt, SquareTerminal } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Tab } from "@/types";

const ITEMS: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: "home", label: "Accueil", Icon: House },
  { id: "mods", label: "Mods", Icon: Puzzle },
  { id: "skins", label: "Skins", Icon: Shirt },
  { id: "console", label: "Console", Icon: SquareTerminal },
];

/**
 * Navigation principale en colonne, comme une barre d'inventaire verticale : chaque section est
 * une case, et la section ouverte porte le cadre de sélection du jeu.
 */
export function SideNav({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <nav aria-label="Sections" className="flex w-[76px] shrink-0 flex-col items-center gap-3 border-r border-border bg-[#100e0b] pt-4">
      {ITEMS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onTab(id)}
            className="group flex flex-col items-center gap-1.5"
          >
            <span
              className={cn(
                "mc-slot grid size-12 place-items-center transition-colors",
                active
                  ? "text-accent outline-[3px] outline-offset-[3px] outline-[#e9e3d4] [outline-style:solid]"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              <Icon className="size-[22px]" strokeWidth={2.25} aria-hidden />
            </span>
            <span className={cn("text-[11px] font-semibold", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
