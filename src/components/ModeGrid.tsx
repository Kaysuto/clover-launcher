import monogram from "@/assets/brand/monogram.webp";
import { cn } from "@/lib/utils";
import type { ModeStatus } from "@/types";

/**
 * Les modes de jeu en cartes : icône dans une case d'inventaire, nom, joueurs connectés. Le mode
 * où « Jouer » envoie le joueur (le Lobby) est surligné et cerclé comme la case sélectionnée du jeu.
 */
export function ModeGrid({ modes, destination }: { modes: ModeStatus[]; destination: string }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-2.5">
      {modes.map((mode) => {
        const offline = mode.players === null;
        const selected = mode.id === destination;
        const label = offline ? `${mode.name}, hors ligne` : `${mode.name}, ${mode.players} joueur${mode.players === 1 ? "" : "s"}`;
        return (
          <li
            key={mode.id}
            aria-label={label}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2.5",
              selected ? "border-[#e9e3d4]/70 bg-[#221e18]" : "border-border",
              offline && "opacity-60",
            )}
          >
            <span className="mc-slot grid size-10 shrink-0 place-items-center [--mc-radius:6px]">
              <img src={mode.icon ?? monogram} alt="" className={cn("size-6", mode.icon ? "pixelated" : "opacity-70", offline && "grayscale")} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
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
          </li>
        );
      })}
    </ul>
  );
}
