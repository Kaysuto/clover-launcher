import { ArrowLeftRight, Check, Plus, Settings2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KINDS, instanceSummary, joinsServer } from "@/lib/instances";
import { cn } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import type { InstanceEntry } from "@/types";

type Props = {
  instances: InstanceEntry[];
  selected: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onManage: () => void;
  /** Ouvert d'office (planche des maquettes). */
  defaultOpen?: boolean;
};

/**
 * Choix de l'instance, à droite du bouton « Jouer » (la version lancée est écrite dessous). Seule
 * une instance Clover rejoint le serveur ; les autres ouvrent le menu du jeu et le disent.
 */
export function VersionPicker({ instances, selected, onSelect, onCreate, onManage, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const current = instances.find((entry) => entry.id === selected) ?? instances[0];
  const close = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={current ? `Instance : ${current.name}. Changer d'instance` : "Changer d'instance"}
          title="Changer d'instance"
          className="play-slab h-[86px] w-[72px] shrink-0 bg-none [background:linear-gradient(180deg,#5b5346,#3e382e)] text-white data-[state=open]:brightness-90"
        >
          <ArrowLeftRight className="size-7" strokeWidth={2.5} aria-hidden />
          {current && !joinsServer(current) && (
            <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border-2 border-[var(--mc-outline)] bg-accent text-accent-foreground">
              <TriangleAlert className="size-3.5" strokeWidth={2.75} aria-label="Ne rejoint pas Clover Games" />
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={16} className="mc-frame w-[340px] gap-0 border-[var(--mc-outline)] bg-card p-0 text-white ring-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg leading-none">Choisir une instance</h2>
          <button type="button" onClick={close(onManage)} title="Gérer les instances" aria-label="Gérer les instances" className="text-muted-foreground hover:text-foreground">
            <Settings2 className="size-4" aria-hidden />
          </button>
        </div>

        <ul role="radiogroup" aria-label="Instance" className="max-h-[280px] overflow-y-auto p-1.5">
          {instances.map((entry) => {
            const active = entry.id === current?.id;
            const { Icon } = KINDS[entry.kind];
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={close(() => onSelect(entry.id))}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-secondary", active && "bg-[#221e18]")}
                >
                  <span className="relative shrink-0">
                    <img src={versionImage(entry.minecraft ?? "")} alt="" className="size-9 rounded object-cover" />
                    <Icon className={cn("absolute -right-1 -bottom-1 size-4 rounded-sm border border-card p-0.5", entry.kind === "clover" ? "bg-primary text-primary-foreground" : "bg-secondary")} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-semibold">{entry.name}</span>
                    <span className="truncate font-pixel text-[11px] text-muted-foreground">{instanceSummary(entry)}</span>
                    {!joinsServer(entry) && <span className="text-[11px] leading-snug text-accent">Ouvre le menu du jeu</span>}
                  </span>
                  {active && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border p-1.5">
          <button type="button" onClick={close(onCreate)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px] font-semibold text-accent transition-colors hover:bg-secondary">
            <span className="grid size-9 shrink-0 place-items-center rounded border border-dashed border-accent/50">
              <Plus className="size-4" aria-hidden />
            </span>
            Nouvelle instance
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
