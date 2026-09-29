import { FileUp, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { ModCategory, ModInfo, PersonalMod } from "@/types";

const CATEGORIES: { id: ModCategory; title: string; hint: string }[] = [
  { id: "performance", title: "Performance", hint: "Plus d'images par seconde, moins de mémoire. Activés par défaut." },
  { id: "visual", title: "Visuel", hint: "Shaders et rendu. Plus exigeants pour ta carte graphique." },
  { id: "comfort", title: "Confort", hint: "Petites aides d'interface, sans avantage en combat." },
];

export type ModsView = "catalogue" | "personal";

type Props = {
  view: ModsView;
  onView: (view: ModsView) => void;
  mods: ModInfo[];
  personal: PersonalMod[];
  minecraftVersion: string;
  onToggle: (id: string, enabled: boolean) => void;
  onTogglePersonal: (id: string, enabled: boolean) => void;
  onUpdatePersonal: (id: string) => void;
  onRemovePersonal: (id: string) => void;
  onAddFiles: (files: File[]) => void;
};

/** Un mod personnel ne peut être activé que s'il est fait pour Fabric et pour la version du serveur. */
const usable = (mod: PersonalMod) => mod.status.kind === "ok";

export function ModsScreen(props: Props) {
  const { view, mods, personal } = props;
  const catalogueOn = mods.filter((mod) => mod.enabled && mod.available).length;
  const personalOn = personal.filter((mod) => mod.enabled && usable(mod)).length;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-12 pt-8 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[30px] leading-none">Mods</h1>
        <p className="text-sm text-muted-foreground">Ils s'appliquent au prochain lancement.</p>
      </header>

      <div role="tablist" aria-label="Mods" className="mt-5 flex gap-1 self-start rounded-lg border border-border bg-[#100e0b] p-1">
        {(
          [
            ["catalogue", "Catalogue Clover", catalogueOn],
            ["personal", "Mes mods", personalOn],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => props.onView(id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              view === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            <span className={cn("rounded-full px-1.5 font-pixel text-[11px]", view === id ? "bg-accent text-accent-foreground" : "bg-secondary")}>{count}</span>
          </button>
        ))}
      </div>

      {view === "catalogue" ? <Catalogue {...props} /> : <Personal {...props} />}
    </main>
  );
}

function Catalogue({ mods, minecraftVersion, onToggle }: Props) {
  return (
    <>
      <p className="mt-4 text-sm text-muted-foreground">Chaque mod du catalogue est vérifié par l'équipe Clover Games et mis à jour avec le serveur.</p>
      {CATEGORIES.map((category) => {
        const items = mods.filter((mod) => mod.category === category.id);
        if (items.length === 0) return null;
        return (
          <section key={category.id} aria-labelledby={`mods-${category.id}`} className="mt-7 flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h2 id={`mods-${category.id}`} className="font-display text-xl">
                {category.title}
              </h2>
              <p className="text-xs text-muted-foreground">{category.hint}</p>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-2.5">
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
    </>
  );
}

function statusText(mod: PersonalMod, minecraftVersion: string) {
  switch (mod.status.kind) {
    case "ok":
      return null;
    case "update":
      return `Prévu pour Minecraft ${mod.status.builtFor}. Une version pour ${minecraftVersion} existe : ${mod.status.version}.`;
    case "outdated":
      return `Prévu pour Minecraft ${mod.status.builtFor} : il ne se chargera pas en ${minecraftVersion}.`;
    case "loader":
      return `Mod ${mod.status.loader} : le Clover Launcher utilise Fabric, il ne se chargera pas.`;
  }
}

function Personal({ personal, minecraftVersion, onTogglePersonal, onUpdatePersonal, onRemovePersonal, onAddFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const blocked = personal.filter((mod) => !usable(mod)).length;

  return (
    <div
      className="flex flex-col"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = [...event.dataTransfer.files].filter((file) => file.name.endsWith(".jar"));
        if (files.length > 0) onAddFiles(files);
      }}
    >
      <div className="mt-4 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/8 px-4 py-3 text-[13px] leading-relaxed">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p>
          Ces mods viennent de toi : ils ne sont pas vérifiés par l'équipe Clover Games. Les mods de triche sont interdits sur le serveur et repérés par l'anticheat.
        </p>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {personal.length} mod{personal.length > 1 ? "s" : ""}
          {blocked > 0 && ` · ${blocked} ne peu${blocked > 1 ? "vent" : "t"} pas être chargé${blocked > 1 ? "s" : ""} en ${minecraftVersion}`}
        </p>
        <button type="button" onClick={() => input.current?.click()} className={secondaryButton}>
          <FileUp className="size-4" aria-hidden />
          Ajouter des mods (.jar)
        </button>
        <input
          ref={input}
          type="file"
          accept=".jar"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length > 0) onAddFiles(files);
            event.target.value = "";
          }}
        />
      </div>

      {personal.length === 0 ? (
        <div className={cn("mt-4 grid place-items-center rounded-lg border-2 border-dashed border-border px-6 py-12 text-center", dragging && "border-accent bg-accent/5")}>
          <p className="text-sm font-semibold">Aucun mod personnel</p>
          <p className="mt-1 text-xs text-muted-foreground">Glisse des fichiers .jar ici, ou importe-les depuis un autre launcher dans les paramètres.</p>
        </div>
      ) : (
        <ul className={cn("mt-4 flex flex-col gap-2 rounded-lg", dragging && "outline-2 outline-offset-4 outline-accent outline-dashed")}>
          {personal.map((mod) => {
            const text = statusText(mod, minecraftVersion);
            return (
              <li key={mod.id} className={cn("flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3", !usable(mod) && "bg-[#17150f]")}>
                <Switch
                  id={`personal-${mod.id}`}
                  checked={mod.enabled && usable(mod)}
                  disabled={!usable(mod)}
                  onCheckedChange={(checked) => onTogglePersonal(mod.id, checked)}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <label htmlFor={`personal-${mod.id}`} className={cn("flex items-baseline gap-2 text-sm font-semibold", !usable(mod) && "text-muted-foreground")}>
                    {mod.name}
                    {mod.version && <span className="truncate font-pixel text-[10px] font-normal text-muted-foreground/70">{mod.version}</span>}
                  </label>
                  {text && <p className={cn("text-xs leading-snug", mod.status.kind === "update" ? "text-accent" : "text-[#f3a19e]")}>{text}</p>}
                  <p className="truncate text-[11px] text-muted-foreground">{mod.source ?? mod.filename}</p>
                </div>
                {mod.status.kind === "update" && (
                  <button type="button" onClick={() => onUpdatePersonal(mod.id)} className={secondaryButton}>
                    <RefreshCw className="size-4" aria-hidden />
                    Mettre à jour
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemovePersonal(mod.id)}
                  aria-label={`Retirer ${mod.name}`}
                  title="Retirer"
                  className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
