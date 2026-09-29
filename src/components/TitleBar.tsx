import { ChevronDown, Minus, X } from "lucide-react";

import monogram from "@/assets/brand/monogram.webp";
import { PlayerHead } from "@/components/PlayerHead";
import { cn } from "@/lib/utils";
import type { Profile, Tab } from "@/types";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Accueil" },
  { id: "mods", label: "Mods" },
  { id: "settings", label: "Paramètres" },
];

type Props = {
  /** Absent avant la connexion : ni onglets ni compte. */
  session?: { profile: Profile; skin: string; tab: Tab; onTab: (tab: Tab) => void; onAccount: () => void };
  onMinimize: () => void;
  onClose: () => void;
};

/** Barre de titre de la fenêtre sans cadre : zone de déplacement, navigation, compte, fenêtre. */
export function TitleBar({ session, onMinimize, onClose }: Props) {
  return (
    <header data-tauri-drag-region className="flex h-13 shrink-0 items-center gap-6 border-b border-border bg-[#100e0b] pl-4">
      <img src={monogram} alt="Clover Games" width={30} height={30} data-tauri-drag-region />

      {session && (
        <nav aria-label="Sections" className="flex h-full items-stretch gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-current={session.tab === id ? "page" : undefined}
              onClick={() => session.onTab(id)}
              className={cn(
                "relative px-3 text-[13px] font-semibold transition-colors",
                session.tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {session.tab === id && <span className="absolute inset-x-3 bottom-0 h-[3px] bg-accent" />}
            </button>
          ))}
        </nav>
      )}

      <div data-tauri-drag-region className="h-full flex-1" />

      {session && (
        <button
          type="button"
          onClick={session.onAccount}
          className="flex items-center gap-2 rounded-md py-1.5 pr-2 pl-1.5 text-[13px] font-semibold transition-colors hover:bg-secondary"
        >
          <PlayerHead skin={session.skin} size={24} />
          {session.profile.name}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      )}

      <div className="flex h-full">
        <button type="button" onClick={onMinimize} aria-label="Réduire" className="grid w-12 place-items-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Minus className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" className="grid w-12 place-items-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </header>
  );
}
