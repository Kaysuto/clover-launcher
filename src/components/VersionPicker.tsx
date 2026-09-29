import { ArrowLeftRight, Check, TriangleAlert } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { GameVersion } from "@/types";

type Props = {
  versions: GameVersion[];
  selected: string;
  onSelect: (id: string) => void;
  /** Ouvert d'office (planche des maquettes). */
  defaultOpen?: boolean;
};

/**
 * Changement de version, à droite du bouton « Jouer » (la version lancée est écrite dessous). La
 * version du serveur est proposée en premier :
 * c'est la seule avec laquelle on peut rejoindre Clover Games. Les autres servent à jouer en solo
 * ou sur d'autres serveurs, et le disent clairement.
 */
export function VersionPicker({ versions, selected, onSelect, defaultOpen }: Props) {
  const current = versions.find((version) => version.id === selected) ?? versions[0];

  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Version de Minecraft : ${current.id}. Changer`}
          title="Changer de version"
          className="play-slab h-[86px] w-[72px] shrink-0 bg-none [background:linear-gradient(180deg,#5b5346,#3e382e)] text-white data-[state=open]:brightness-90"
        >
          <ArrowLeftRight className="size-7" strokeWidth={2.5} aria-hidden />
          {!current.joinable && (
            <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border-2 border-[var(--mc-outline)] bg-accent text-accent-foreground">
              <TriangleAlert className="size-3.5" strokeWidth={2.75} aria-label="Ne peut pas rejoindre Clover Games" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={16} className="mc-frame w-[340px] gap-0 border-[var(--mc-outline)] bg-card p-0 text-white ring-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-display text-lg leading-none">Version de Minecraft</h2>
        </div>

        <ul role="radiogroup" aria-label="Version de Minecraft" className="max-h-[300px] overflow-y-auto p-1.5">
          {versions.map((version) => {
            const active = version.id === current.id;
            return (
              <li key={version.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSelect(version.id)}
                  className={cn("flex w-full items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-secondary", active && "bg-[#221e18]")}
                >
                  <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2", active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50")}>
                    {active && <Check className="size-2.5" strokeWidth={4} aria-hidden />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="font-pixel text-[13px]">{version.id}</span>
                      <span className="text-xs text-muted-foreground">{version.loader}</span>
                      {version.server && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Version du serveur</span>}
                    </span>
                    {!version.joinable && (
                      <span className="flex items-start gap-1.5 text-[11px] leading-snug text-accent">
                        <TriangleAlert className="mt-px size-3 shrink-0" aria-hidden />
                        Ne peut pas rejoindre Clover Games
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {version.installed ? "Installée" : `À télécharger${version.sizeMb ? ` (${version.sizeMb} Mo)` : ""}`}
                      {version.mods > 0 && ` · ${version.mods} mods du catalogue`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Clover Games passe à la version suivante en une fois : le launcher te la propose alors d'office. Une autre version sert à jouer en solo ou sur d'autres serveurs.
        </p>
      </PopoverContent>
    </Popover>
  );
}
