import { Box, Clover, Database, FolderOpen, Globe, Heart, Image as ImageIcon, PackageOpen, Play, Search, Server, Settings2, SquareTerminal, Sun, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { Breadcrumb } from "@/components/Breadcrumb";
import { RunningBadge } from "@/components/RunningBadge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { GameButton } from "@/components/GameButton";
import { InlineRename } from "@/components/InlineRename";
import { ModIcon } from "@/components/ModIcon";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { opensWorldsDirectly } from "@/lib/game-versions";
import { KINDS, instanceSummary } from "@/lib/instances";
import { formatDuration, playStats, topServers } from "@/lib/play-history";
import { cn } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import type { ContentEntry, ContentFolder, InstanceEntry, ModrinthKind, PlaySession, PlayState, WorldInfo } from "@/types";

type Services = Pick<typeof api, "playHistory" | "instanceContent" | "setContentEnabled" | "trashContent" | "renameWorld">;

type Props = {
  entry: InstanceEntry;
  play: PlayState;
  running: boolean;
  onBack: () => void;
  onPlay: () => void;
  /** Lance le jeu directement dans ce monde (dossier de `saves/`). */
  onPlayWorld?: (world: string) => void;
  /** Export en `.mrpack` ; absent pour l'instance Clover Games, qui suit le serveur. */
  onExport?: () => void;
  onStop: (force: boolean) => void;
  /** Contenu de l'onglet Paramètres (réglages propres à l'instance). */
  settings?: ReactNode;
  /** Noms donnés aux serveurs rejoints, par adresse en minuscules. */
  serverNames?: Record<string, string>;
  /** Renomme un serveur hors Clover Games. */
  onRenameServer?: (address: string, name: string) => Promise<void>;
  /** `world` : dossier d'un monde précis. */
  onOpenFolder: (folder: "game" | ContentFolder, world?: string) => void;
  /** Contenu de l'onglet Mods ; absent pour Vanilla, qui se lance sans mods. */
  mods?: ReactNode;
  /** Change après une installation : l'onglet ouvert relit son dossier. */
  contentRevision?: number;
  /** Ouvre la recherche Modrinth sur ce type de contenu. */
  onSearch?: (kind: ModrinthKind) => void;
  /** Onglet ouvert au premier rendu (maquettes). */
  defaultSection?: Section;
  services?: Services;
};

type Section = "overview" | "mods" | ContentFolder | "settings";
export type InstanceSection = Section;

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Aperçu" },
  { id: "mods", label: "Mods" },
  { id: "saves", label: "Mondes" },
  { id: "datapacks", label: "Datapacks" },
  { id: "resourcepacks", label: "Packs de ressources" },
  { id: "shaderpacks", label: "Shaders" },
  { id: "screenshots", label: "Captures" },
  { id: "settings", label: "Paramètres" },
];

const SERVER = "play.clovergames.fr";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const sessionFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const sizeFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const iconButton = cn(secondaryButton, "h-11 w-11 px-0");
const card = "rounded-lg border border-border bg-card";

function formatSize(bytes: number): string {
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${sizeFormat.format(value)} ${units[unit]}`;
}

/** Page d'une instance : son temps de jeu, son activité, ses serveurs et le contenu de son dossier. */
export function InstanceDetail({ entry, play, running, onBack, onPlay, onPlayWorld, onExport, onStop, settings, serverNames = {}, onRenameServer, onOpenFolder, mods, contentRevision = 0, onSearch, defaultSection = "overview", services = api }: Props) {
  const [section, setSection] = useState<Section>(defaultSection);
  const { Icon } = KINDS[entry.kind];
  // Les shaders passent par Iris, un mod : Vanilla n'en charge pas.
  const sections = SECTIONS.filter((item) => (item.id !== "shaderpacks" || entry.kind !== "vanilla") && (item.id !== "mods" || mods) && (item.id !== "settings" || settings));

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Breadcrumb trail={["Instances", entry.name]} onBack={onBack} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-8">
        <header className="relative shrink-0 overflow-hidden border-b border-border">
          <img src={versionImage(entry.minecraft ?? "")} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#14120f] via-[#14120f]/85 to-[#14120f]/30" aria-hidden />
          <div className="relative flex items-end gap-5 px-12 pt-10 pb-6">
            <span className="relative shrink-0">
              <img src={versionImage(entry.minecraft ?? "")} alt="" className="size-20 rounded-lg border-2 border-[var(--mc-outline)] object-cover" />
              <span className={cn("absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-md border-2 border-[#14120f]", entry.kind === "clover" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                <Icon className="size-4" strokeWidth={2.5} aria-hidden />
              </span>
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <h1 className="truncate font-display text-[30px] leading-none">{entry.name}</h1>
              <p className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border bg-[#100e0b]/80 px-2 py-1 font-pixel text-[11px]">{instanceSummary(entry)}</span>
                {entry.kind === "clover" && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Serveur</span>}
                {running && <RunningBadge />}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onExport && (
                <button type="button" title="Exporter en modpack" aria-label={`Exporter ${entry.name} en modpack`} onClick={onExport} disabled={!entry.minecraft} className={iconButton}>
                  <PackageOpen className="size-4" aria-hidden />
                </button>
              )}
              <button type="button" title="Ouvrir le dossier" aria-label="Ouvrir le dossier de jeu" onClick={() => onOpenFolder("game")} className={iconButton}>
                <FolderOpen className="size-4" aria-hidden />
              </button>
              <button type="button" title="Paramètres de l'instance" aria-label={`Paramètres de ${entry.name}`} onClick={() => setSection("settings")} disabled={!settings} className={iconButton}>
                <Settings2 className="size-4" aria-hidden />
              </button>
              <GameButton state={play} name={entry.name} onPlay={onPlay} onStop={onStop} disabled={!entry.minecraft} className="h-11 w-36 text-sm" />
            </div>
          </div>
        </header>

        <nav className="flex items-center gap-4 px-12 pt-5">
          <div role="tablist" aria-label="Sections" className="flex gap-1 rounded-lg border border-border bg-[#100e0b] p-1">
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={section === item.id}
                onClick={() => setSection(item.id)}
                className={cn("rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors", section === item.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="px-12 pt-5">
          {section === "overview" ? (
            <Overview entry={entry} running={running} services={services} serverNames={serverNames} onRenameServer={onRenameServer} />
          ) : section === "mods" ? (
            mods
          ) : section === "settings" ? (
            settings
          ) : (
            <Content
              key={`${section}-${contentRevision}`}
              entry={entry}
              folder={section}
              services={services}
              running={running}
              // Comme « Jouer » : un lancement à la fois, et Minecraft 1.20 au moins.
              onPlayWorld={onPlayWorld && entry.minecraft && opensWorldsDirectly(entry.minecraft) && play.kind === "ready" && !play.busy ? onPlayWorld : undefined}
              onOpenFolder={(world) => onOpenFolder(section, world)}
              onSearch={onSearch && SEARCH[section] ? () => onSearch(SEARCH[section]!) : undefined}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function Overview({
  entry,
  running,
  services,
  serverNames,
  onRenameServer,
}: {
  entry: InstanceEntry;
  running: boolean;
  services: Services;
  serverNames: Record<string, string>;
  onRenameServer?: (address: string, name: string) => Promise<void>;
}) {
  const [renameError, setRenameError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<PlaySession[] | null>(null);

  // Rechargé à la fermeture du jeu : la partie vient d'être enregistrée.
  useEffect(() => {
    if (running) return;
    let alive = true;
    services.playHistory(entry.id).then((list) => alive && setSessions(list)).catch(() => alive && setSessions([]));
    return () => {
      alive = false;
    };
  }, [entry.id, running, services]);

  const stats = playStats(sessions ?? []);
  const servers = topServers(sessions ?? []);
  const recent = [...(sessions ?? [])].reverse().slice(0, 5);
  const facts: [string, string][] = [
    ["Version", entry.minecraft ?? "…"],
    ["Type", `${KINDS[entry.kind].label}${entry.loader ? ` ${entry.loader}` : ""}`],
    ["Dossier", entry.id === "clover" || !entry.separate ? "Commun" : "Séparé"],
    ["Mémoire", entry.memoryMb ? `${entry.memoryMb / 1024} Go` : "Réglage du launcher"],
    ["Dernière partie", entry.lastPlayed ? dateFormat.format(new Date(entry.lastPlayed * 1000)) : "Jamais"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-3">
        {(
          [
            ["Temps de jeu", stats.count ? formatDuration(stats.total) : "—"],
            ["Parties", String(stats.count)],
            ["Moyenne", stats.count ? formatDuration(stats.average) : "—"],
            ["Plus longue", stats.count ? formatDuration(stats.longest) : "—"],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className={cn(card, "flex flex-col gap-1.5 px-4 py-3.5")}>
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
            <span className="font-display text-2xl leading-none">{sessions ? value : "…"}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
        <section className={cn(card, "flex flex-col gap-3 p-4")}>
          <h2 className="text-[13px] font-bold">Activité</h2>
          <ActivityHeatmap sessions={sessions ?? []} />
          {sessions?.length === 0 && <p className="text-xs text-muted-foreground">Aucune partie enregistrée pour l'instant : le temps de jeu se compte à partir de cette version du launcher.</p>}
        </section>
        <section className={cn(card, "flex flex-col p-4")}>
          <h2 className="text-[13px] font-bold">Fiche</h2>
          <dl className="mt-2 flex flex-col">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-right text-[13px] font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-auto truncate pt-2 font-mono text-[11px] text-muted-foreground select-text" title={entry.gameDir}>
            {entry.gameDir}
          </p>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className={cn(card, "flex flex-col gap-2 p-4")}>
          <h2 className="text-[13px] font-bold">Dernières parties</h2>
          {recent.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Aucune partie.</p>}
          <ul className="flex flex-col gap-1.5">
            {recent.map((session) => (
              <li key={session.started} className="flex items-center gap-3 rounded-md bg-[#100e0b] px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{sessionFormat.format(new Date(session.started * 1000))}</span>
                <span className="font-semibold">{formatDuration(session.seconds)}</span>
                {session.code === 0 ? (
                  <span className="w-20 rounded-full bg-primary/15 px-2 py-0.5 text-center text-[10px] font-bold text-primary">Terminée</span>
                ) : (
                  <span title={session.code === null ? "Jeu arrêté" : `Code de sortie ${session.code}`} className="w-20 rounded-full bg-destructive/15 px-2 py-0.5 text-center text-[10px] font-bold text-destructive">
                    Plantage
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className={cn(card, "flex flex-col gap-2 p-4")}>
          <h2 className="text-[13px] font-bold">Serveurs</h2>
          {renameError && <p className="text-xs text-[#f3a19e]">{renameError}</p>}
          {servers.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Aucun serveur rejoint.</p>}
          <ul className="flex flex-col gap-1.5">
            {servers.slice(0, 5).map((server) => {
              const clover = server.address === SERVER || server.address.endsWith(`.${SERVER}`);
              const ServerIcon = clover ? Clover : Server;
              return (
                <li key={server.address} className="flex items-center gap-3 rounded-md bg-[#100e0b] px-3 py-2">
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", clover ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                    <ServerIcon className="size-4" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {clover || !onRenameServer ? (
                      <span className="truncate text-[13px] font-semibold">{server.address}</span>
                    ) : (
                      <InlineRename
                        value={serverNames[server.address.toLowerCase()] ?? server.address}
                        label={`le serveur ${server.address}`}
                        placeholder={server.address}
                        onRename={(name) => onRenameServer(server.address, name)}
                        onError={setRenameError}
                        className="text-[13px] font-semibold"
                      />
                    )}
                    <span className="text-[11px] text-muted-foreground">{server.sessions > 1 ? `${server.sessions} parties` : "1 partie"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDuration(server.seconds)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Contenu Modrinth ajouté depuis chaque onglet : les datapacks vont dans un monde. */
const SEARCH: Partial<Record<ContentFolder, ModrinthKind>> = { datapacks: "datapack", resourcepacks: "resourcepack", shaderpacks: "shader" };
const SEARCH_LABEL: Record<string, string> = { datapack: "Ajouter des datapacks", resourcepack: "Rechercher des packs", shader: "Rechercher des shaders" };

const MODES: Record<NonNullable<WorldInfo["mode"]>, string> = { survival: "Survie", creative: "Créatif", adventure: "Aventure", spectator: "Spectateur" };
const DIFFICULTIES: Record<NonNullable<WorldInfo["difficulty"]>, string> = { peaceful: "Paisible", easy: "Facile", normal: "Normale", hard: "Difficile" };
const relativeFormat = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

/** Nom donné en jeu, sinon celui du dossier. */
const worldName = (world: ContentEntry) => world.level?.name ?? world.name;

/** « Joué aujourd'hui », « Joué il y a 3 jours », puis la date. */
function playedAgo(seconds: number | null): string {
  if (!seconds) return "Jamais joué";
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(seconds * 1000))) / 86_400_000);
  return days < 7 ? `Joué ${relativeFormat.format(-days, "day")}` : `Joué le ${dateFormat.format(new Date(seconds * 1000))}`;
}

/** Monde : miniature, nom donné en jeu, mode et difficulté, version, puis dernière partie et taille. */
function WorldCard({
  world,
  minecraft,
  onPlay,
  onOpenFolder,
  onRename,
  onError,
  locked,
  trashButton,
}: {
  world: ContentEntry;
  minecraft: string | null;
  /** Absent pendant un lancement ou une partie, et avant Minecraft 1.20. */
  onPlay?: () => void;
  onOpenFolder: () => void;
  onRename: (name: string) => Promise<void>;
  onError: (message: string) => void;
  /** Partie en cours : le jeu réécrirait le nom en sauvegardant. */
  locked: boolean;
  trashButton: ReactNode;
}) {
  const level = world.level;
  const name = worldName(world);
  // Un monde rouvert dans une autre version est converti par le jeu : mieux vaut le savoir avant.
  const otherVersion = level?.version && minecraft && level.version !== minecraft;
  const chip = "flex items-center gap-1 rounded-md border border-border bg-[#100e0b] px-1.5 py-0.5 text-[11px] text-muted-foreground";
  return (
    <li className={cn(card, "flex overflow-hidden transition-colors hover:border-[#4a4237]")}>
      {world.image ? (
        <img src={world.image} alt="" className="size-[104px] shrink-0 border-r border-border object-cover [image-rendering:pixelated]" />
      ) : (
        <span className="grid size-[104px] shrink-0 place-items-center border-r border-border bg-gradient-to-b from-[#2b3a2a] to-[#1b2418] text-primary/70">
          <Globe className="size-8" aria-hidden />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <InlineRename value={name} label={`le monde ${name}`} onRename={onRename} onError={onError} disabled={locked} className="text-sm font-semibold" />
          {level?.version && (
            <span
              title={otherVersion ? `Dernière partie en ${level.version} : l'ouvrir en ${minecraft} le convertit.` : `Dernière partie en ${level.version}`}
              className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-pixel text-[10px]", otherVersion ? "bg-accent/15 text-accent" : "bg-[#100e0b] text-muted-foreground")}
            >
              {level.version}
            </span>
          )}
        </div>
        {level && (
          <p className="flex flex-wrap items-center gap-1.5">
            {level.mode && <span className={chip}>{MODES[level.mode]}</span>}
            {level.hardcore ? (
              <span className={cn(chip, "border-destructive/40 text-destructive")}>
                <Heart className="size-3 fill-current" aria-hidden />
                Hardcore
              </span>
            ) : (
              level.difficulty && <span className={chip}>{DIFFICULTIES[level.difficulty]}</span>
            )}
            {level.commands && (
              <span className={chip}>
                <SquareTerminal className="size-3" aria-hidden />
                Commandes
              </span>
            )}
            {level.datapacks > 0 && (
              <span className={chip}>
                <Database className="size-3" aria-hidden />
                {level.datapacks} datapack{level.datapacks > 1 ? "s" : ""}
              </span>
            )}
          </p>
        )}
        <div className="mt-auto flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {playedAgo(world.modified)} · {formatSize(world.size)}
          </span>
          {onPlay && (
            <button
              type="button"
              onClick={onPlay}
              aria-label={`Jouer dans ${name}`}
              title="Jouer dans ce monde"
              className="grid size-8 shrink-0 place-items-center rounded-md text-primary transition-colors hover:bg-primary/15"
            >
              <Play className="size-4 fill-current" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenFolder}
            aria-label={`Ouvrir le dossier de ${name}`}
            title="Ouvrir le dossier"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <FolderOpen className="size-4" aria-hidden />
          </button>
          {trashButton}
        </div>
      </div>
    </li>
  );
}

const EMPTY: Record<ContentFolder, string> = {
  saves: "Aucun monde : crée-en un en jeu, il apparaîtra ici.",
  datapacks: "Aucun datapack : ajoute-en un à l'un de tes mondes.",
  resourcepacks: "Aucun pack de ressources : dépose un .zip dans le dossier.",
  shaderpacks: "Aucun shader : dépose un .zip dans le dossier.",
  screenshots: "Aucune capture : appuie sur F2 en jeu.",
};

function Content({
  entry,
  folder,
  services,
  running,
  onPlayWorld,
  onOpenFolder,
  onSearch,
}: {
  entry: InstanceEntry;
  folder: ContentFolder;
  services: Services;
  running: boolean;
  onPlayWorld?: (world: string) => void;
  onOpenFolder: (world?: string) => void;
  onSearch?: () => void;
}) {
  const [list, setList] = useState<ContentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ContentEntry | null>(null);
  /** Monde dont la suppression attend confirmation. */
  const [trashing, setTrashing] = useState<ContentEntry | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    services.instanceContent(entry.id, folder).then((items) => alive && setList(items)).catch((reason) => alive && setError(String(reason)));
    return () => {
      alive = false;
    };
  }, [entry.id, folder, services, revision]);

  const key = (item: ContentEntry) => `${item.world ?? ""}/${item.enabled ? "" : "-"}${item.name}`;
  /** Une erreur (pack ouvert par le jeu…) s'affiche, puis la liste est relue depuis le disque. */
  const change = async (action: Promise<void>, optimistic?: (items: ContentEntry[]) => ContentEntry[]) => {
    setError(null);
    if (optimistic) setList((items) => items && optimistic(items));
    await action.catch((reason) => setError(String(reason)));
    setRevision((value) => value + 1);
  };
  const toggle = (item: ContentEntry, enabled: boolean) =>
    change(services.setContentEnabled(entry.id, folder, item, enabled), (items) => items.map((other) => (key(other) === key(item) ? { ...other, enabled } : other)));
  const trash = (item: ContentEntry) => change(services.trashContent(entry.id, folder, item), (items) => items.filter((other) => key(other) !== key(item)));
  const trashButton = (item: ContentEntry, label: string, onClick: () => void = () => void trash(item)) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Mettre ${label} à la corbeille`}
      title="Mettre à la corbeille"
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );

  const total = (list ?? []).reduce((sum, item) => sum + item.size, 0);
  const shared = entry.id === "clover" || !entry.separate;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          {list ? `${list.length} ${folder === "saves" ? "monde" : "élément"}${list.length > 1 ? "s" : ""} · ${formatSize(total)}` : error ? "" : "Chargement…"}
          {shared && " · dossier commun aux instances qui le partagent"}
        </p>
        <button type="button" onClick={() => onOpenFolder()} className={secondaryButton}>
          <FolderOpen className="size-4" aria-hidden />
          Ouvrir le dossier
        </button>
        {onSearch && SEARCH[folder] && (
          <button type="button" onClick={onSearch} className={primaryButton}>
            <Search className="size-4" aria-hidden />
            {SEARCH_LABEL[SEARCH[folder]]}
          </button>
        )}
      </div>

      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{error}</p>}
      {list?.length === 0 && <p className={cn(card, "py-12 text-center text-sm text-muted-foreground")}>{EMPTY[folder]}</p>}

      {list && folder === "saves" && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
          {list.map((world) => (
            <WorldCard
              key={world.name}
              world={world}
              minecraft={entry.minecraft}
              onPlay={onPlayWorld && (() => onPlayWorld(world.name))}
              onOpenFolder={() => onOpenFolder(world.name)}
              onRename={(name) => services.renameWorld(entry.id, world.name, name).then(() => setRevision((value) => value + 1))}
              onError={setError}
              locked={running}
              trashButton={trashButton(world, `le monde ${worldName(world)}`, () => setTrashing(world))}
            />
          ))}
        </ul>
      )}

      {list && (folder === "resourcepacks" || folder === "shaderpacks" || folder === "datapacks") && (
        <ul className="flex flex-col gap-2">
          {list.map((pack) => {
            const PackIcon = folder === "shaderpacks" ? Sun : folder === "datapacks" ? Database : Box;
            // Comme « Mes mods » : nom du projet Modrinth, le fichier en dessous. Sans projet, le nom
            // du fichier, sans extension ni codes couleur de Minecraft (« §6 »).
            const title = pack.title ?? pack.name.replace(/\.zip$/i, "").replace(/§./g, "");
            return (
              <li key={key(pack)} className={cn(card, "flex items-center gap-3 px-3 py-2", !pack.enabled && "bg-[#17150f]")}>
                <Switch
                  id={`pack-${key(pack)}`}
                  checked={pack.enabled}
                  onCheckedChange={(enabled) => void toggle(pack, enabled)}
                  aria-label={`${pack.enabled ? "Désactiver" : "Activer"} ${title}`}
                />
                <ModIcon src={pack.icon} fallback={<PackIcon className="size-5 text-muted-foreground" />} className={cn("size-10", !pack.enabled && "opacity-50")} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("truncate text-[13px] font-semibold", !pack.enabled && "text-muted-foreground")}>{title}</span>
                  <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                    {pack.world && (
                      <span className="flex shrink-0 items-center gap-1 rounded-[4px] bg-secondary px-1.5 py-px text-foreground">
                        <Globe className="size-3" aria-hidden />
                        {pack.world}
                      </span>
                    )}
                    {pack.title && <span className="truncate font-mono">{pack.name}</span>}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{pack.modified ? dateFormat.format(new Date(pack.modified * 1000)) : ""}</span>
                <span className="w-20 text-right text-xs text-muted-foreground">{formatSize(pack.size)}</span>
                {trashButton(pack, title)}
              </li>
            );
          })}
        </ul>
      )}

      {list && folder === "screenshots" && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {list.map((shot) => (
            <li key={shot.name} className="group/shot relative">
              <span className="absolute top-1.5 right-1.5 z-10 rounded-md bg-card/90 opacity-0 transition-opacity group-focus-within/shot:opacity-100 group-hover/shot:opacity-100">
                {trashButton(shot, `la capture ${shot.name}`)}
              </span>
              <button type="button" onClick={() => setViewing(shot)} className="group flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-accent">
                {shot.image ? (
                  <img src={shot.image} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                ) : (
                  <ImageIcon className="aspect-video w-full p-8 text-muted-foreground" aria-hidden />
                )}
                <span className="truncate px-3 py-2 text-[11px] text-muted-foreground group-hover:text-foreground">{shot.modified ? sessionFormat.format(new Date(shot.modified * 1000)) : shot.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={trashing !== null} onOpenChange={(open) => !open && setTrashing(null)}>
        <DialogContent className="mc-frame gap-5 border-[var(--mc-outline)] bg-card p-6 ring-0 sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">Supprimer « {trashing && worldName(trashing)} » ?</DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Le monde part à la corbeille de l'ordinateur : tu peux encore l'en sortir tant qu'elle n'est pas vidée.
              {shared && " Il disparaît aussi des instances qui partagent ce dossier."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4">
            <button type="button" onClick={() => setTrashing(null)} className={secondaryButton}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => {
                if (trashing) void trash(trashing);
                setTrashing(null);
              }}
              className={cn(primaryButton, "bg-destructive text-white")}
            >
              <Trash2 className="size-4" aria-hidden />
              Mettre à la corbeille
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="mc-frame gap-3 border-[var(--mc-outline)] bg-card p-3 ring-0 sm:max-w-[min(1100px,90vw)]">
          <DialogTitle className="truncate pr-8 text-[13px] font-semibold">{viewing?.name}</DialogTitle>
          {viewing?.image && <img src={viewing.image} alt={viewing.name} className="max-h-[75vh] w-full rounded-md object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
