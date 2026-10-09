import { Copy, FolderOpen, MonitorUp, PackageOpen, Pin, PinOff, Play, Settings2, Square, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { InstanceEntry, PlayState } from "@/types";

export type InstanceActions = {
  onPlay: (id: string) => void;
  onStop: (id: string, force: boolean) => void;
  /** Onglet Paramètres de la page de l'instance. */
  onSettings: (entry: InstanceEntry) => void;
  onOpenFolder: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDuplicate: (id: string) => void;
  /** Export en `.mrpack` (instances personnelles). */
  onExport: (entry: InstanceEntry) => void;
  /** Absent quand le système ne permet pas de raccourci (macOS, Microsoft Store). */
  onShortcut?: (id: string) => void;
  onAskRemove: (entry: InstanceEntry) => void;
};

/**
 * Clic droit sur une instance, façon LabyMod : jouer ou fermer le jeu, paramètres, dossier,
 * épingler en haut, dupliquer, exporter en modpack, raccourci sur le bureau, retirer.
 */
export function InstanceMenu({ entry, play, actions, children }: { entry: InstanceEntry; play: PlayState; actions: InstanceActions; children: ReactNode }) {
  const personal = entry.kind !== "clover";
  const busy = play.kind !== "ready";
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent aria-label={`Actions pour ${entry.name}`}>
        {play.kind === "running" ? (
          <ContextMenuItem
            destructive={play.closing === "slow"}
            disabled={play.closing === "asked"}
            onSelect={() => actions.onStop(entry.id, play.closing === "slow")}
          >
            {play.closing === "slow" ? <X aria-hidden /> : <Square className="fill-current" aria-hidden />}
            {play.closing === "slow" ? "Forcer la fermeture" : play.closing ? "Fermeture…" : "Fermer le jeu"}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem disabled={busy || play.busy || !entry.minecraft} onSelect={() => actions.onPlay(entry.id)}>
            <Play className="fill-current" aria-hidden />
            {play.kind === "installing" ? "Préparation…" : "Jouer"}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.onSettings(entry)}>
          <Settings2 aria-hidden />
          Paramètres
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onOpenFolder(entry.id)}>
          <FolderOpen aria-hidden />
          Ouvrir le dossier
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onPin(entry.id, !entry.pinned)}>
          {entry.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          {entry.pinned ? "Ne plus épingler" : "Épingler en haut"}
        </ContextMenuItem>
        {personal && (
          <ContextMenuItem disabled={busy} onSelect={() => actions.onDuplicate(entry.id)}>
            <Copy aria-hidden />
            Dupliquer
          </ContextMenuItem>
        )}
        {personal && (
          <ContextMenuItem disabled={!entry.minecraft} onSelect={() => actions.onExport(entry)}>
            <PackageOpen aria-hidden />
            Exporter en modpack
          </ContextMenuItem>
        )}
        {actions.onShortcut && (
          <ContextMenuItem onSelect={() => actions.onShortcut?.(entry.id)}>
            <MonitorUp aria-hidden />
            Créer un raccourci sur le bureau
          </ContextMenuItem>
        )}
        {personal && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem destructive disabled={busy} onSelect={() => actions.onAskRemove(entry)}>
              <Trash2 aria-hidden />
              Retirer
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
