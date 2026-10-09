import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KINDS } from "@/lib/instances";
import { cn } from "@/lib/utils";
import type { InstanceEntry } from "@/types";

type Props = {
  instances: InstanceEntry[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** Texte affiché tant qu'aucune instance de la liste n'est choisie (`value` vide). */
  placeholder?: string;
  className?: string;
};

/** Instance où installer ou gérer du contenu : icône du type, nom et version de Minecraft. */
export function InstancePicker({ instances, value, onChange, label, placeholder, className }: Props) {
  return (
    <Select value={value} onValueChange={(id) => id && onChange(id)}>
      <SelectTrigger aria-label={label} className={cn("h-10 w-64", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {instances.map((entry) => {
          const { Icon } = KINDS[entry.kind];
          return (
            <SelectItem key={entry.id} value={entry.id}>
              <span className="flex min-w-0 items-center gap-2">
                <Icon className={cn("size-3.5 shrink-0", entry.kind === "clover" ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span className="truncate">{entry.name}</span>
                {entry.minecraft && <span className="shrink-0 font-pixel text-[10px] text-muted-foreground">{entry.minecraft}</span>}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/** Les mods et les shaders demandent un loader : toute instance sauf Vanilla. */
export const acceptsMods = (entry: InstanceEntry) => entry.kind !== "vanilla";
