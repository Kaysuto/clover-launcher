import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ModCategory, ModInfo } from "@/types";

const CATEGORIES: { id: ModCategory; title: string; hint: string }[] = [
  { id: "performance", title: "Performance", hint: "Plus d'images par seconde, moins de mémoire. Activés par défaut." },
  { id: "visual", title: "Visuel", hint: "Shaders et rendu. Plus exigeants pour ta carte graphique." },
  { id: "comfort", title: "Confort", hint: "Petites aides d'interface, sans avantage en combat." },
];

export function ModsScreen({ mods, minecraftVersion, onToggle }: { mods: ModInfo[]; minecraftVersion: string; onToggle: (id: string, enabled: boolean) => void }) {
  const enabled = mods.filter((mod) => mod.enabled && mod.available).length;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-12 pt-8 pb-10">
      <header className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[30px] leading-none">Mods</h1>
          <p className="text-sm text-muted-foreground">Choisis tes mods : ils s'appliquent au prochain lancement. Chaque mod est vérifié par l'équipe Clover Games.</p>
        </div>
        <p className="shrink-0 text-sm text-muted-foreground">
          <span className="font-pixel text-[15px] text-foreground">{enabled}</span> activé{enabled > 1 ? "s" : ""}
        </p>
      </header>

      {CATEGORIES.map((category) => {
        const items = mods.filter((mod) => mod.category === category.id);
        if (items.length === 0) return null;
        return (
          <section key={category.id} aria-labelledby={`mods-${category.id}`} className="mt-8 flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h2 id={`mods-${category.id}`} className="font-display text-xl">
                {category.title}
              </h2>
              <p className="text-xs text-muted-foreground">{category.hint}</p>
            </div>
            <ul className="grid grid-cols-2 gap-2.5">
              {items.map((mod) => (
                <li key={mod.id} className={cn("flex gap-4 rounded-lg border border-border bg-card px-4 py-3.5", !mod.available && "opacity-55")}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor={`mod-${mod.id}`} className="text-sm font-semibold">
                      {mod.name}
                    </label>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {mod.available ? mod.description : `Pas encore disponible pour Minecraft ${minecraftVersion}.`}
                    </p>
                    {mod.available && mod.version && <p className="truncate font-pixel text-[10px] text-muted-foreground/70">{mod.version}</p>}
                  </div>
                  <Switch
                    id={`mod-${mod.id}`}
                    className="mt-0.5"
                    checked={mod.available && mod.enabled}
                    disabled={!mod.available}
                    onCheckedChange={(checked) => onToggle(mod.id, checked)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
