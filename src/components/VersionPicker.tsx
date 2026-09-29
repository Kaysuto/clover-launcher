import { Check, ChevronDown, TriangleAlert } from "lucide-react";

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
 * Version de Minecraft qui sera lancée, modifiable. La version du serveur est proposée en premier :
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
          className="mc-frame flex h-9 w-full items-center gap-2 whitespace-nowrap bg-card/90 px-3.5 text-left text-xs transition-colors hover:bg-card data-[state=open]:bg-card [--mc-radius:6px]"
        >
          <span className="text-muted-foreground">Minecraft</span>
          <span className="font-pixel text-[12px] text-foreground">{current.id}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <span className="truncate text-muted-foreground">{current.loader.split(" ")[0]}</span>
          {current.joinable ? (
            <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Serveur</span>
          ) : (
            <TriangleAlert className="ml-auto size-3.5 text-accent" aria-label="Ne peut pas rejoindre Clover Games" />
          )}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="mc-frame w-[340px] gap-0 border-[var(--mc-outline)] bg-card p-0 text-white ring-0">
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
