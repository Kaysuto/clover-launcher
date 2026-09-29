import monogram from "@/assets/brand/monogram.webp";
import { cn } from "@/lib/utils";
import type { ModeStatus } from "@/types";

/**
 * Les modes présentés comme une barre d'inventaire : le nombre de joueurs est le nombre d'objets
 * de la case, et le cadre de sélection marque le serveur où « Jouer » envoie le joueur.
 */
export function ModeHotbar({ modes, destination }: { modes: ModeStatus[]; destination: string }) {
  return (
    <ul className="flex gap-2.5">
      {modes.map((mode) => {
        const offline = mode.players === null;
        const selected = mode.id === destination;
        const label = offline ? `${mode.name}, hors ligne` : `${mode.name}, ${mode.players} joueur${mode.players === 1 ? "" : "s"}`;
        return (
          <li key={mode.id} className="flex w-[74px] flex-col items-center gap-2" aria-label={label} title={label}>
            <div className={cn("relative", selected && "outline-[3px] outline-offset-[3px] outline-[#e9e3d4] [outline-style:solid] rounded-[7px]")}>
              <div className={cn("mc-slot grid size-[74px] place-items-center", offline && "opacity-45")}>
                <img
                  src={mode.icon ?? monogram}
                  alt=""
                  className={cn("size-10", mode.icon ? "pixelated" : "opacity-70", offline && "grayscale")}
                />
                {!offline && mode.players! > 0 && (
                  <span className="absolute right-1.5 bottom-0.5 font-pixel text-[17px] leading-none text-white mc-text-shadow">
                    {mode.players}
                  </span>
                )}
              </div>
            </div>
            <span className="flex flex-col items-center text-center text-xs leading-tight font-semibold">
              <span className={offline ? "text-muted-foreground" : "text-foreground"}>{mode.name}</span>
              {offline && <span className="text-[10px] font-medium text-destructive">hors ligne</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
