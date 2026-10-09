import { Copy, Minus, Settings, Square, X } from "lucide-react";
import type { ReactNode } from "react";

import launcherLogo from "@/assets/brand/launcher.png";
import { cn } from "@/lib/utils";
import type { Tab } from "@/types";

type Props = {
  /** Absent avant la connexion : ni compte ni paramètres. La navigation vit dans `SideNav`. */
  session?: { tab: Tab; onTab: (tab: Tab) => void };
  /** Menu des comptes (`AccountMenu`). */
  account?: ReactNode;
  /** Affiché à gauche du compte (derniers votes). */
  activity?: ReactNode;
  /** Cloche des notifications, à gauche des paramètres. */
  notifications?: ReactNode;
  maximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

/** Petits blocs en relief, comme les boutons du jeu. */
const windowButton =
  "mc-bevel grid size-7 place-items-center bg-secondary text-muted-foreground [--mc-radius:5px] hover:text-foreground";

/**
 * Barre de titre de la fenêtre sans cadre : zone de déplacement (double-clic pour agrandir),
 * derniers votes, compte, notifications, paramètres, boutons de fenêtre.
 */
export function TitleBar({ session, account, activity, notifications, maximized, onMinimize, onToggleMaximize, onClose }: Props) {
  return (
    <header data-tauri-drag-region className="flex h-13 shrink-0 items-center gap-6 pl-5">
      {/* Avec une session, le logo coiffe la navigation (`SideNav`). */}
      {!session && <img src={launcherLogo} alt="Clover Launcher" width={36} height={36} className="pixelated" data-tauri-drag-region />}

      <div data-tauri-drag-region className="h-full flex-1" />

      {session && activity}

      {session && account}

      {session && (
        <div className="flex items-center gap-2">
          {notifications}
          <button
            type="button"
            aria-label="Paramètres"
            title="Paramètres"
            aria-current={session.tab === "settings" ? "page" : undefined}
            onClick={() => session.onTab("settings")}
            className={cn(
              "grid size-9 place-items-center rounded-md transition-colors",
              session.tab === "settings" ? "bg-secondary text-accent" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Settings className="size-[18px]" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex gap-1.5 pr-3">
        <button type="button" onClick={onMinimize} aria-label="Réduire" className={windowButton}>
          <Minus className="size-3.5" strokeWidth={2.75} aria-hidden />
        </button>
        <button type="button" onClick={onToggleMaximize} aria-label={maximized ? "Restaurer" : "Agrandir"} className={windowButton}>
          {maximized ? <Copy className="size-3 -scale-x-100" strokeWidth={2.75} aria-hidden /> : <Square className="size-3" strokeWidth={2.75} aria-hidden />}
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" className={`${windowButton} hover:bg-destructive hover:text-white`}>
          <X className="size-3.5" strokeWidth={2.75} aria-hidden />
        </button>
      </div>
    </header>
  );
}
