import { Check, FolderOpen, PackageSearch, Play, Plus, Search, Settings2, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { RunningBadge } from "@/components/RunningBadge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { groupVersions, versionFamily } from "@/lib/game-versions";
import { KINDS, instanceSummary } from "@/lib/instances";
import { cn } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import { InstanceDetail } from "@/screens/InstanceDetail";
import type { AvailableVersion, ContentFolder, InstanceEntry, ModrinthKind, PlayState } from "@/types";

type Props = {
  instances: InstanceEntry[];
  selected: string;
  /** Vue Expert : liste de toutes les instances ; Simple : une carte par version. */
  expert: boolean;
  play: PlayState;
  /** Instance dont le jeu est ouvert, sinon `null`. */
  running: string | null;
  onSelect: (id: string) => void;
  onView: (expert: boolean) => void;
  onPlay: (id: string) => void;
  /** Avec une version : le dialogue s'ouvre dessus. */
  onCreate: (minecraft?: string) => void;
  /** L'instance Clover intégrée se règle dans les paramètres du launcher. */
  onEdit: (entry: InstanceEntry) => void;
  onOpenFolder: (id: string, folder: "game" | ContentFolder, world?: string) => void;
  onRemove: (id: string) => void;
  /** Onglet Mods de la page de l'instance choisie (les mods suivent l'instance choisie). */
  mods?: ReactNode;
  /** Change après une installation : la page de l'instance relit son dossier. */
  contentRevision?: number;
  /** Ouvre la recherche Modrinth (packs, shaders, datapacks, modpacks). */
  onSearch: (kind: ModrinthKind) => void;
  services?: Pick<typeof api, "instanceVersions" | "playHistory" | "instanceContent" | "setContentEnabled" | "trashContent">;
};

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const iconButton = cn(secondaryButton, "w-9 px-0");
const lastPlayed = (entry: InstanceEntry) => (entry.lastPlayed ? `Jouée le ${date.format(new Date(entry.lastPlayed * 1000))}` : "Jamais lancée");

/** « Jouer » sur l'accueil lance l'instance choisie ici. */
export function InstancesScreen(props: Props) {
  const { instances, selected, expert, play, running, onView, onCreate, onRemove } = props;
  const [removing, setRemoving] = useState<InstanceEntry | null>(null);
  /** Instance dont la page est ouverte (vue Expert). */
  const [opened, setOpened] = useState<string | null>(null);
  // Garde le nom affiché pendant l'animation de fermeture.
  const last = useRef(removing);
  if (removing) last.current = removing;
  const current = instances.find((entry) => entry.id === selected) ?? instances[0];
  const actions = { ...props, current, onAskRemove: setRemoving, onOpen: setOpened };
  const page = instances.find((entry) => entry.id === opened);

  if (page) {
    return (
      <InstanceDetail
        entry={page}
        play={play}
        running={page.id === running}
        services={props.services}
        onBack={() => setOpened(null)}
        onPlay={() => props.onPlay(page.id)}
        onEdit={() => props.onEdit(page)}
        onOpenFolder={(folder, world) => props.onOpenFolder(page.id, folder, world)}
        mods={page.kind === "vanilla" || page.id !== selected ? undefined : props.mods}
        contentRevision={props.contentRevision}
        onSearch={props.onSearch}
      />
    );
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-12 pt-8 pb-6">
        <header className="flex items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[30px] leading-none">Instances</h1>
            <p className="text-sm text-muted-foreground">Une version de Minecraft avec ses mods, ses mondes et ses réglages.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => props.onSearch("modpack")} className={secondaryButton}>
              <PackageSearch className="size-4" aria-hidden />
              Modpacks
            </button>
            <button type="button" onClick={() => onCreate()} className={primaryButton}>
              <Plus className="size-4" aria-hidden />
              Nouvelle instance
            </button>
          </div>
        </header>

        <div role="tablist" aria-label="Vue" className="mt-5 flex gap-1 self-start rounded-lg border border-border bg-[#100e0b] p-1">
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              role="tab"
              aria-selected={expert === value}
              onClick={() => onView(value)}
              className={cn("rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors", expert === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {value ? "Expert" : "Simple"}
            </button>
          ))}
        </div>

        {expert ? <Expert {...actions} /> : <Simple {...actions} />}
      </div>

      {!expert && current && <LaunchBar {...actions} current={current} />}

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="mc-frame gap-5 border-[var(--mc-outline)] bg-card p-6 ring-0 sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">Retirer « {last.current?.name} » ?</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">Ses mondes, mods et réglages restent sur le disque : seule l'entrée du launcher disparaît.</DialogDescription>
          </DialogHeader>
          <p className="truncate rounded-md border border-border bg-[#100e0b] px-3 py-2 font-mono text-xs select-text">{last.current?.gameDir}</p>
          <DialogFooter className="-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4">
            <button type="button" onClick={() => setRemoving(null)} className={secondaryButton}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => {
                if (removing) onRemove(removing.id);
                setRemoving(null);
              }}
              className={cn(primaryButton, "bg-destructive text-white")}
            >
              <Trash2 className="size-4" aria-hidden />
              Retirer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

type Actions = Props & { current: InstanceEntry | undefined; onAskRemove: (entry: InstanceEntry) => void; onOpen: (id: string) => void };

/** Une carte illustrée par famille de versions ; une famille sans instance en crée une. */
function Simple({ instances, current, running, onSelect, onCreate, services = api }: Actions) {
  const [versions, setVersions] = useState<AvailableVersion[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    services
      .instanceVersions()
      .then((list) => !cancelled && setVersions(list))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [services]);

  const families = groupVersions(versions, instances.flatMap((entry) => (entry.minecraft ? [entry.minecraft] : [])), false);
  const currentFamily = current?.minecraft && versionFamily(current.minecraft);

  return (
    <>
      <p className="mt-4 text-sm text-muted-foreground">
        {failed ? "Liste des versions indisponible : seules tes instances sont affichées." : "Choisis une version : sans instance, le launcher t'en crée une."}
      </p>
      <ul aria-label="Versions de Minecraft" className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
        {families.map((family) => {
          const members = instances.filter((entry) => entry.minecraft && versionFamily(entry.minecraft) === family.id);
          const active = family.id === currentFamily;
          const clover = members.some((entry) => entry.kind === "clover");
          // La plus récemment jouée de la famille, pour qu'un clic reprenne là où on s'était arrêté.
          const pick = [...members].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0];
          return (
            <li key={family.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => (pick ? onSelect(pick.id) : onCreate(family.versions[0]))}
                className={cn(
                  "group relative flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:bg-[#241f19]",
                  active ? "border-primary" : "border-border",
                )}
              >
                <img src={versionImage(family.id)} alt="" className="h-24 w-full object-cover" />
                {members.some((entry) => entry.id === running) && <RunningBadge className="absolute top-2 left-2 bg-[#14120f]/85" />}
                {active && (
                  <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </span>
                )}
                <span className="flex items-center justify-between gap-2 px-3 pt-2.5">
                  <span className="font-pixel text-[13px]">{family.id}</span>
                  {clover && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Serveur</span>}
                </span>
                <span className="truncate px-3 pt-0.5 pb-3 text-xs text-muted-foreground">
                  {members.length > 0 ? (
                    members.length === 1 ? members[0].name : `${members.length} instances`
                  ) : (
                    <span className="flex items-center gap-1 text-accent opacity-80 group-hover:opacity-100">
                      <Plus className="size-3.5" aria-hidden />
                      Créer
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Sous les cartes : l'instance choisie, la variante à lancer quand la version en a plusieurs. */
function LaunchBar({ instances, current, play, running, onSelect, onPlay, onEdit }: Actions & { current: InstanceEntry }) {
  const siblings = instances.filter((entry) => entry.minecraft && current.minecraft && versionFamily(entry.minecraft) === versionFamily(current.minecraft));
  const { Icon } = KINDS[current.kind];
  return (
    <aside aria-label="Instance choisie" className="flex shrink-0 items-center gap-4 border-t border-border bg-[#100e0b] px-12 py-3.5">
      <span className="relative shrink-0">
        <img src={versionImage(current.minecraft ?? "")} alt="" className="size-11 rounded-md object-cover" />
        <span className={cn("absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-md border-2 border-[#100e0b]", current.kind === "clover" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
          <Icon className="size-3" strokeWidth={2.5} aria-hidden />
        </span>
      </span>
      {siblings.length > 1 ? (
        <Select value={current.id} onValueChange={(id) => id && onSelect(id)}>
          <SelectTrigger aria-label="Instance à lancer" className="h-11 w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {siblings.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name} · {entry.minecraft}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">{current.name}</span>
          <span className="truncate font-pixel text-[11px] text-muted-foreground">{instanceSummary(current)}</span>
        </div>
      )}
      {current.id === running && <RunningBadge />}
      <span className="ml-auto" />
      <button type="button" title="Modifier" aria-label={`Modifier ${current.name}`} onClick={() => onEdit(current)} disabled={play.kind !== "ready"} className={cn(iconButton, "h-11 w-11")}>
        <Settings2 className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={() => onPlay(current.id)} disabled={play.kind !== "ready" || !current.minecraft} className={cn(primaryButton, "h-11 w-36 text-sm")}>
        <Play className="size-4 fill-current" aria-hidden />
        {play.kind === "running" ? "En jeu" : play.kind === "installing" ? "Préparation" : "Jouer"}
      </button>
    </aside>
  );
}

/** Toutes les instances, avec recherche et tri. */
function Expert({ instances, selected, play, running, onSelect, onOpen, onPlay, onEdit, onOpenFolder, onAskRemove }: Actions) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "recent">("recent");
  const locked = play.kind !== "ready";
  const shown = instances
    .filter((entry) => `${entry.name} ${instanceSummary(entry)}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort(sort === "recent" ? (a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) : (a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <>
      <div className="mt-5 flex items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Rechercher une instance"
            placeholder="Nom, version, Fabric…"
            className="h-10 w-full rounded-md border border-border bg-[#100e0b] pr-3 pl-9 text-sm text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
          />
        </label>
        <Select value={sort} onValueChange={(value) => value && setSort(value as typeof sort)}>
          <SelectTrigger aria-label="Trier" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Dernière partie</SelectItem>
            <SelectItem value="name">Nom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ul aria-label="Instances" className="mt-4 flex flex-col gap-2.5">
        {shown.map((entry) => {
          const active = entry.id === selected;
          const { Icon } = KINDS[entry.kind];
          return (
            <li key={entry.id} className="relative flex items-center gap-4 px-4 py-3">
              <button
                type="button"
                aria-pressed={active}
                aria-label={`Ouvrir ${entry.name}`}
                onClick={() => {
                  onSelect(entry.id);
                  onOpen(entry.id);
                }}
                className={cn("absolute inset-0 rounded-lg border bg-card transition-colors hover:bg-[#241f19]", active ? "border-primary" : "border-border")}
              />
              <span className="pointer-events-none relative shrink-0">
                <img src={versionImage(entry.minecraft ?? "")} alt="" className="size-14 rounded-md object-cover" />
                <span className={cn("absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-md border-2 border-card", entry.kind === "clover" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>
                  <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
                </span>
              </span>
              <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{entry.name}</span>
                  {active && <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Choisie</span>}
                  {entry.id === running && <RunningBadge />}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-pixel text-[11px] text-foreground/80">{instanceSummary(entry)}</span>
                  {entry.id !== "clover" && ` · ${entry.separate ? "Dossier séparé" : "Dossier commun"}`}
                  {` · ${lastPlayed(entry)}`}
                </p>
              </div>
              <div className="relative flex shrink-0 items-center gap-2">
                <button type="button" title="Ouvrir le dossier" aria-label={`Ouvrir le dossier de ${entry.name}`} onClick={() => onOpenFolder(entry.id, "game")} className={iconButton}>
                  <FolderOpen className="size-4" aria-hidden />
                </button>
                <button type="button" title="Modifier" aria-label={`Modifier ${entry.name}`} onClick={() => onEdit(entry)} disabled={locked} className={iconButton}>
                  <Settings2 className="size-4" aria-hidden />
                </button>
                {entry.id !== "clover" && (
                  <button type="button" title="Retirer" aria-label={`Retirer ${entry.name}`} onClick={() => onAskRemove(entry)} disabled={locked} className={cn(iconButton, "hover:text-destructive")}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
                <button type="button" onClick={() => onPlay(entry.id)} disabled={locked || !entry.minecraft} className={cn(primaryButton, "ml-1 w-24")}>
                  <Play className="size-4 fill-current" aria-hidden />
                  Jouer
                </button>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Aucune instance ne correspond à ta recherche.</p>}
      </ul>
    </>
  );
}
