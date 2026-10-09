import { Check, FolderInput, FolderOpen, Globe, PackageOpen, PackageSearch, Pin, Plus, Puzzle, Search, Settings2, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { GameButton } from "@/components/GameButton";
import { type InstanceActions, InstanceMenu } from "@/components/InstanceMenu";
import { RunningBadge } from "@/components/RunningBadge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { groupVersions, versionFamily } from "@/lib/game-versions";
import { KINDS, instanceSummary } from "@/lib/instances";
import { cn } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import { InstanceDetail, type InstanceSection } from "@/screens/InstanceDetail";
import type { AvailableVersion, ContentFolder, ExportParts, InstanceEntry, ModrinthKind, PlayState } from "@/types";

type Props = {
  instances: InstanceEntry[];
  selected: string;
  /** Vue Expert : liste de toutes les instances ; Simple : une carte par version. */
  expert: boolean;
  /** État du bouton Jouer de chaque instance. */
  playFor: (id: string) => PlayState;
  /** Instances dont le jeu est ouvert (plusieurs à la fois). */
  running: string[];
  onSelect: (id: string) => void;
  onView: (expert: boolean) => void;
  onPlay: (id: string) => void;
  /** Lance l'instance directement dans un de ses mondes. */
  onPlayWorld: (id: string, world: string) => void;
  /** Exporte une instance personnelle en `.mrpack`. */
  onExport: (id: string, parts: ExportParts) => void;
  /** « Fermer », puis « Forcer » si le jeu ne répond pas. */
  onStop: (id: string, force: boolean) => void;
  /** Avec une version : le panneau s'ouvre dessus, ses instances en tête. */
  onCreate: (minecraft?: string) => void;
  /** Version du panneau de création ouvert : sa carte est surlignée plutôt que celle de l'instance choisie. */
  viewing?: string | null;
  /** Onglet Paramètres de la page d'une instance (réglages propres à l'instance). */
  renderSettings?: (entry: InstanceEntry) => ReactNode;
  onOpenFolder: (id: string, folder: "game" | ContentFolder, world?: string) => void;
  onRemove: (id: string) => void;
  /** Onglet Mods de la page de l'instance choisie (les mods suivent l'instance choisie). */
  mods?: ReactNode;
  /** Change après une installation : la page de l'instance relit son dossier. */
  contentRevision?: number;
  /** Instances des autres launchers, importées comme nouvelles instances. */
  onImport: () => void;
  /** Clic droit : épingler, dupliquer, raccourci sur le bureau (absent si impossible). */
  onPin: (id: string, pinned: boolean) => void;
  onDuplicate: (id: string) => void;
  onShortcut?: (id: string) => void;
  /** Ouvre la recherche Modrinth (packs, shaders, datapacks, modpacks). */
  onSearch: (kind: ModrinthKind) => void;
  services?: Pick<typeof api, "instanceVersions" | "playHistory" | "instanceContent" | "setContentEnabled" | "trashContent" | "renameWorld">;
  /** Noms donnés aux serveurs rejoints, et leur renommage (page d'une instance). */
  serverNames?: Record<string, string>;
  onRenameServer?: (address: string, name: string) => Promise<void>;
};

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
const iconButton = cn(secondaryButton, "w-9 px-0");
const lastPlayed = (entry: InstanceEntry) => (entry.lastPlayed ? `Jouée le ${date.format(new Date(entry.lastPlayed * 1000))}` : "Jamais lancée");

/** « Jouer » sur l'accueil lance l'instance choisie ici. */
export function InstancesScreen(props: Props) {
  const { instances, selected, expert, playFor, onView, onCreate, onRemove } = props;
  const [removing, setRemoving] = useState<InstanceEntry | null>(null);
  const [exporting, setExporting] = useState<InstanceEntry | null>(null);
  /** Instance dont la page est ouverte, et l'onglet ouvert d'abord. */
  const [opened, setOpened] = useState<{ id: string; section?: InstanceSection } | null>(null);
  // Garde le nom affiché pendant l'animation de fermeture.
  const last = useRef(removing);
  if (removing) last.current = removing;
  const current = instances.find((entry) => entry.id === selected) ?? instances[0];
  const onEdit = (entry: InstanceEntry) => setOpened({ id: entry.id, section: "settings" });
  const menu: InstanceActions = {
    onPlay: props.onPlay,
    onStop: props.onStop,
    onSettings: onEdit,
    onOpenFolder: (id) => props.onOpenFolder(id, "game"),
    onPin: props.onPin,
    onDuplicate: props.onDuplicate,
    onExport: setExporting,
    onShortcut: props.onShortcut,
    onAskRemove: setRemoving,
  };
  const actions = {
    ...props,
    current,
    menu,
    onAskRemove: setRemoving,
    onOpen: (id: string) => setOpened({ id }),
    onOpenSection: (entry: InstanceEntry, section: InstanceSection) => setOpened({ id: entry.id, section }),
    onEdit,
  };
  const page = instances.find((entry) => entry.id === opened?.id);

  const exportDialog = <ExportDialog entry={exporting} onExport={(parts) => exporting && props.onExport(exporting.id, parts)} onClose={() => setExporting(null)} />;

  if (page) {
    return (
      <>
        <InstanceDetail
          key={`${page.id}-${opened?.section ?? ""}`}
          defaultSection={opened?.section}
          settings={props.renderSettings?.(page)}
          serverNames={props.serverNames}
          onRenameServer={props.onRenameServer}
          entry={page}
          play={playFor(page.id)}
          running={props.running.includes(page.id)}
          services={props.services}
          onBack={() => setOpened(null)}
          onPlay={() => props.onPlay(page.id)}
          onPlayWorld={(world) => props.onPlayWorld(page.id, world)}
          onExport={page.kind === "clover" ? undefined : () => setExporting(page)}
          onStop={(force) => props.onStop(page.id, force)}
          onOpenFolder={(folder, world) => props.onOpenFolder(page.id, folder, world)}
          mods={page.kind === "vanilla" || page.id !== selected ? undefined : props.mods}
          contentRevision={props.contentRevision}
          onSearch={props.onSearch}
        />
        {exportDialog}
      </>
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
            <button type="button" onClick={props.onImport} className={secondaryButton} title="Instances du launcher officiel, de Modrinth App, Prism, MultiMC ou CurseForge">
              <FolderInput className="size-4" aria-hidden />
              Importer
            </button>
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

      {exportDialog}
    </main>
  );
}

const EXPORT_PARTS: { key: keyof ExportParts; label: string; hint: string; mods?: true }[] = [
  { key: "config", label: "Réglages des mods", hint: "Le dossier config/.", mods: true },
  { key: "resourcePacks", label: "Packs de ressources", hint: "Ceux qui sont activés." },
  { key: "shaderPacks", label: "Shaders", hint: "Ceux qui sont activés.", mods: true },
  { key: "options", label: "Réglages du jeu", hint: "Touches, graphismes et son : ils remplacent ceux de qui importe le modpack." },
];

/** Choix de ce que l'export `.mrpack` ajoute aux mods ; l'emplacement du fichier se choisit ensuite. */
function ExportDialog({ entry, onExport, onClose }: { entry: InstanceEntry | null; onExport: (parts: ExportParts) => void; onClose: () => void }) {
  const [parts, setParts] = useState<ExportParts>({ config: true, resourcePacks: true, shaderPacks: true, options: false });
  // Garde le nom affiché pendant l'animation de fermeture.
  const last = useRef(entry);
  if (entry) last.current = entry;
  const vanilla = last.current?.kind === "vanilla";
  const shown = EXPORT_PARTS.filter((part) => !part.mods || !vanilla);
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="mc-frame gap-5 border-[var(--mc-outline)] bg-card p-6 ring-0 sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Exporter « {last.current?.name} »</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Un modpack .mrpack, que le Clover Launcher, Modrinth App et Prism Launcher savent importer. {vanilla ? "" : "Les mods publiés sur Modrinth seront téléchargés à l'import, les autres sont inclus dans le fichier."}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {shown.map((part) => (
            <li key={part.key} className="flex items-center gap-3">
              <Switch id={`export-${part.key}`} checked={parts[part.key]} onCheckedChange={(checked) => setParts((current) => ({ ...current, [part.key]: checked }))} />
              <label htmlFor={`export-${part.key}`} className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold">{part.label}</span>
                <span className="text-[11px] text-muted-foreground">{part.hint}</span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              // Vanilla n'a ni mods ni shaders : seules ses parties partent.
              onExport({ ...parts, config: parts.config && !vanilla, shaderPacks: parts.shaderPacks && !vanilla });
              onClose();
            }}
            className={primaryButton}
          >
            <PackageOpen className="size-4" aria-hidden />
            Exporter
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Actions = Props & {
  current: InstanceEntry | undefined;
  menu: InstanceActions;
  onAskRemove: (entry: InstanceEntry) => void;
  onOpen: (id: string) => void;
  onOpenSection: (entry: InstanceEntry, section: InstanceSection) => void;
  onEdit: (entry: InstanceEntry) => void;
};

/**
 * Une carte illustrée par famille de versions. Un clic choisit la dernière instance jouée de la
 * famille et ouvre le panneau de droite sur cette version : ses instances, puis la création.
 */
function Simple({ instances, current, viewing, running, playFor, menu, onSelect, onCreate, services = api }: Actions) {
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
  const activeFamily = viewing ? versionFamily(viewing) : current?.minecraft && versionFamily(current.minecraft);

  return (
    <>
      <p className="mt-4 text-sm text-muted-foreground">
        {failed ? "Liste des versions indisponible : seules tes instances sont affichées." : "Choisis une version pour voir tes instances ou en créer une."}
      </p>
      <ul aria-label="Versions de Minecraft" className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {families.map((family) => {
          const members = instances.filter((entry) => entry.minecraft && versionFamily(entry.minecraft) === family.id);
          const active = family.id === activeFamily;
          const clover = members.some((entry) => entry.kind === "clover");
          // La plus récemment jouée de la famille, pour qu'un clic reprenne là où on s'était arrêté.
          const pick = [...members].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0];
          // Versions de la famille, celles qui ont une instance d'abord ; deux affichées, le reste en « +N ».
          const used = new Set(members.map((entry) => entry.minecraft));
          const shownVersions = [...family.versions].sort((a, b) => Number(used.has(b)) - Number(used.has(a))).slice(0, 2);
          const card = (
            <li key={family.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (pick) onSelect(pick.id);
                  onCreate(family.versions[0]);
                }}
                className={cn(
                  "group relative flex h-full w-full flex-col overflow-hidden rounded-lg border-2 bg-card text-left transition-colors duration-300 hover:bg-[#241f19]",
                  active ? "border-primary" : "border-border hover:border-[#e9e3d4]/30",
                )}
              >
                <span className="relative block aspect-[16/10] overflow-hidden">
                  <img src={versionImage(family.id)} alt="" className="size-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.04]" />
                  {family.versions.length > 1 && (
                    <span className="absolute bottom-2 left-2 flex items-center gap-1" title={family.versions.join(", ")}>
                      {shownVersions.map((version) => (
                        <span key={version} className={cn("rounded px-1.5 py-0.5 font-pixel text-[10px] leading-none", used.has(version) ? "bg-primary text-primary-foreground" : "bg-[#14120f]/85 text-white/90")}>
                          {version}
                        </span>
                      ))}
                      {family.versions.length > 2 && <span className="rounded bg-[#14120f]/85 px-1.5 py-0.5 font-pixel text-[10px] leading-none text-white/70">+{family.versions.length - 2}</span>}
                    </span>
                  )}
                </span>
                {members.some((entry) => running.includes(entry.id)) && <RunningBadge className="absolute top-2 left-2 bg-[#14120f]/85 px-2 py-0.5 text-[10px]" />}
                {active && (
                  <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-md bg-primary text-primary-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-300">
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </span>
                )}
                <span className="flex h-8 items-end justify-between gap-2 px-3.5">
                  <span className="font-pixel text-lg leading-none">{family.id}</span>
                  {clover && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Serveur</span>}
                </span>
                <span className="truncate px-3.5 pt-1 pb-3.5 text-xs text-muted-foreground">
                  {members.length > 0 ? (
                    members.length === 1 ? members[0].name : `${members.length} instances`
                  ) : (
                    <span className="flex items-center gap-1.5 font-semibold text-accent opacity-80 group-hover:opacity-100">
                      <Plus className="size-3.5" aria-hidden />
                      Créer une instance
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
          // Clic droit : l'instance qu'un clic reprendrait.
          return pick ? (
            <InstanceMenu key={family.id} entry={pick} play={playFor(pick.id)} actions={menu}>
              {card}
            </InstanceMenu>
          ) : (
            card
          );
        })}
      </ul>
    </>
  );
}

/**
 * Sous les cartes : l'instance choisie, la variante à lancer quand la version en a plusieurs, ses
 * raccourcis (mods, mondes, dossier, paramètres) et « Jouer ». Les raccourcis perdent leur nom
 * quand la fenêtre est étroite.
 */
function LaunchBar({ instances, current, playFor, running, onSelect, onPlay, onStop, onEdit, onOpenSection, onOpenFolder }: Actions & { current: InstanceEntry }) {
  const play = playFor(current.id);
  const siblings = instances.filter((entry) => entry.minecraft && current.minecraft && versionFamily(entry.minecraft) === versionFamily(current.minecraft));
  const { Icon } = KINDS[current.kind];
  const isRunning = running.includes(current.id);
  const shortcuts = [
    ...(current.kind === "vanilla" ? [] : [{ label: "Mods", Icon: Puzzle, onClick: () => onOpenSection(current, "mods") }]),
    { label: "Mondes", Icon: Globe, onClick: () => onOpenSection(current, "saves") },
    { label: "Dossier", Icon: FolderOpen, onClick: () => onOpenFolder(current.id, "game") },
    { label: "Paramètres", Icon: Settings2, onClick: () => onEdit(current) },
  ];
  return (
    <aside aria-label="Instance choisie" className="@container flex shrink-0 items-center gap-4 border-t border-border bg-[#100e0b] px-12 py-4">
      <span key={`${current.id}-art`} className="relative shrink-0 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300">
        <img src={versionImage(current.minecraft ?? "")} alt="" className="size-14 rounded-lg object-cover" />
        <span className={cn("absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-md border-2 border-[#100e0b]", current.kind === "clover" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
          <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
        </span>
      </span>
      <div key={`${current.id}-info`} className="flex min-w-0 flex-col gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
        <span className="flex min-w-0 items-center gap-2.5">
          {siblings.length > 1 ? (
            <Select value={current.id} onValueChange={(id) => id && onSelect(id)}>
              <SelectTrigger aria-label="Instance à lancer" className="h-10 w-72 text-sm font-semibold">
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
            <span className="truncate font-display text-xl leading-none">{current.name}</span>
          )}
          {isRunning && <RunningBadge />}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          <span className="font-pixel text-[12px] text-foreground/80">{instanceSummary(current)}</span>
          {` · ${lastPlayed(current)}`}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {shortcuts.map(({ label, Icon: ShortcutIcon, onClick }) => (
          <button key={label} type="button" title={label} aria-label={`${label} de ${current.name}`} onClick={onClick} className={cn(secondaryButton, "h-11 w-11 px-0 @[60rem]:w-auto @[60rem]:px-3.5")}>
            <ShortcutIcon className="size-4" aria-hidden />
            <span className="hidden @[60rem]:inline">{label}</span>
          </button>
        ))}
      </div>
      <GameButton state={play} name={current.name} onPlay={() => onPlay(current.id)} onStop={(force) => onStop(current.id, force)} disabled={!current.minecraft} className="h-12 w-40 text-[15px]" />
    </aside>
  );
}

/** Toutes les instances, avec recherche et tri. */
function Expert({ instances, selected, playFor, running, menu, onSelect, onOpen, onPlay, onStop, onEdit, onOpenFolder, onAskRemove }: Actions) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "recent">("recent");
  const shown = instances
    .filter((entry) => `${entry.name} ${instanceSummary(entry)}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort(sort === "recent" ? (a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) : (a, b) => a.name.localeCompare(b.name, "fr"))
    // Épinglées en haut, dans l'ordre choisi.
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

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
          const play = playFor(entry.id);
          // Pas de modification ni de retrait pendant le lancement ou la partie de l'instance.
          const locked = play.kind !== "ready";
          const { Icon } = KINDS[entry.kind];
          return (
            <InstanceMenu key={entry.id} entry={entry} play={play} actions={menu}>
            <li className="relative flex items-center gap-4 px-4 py-3">
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
                  {entry.pinned && <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Épinglée" />}
                  {active && <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Choisie</span>}
                  {running.includes(entry.id) && <RunningBadge />}
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
                <button type="button" title="Modifier" aria-label={`Modifier ${entry.name}`} onClick={() => onEdit(entry)} className={iconButton}>
                  <Settings2 className="size-4" aria-hidden />
                </button>
                {entry.id !== "clover" && (
                  <button type="button" title="Retirer" aria-label={`Retirer ${entry.name}`} onClick={() => onAskRemove(entry)} disabled={locked} className={cn(iconButton, "hover:text-destructive")}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
                <GameButton state={play} name={entry.name} onPlay={() => onPlay(entry.id)} onStop={(force) => onStop(entry.id, force)} disabled={!entry.minecraft} className="ml-1 w-28" />
              </div>
            </li>
            </InstanceMenu>
          );
        })}
        {shown.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Aucune instance ne correspond à ta recherche.</p>}
      </ul>
    </>
  );
}
