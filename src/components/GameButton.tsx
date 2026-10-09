import { Play, Square, X } from "lucide-react";

import { primaryButton, secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { PlayState } from "@/types";

/**
 * Bouton d'une instance : « Jouer », puis « Fermer » tant que son jeu est ouvert. Fermer demande
 * au jeu de quitter comme par la croix de sa fenêtre ; s'il ne répond pas, « Forcer » le tue.
 */
export function GameButton({
  state,
  name,
  onPlay,
  onStop,
  disabled = false,
  className,
}: {
  state: PlayState;
  /** Nom de l'instance, pour le lecteur d'écran. */
  name: string;
  onPlay: () => void;
  onStop: (force: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (state.kind === "running") {
    if (state.closing === "slow") {
      return (
        <button
          type="button"
          onClick={() => onStop(true)}
          title="Minecraft ne répond pas. Un monde solo ouvert peut perdre ses dernières minutes."
          aria-label={`Forcer la fermeture de ${name}`}
          className={cn(secondaryButton, "border-destructive/50 text-[#f3a19e] hover:text-[#ffb3b0]", className)}
        >
          <X className="size-4" aria-hidden />
          Forcer
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onStop(false)}
        disabled={state.closing === "asked"}
        title="Ferme Minecraft comme par la croix de sa fenêtre : le monde ouvert est sauvegardé."
        aria-label={`Fermer ${name}`}
        className={cn(secondaryButton, className)}
      >
        <Square className="size-3.5 fill-current" aria-hidden />
        {state.closing ? "Fermeture…" : "Fermer"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={disabled || state.kind !== "ready" || state.busy}
      aria-label={`Jouer à ${name}`}
      className={cn(primaryButton, className)}
    >
      <Play className="size-4 fill-current" aria-hidden />
      {state.kind === "installing" ? "Préparation" : "Jouer"}
    </button>
  );
}
