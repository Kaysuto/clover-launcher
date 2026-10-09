import { Play } from "lucide-react";

import launcherLogo from "@/assets/brand/launcher.png";
import { modeArt } from "@/lib/mode-art";
import { cn } from "@/lib/utils";
import type { ModeStatus } from "@/types";

type Props = {
  modes: ModeStatus[];
  /** Lance le jeu connecté directement à ce mode (Quick Play). */
  onPlay: (mode: string) => void;
  /** Jeu en préparation ou déjà lancé : les cartes ne lancent rien. */
  busy?: boolean;
};

/**
 * Les modes qui ont une adresse directe dans le manifeste, en cartes : illustration du mode (son nom
 * y est lettré), joueurs connectés. Un mode sans illustration montre le trèfle du launcher et son
 * nom. Un clic lance le jeu connecté à ce mode.
 */
export function ModeGrid({ modes, onPlay, busy = false }: Props) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(56px,1fr))] gap-2">
      {modes.filter((mode) => mode.quickPlay).map((mode) => {
        const offline = mode.players === null;
        const art = modeArt(mode.id, mode.icon);
        const status = offline ? "hors ligne" : mode.players === undefined ? null : `${mode.players} joueur${mode.players === 1 ? "" : "s"}`;

        return (
          <li key={mode.id}>
            <button
              type="button"
              disabled={busy || offline}
              onClick={() => onPlay(mode.id)}
              aria-label={`Jouer à ${mode.name}${status ? `, ${status}` : ""}`}
              className={cn(
                "group @container flex h-full w-full flex-col items-stretch gap-1 rounded-lg border border-border bg-card px-1 pt-1 pb-1.5 text-left transition-colors",
                "enabled:hover:border-[#e9e3d4]/50 enabled:hover:bg-[#262119] disabled:cursor-default",
                "motion-safe:enabled:hover:[&_.mode-art]:-translate-y-0.5 motion-safe:enabled:hover:[&_.mode-art]:scale-[1.04]",
                offline && "opacity-60",
              )}
            >
              {/* Carrée, mais plafonnée selon la hauteur de la fenêtre (160 px au plus) : en plein écran, la
                  carte s'élargit sans pousser le reste de l'accueil hors de la fenêtre. */}
              <span className="relative block aspect-square max-h-[clamp(96px,14vh,160px)] w-full">
                {art ? (
                  <img src={art} alt={mode.name} draggable={false} className={cn("mode-art size-full object-contain transition-transform duration-200", offline && "grayscale")} />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-2">
                    <img src={launcherLogo} alt="" draggable={false} className={cn("mode-art w-[46%] transition-transform duration-200", offline && "grayscale")} />
                    <span className="max-w-full truncate font-display text-base leading-none @[8rem]:text-2xl">{mode.name}</span>
                  </span>
                )}
                {/* Au survol, « lancer » en coin, sans rien décaler. */}
                <span
                  aria-hidden
                  className="absolute top-0 right-0 grid size-6 place-items-center rounded-md bg-black/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:opacity-0"
                >
                  <Play className="size-3.5 fill-current text-accent" />
                </span>
              </span>
              {mode.players === undefined ? null : offline ? (
                <span className="flex items-center justify-center gap-1.5 text-[11px] whitespace-nowrap text-destructive">
                  <span aria-hidden className="hidden size-1.5 shrink-0 rounded-full bg-destructive @[5.5rem]:block" />
                  Hors ligne
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="font-pixel text-[11px] text-foreground">{mode.players}</span>
                  <span className="hidden @[6rem]:inline">en jeu</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
