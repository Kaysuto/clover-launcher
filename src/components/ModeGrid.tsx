import { Play } from "lucide-react";

import monogram from "@/assets/brand/monogram.webp";
import { cn } from "@/lib/utils";
import type { ModeStatus } from "@/types";

type Props = {
  modes: ModeStatus[];
  destination: string;
  /**
   * Lance le jeu sur ce mode (Quick Play), ou sur la destination de « Jouer » sans argument.
   * Absent : cartes d'information seulement.
   */
  onPlay?: (mode?: string) => void;
  /** Jeu en préparation ou déjà lancé : les cartes ne lancent rien. */
  busy?: boolean;
};

/**
 * Les modes de jeu en cartes : icône dans une case d'inventaire, nom, joueurs connectés. Le mode
 * où « Jouer » envoie le joueur (le Lobby) est surligné et cerclé comme la case sélectionnée du jeu.
 * Un clic sur un mode que le manifeste permet de rejoindre directement lance le jeu dessus.
 */
export function ModeGrid({ modes, destination, onPlay, busy = false }: Props) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-2.5">
      {modes.map((mode) => {
        const offline = mode.players === null;
        const selected = mode.id === destination;
        const playable = onPlay !== undefined && (selected || mode.quickPlay === true);
        const status = offline ? "hors ligne" : mode.players === undefined ? null : `${mode.players} joueur${mode.players === 1 ? "" : "s"}`;
        const card = cn(
          "flex w-full items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2.5 text-left",
          selected ? "border-[#e9e3d4]/70 bg-[#221e18]" : "border-border",
          offline && "opacity-60",
        );

        const content = (
          <>
            <span className="mc-slot grid size-10 shrink-0 place-items-center [--mc-radius:6px]">
              <img src={mode.icon ?? monogram} alt="" className={cn("size-6", mode.icon ? "pixelated" : "opacity-70", offline && "grayscale")} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] leading-tight font-bold">{mode.name}</span>
              {mode.players === undefined ? null : offline ? (
                <span className="flex items-center gap-1.5 text-[11px] text-destructive">
                  <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
                  Hors ligne
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
                  <span aria-hidden className="size-1.5 rounded-full bg-primary" />
                  <span className="font-pixel text-[11px] text-foreground">{mode.players}</span> en jeu
                </span>
              )}
            </span>
            {playable && (
              <Play
                aria-hidden
                className="size-3.5 shrink-0 fill-current text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:opacity-0"
              />
            )}
          </>
        );

        return (
          <li key={mode.id}>
            {playable ? (
              <button
                type="button"
                disabled={busy || offline}
                onClick={() => onPlay(selected ? undefined : mode.id)}
                aria-label={`Jouer à ${mode.name}${status ? `, ${status}` : ""}`}
                className={cn(card, "group transition-colors enabled:hover:border-[#e9e3d4]/50 enabled:hover:bg-[#262119] disabled:cursor-default")}
              >
                {content}
              </button>
            ) : (
              <div aria-label={status ? `${mode.name}, ${status}` : mode.name} className={card}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
