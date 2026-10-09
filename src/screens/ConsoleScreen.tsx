import { ArrowDown, Check, Copy, Eraser, FolderOpen, Search } from "lucide-react";
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ShareLogButton } from "@/components/ShareLogButton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { secondaryButton } from "@/lib/buttons";
import { formatLog, logPrefix } from "@/lib/log";
import { cn } from "@/lib/utils";
import type { GameLogFile, LogEntry, LogLevel } from "@/types";

/** Valeur du choix « en direct » dans la liste des journaux. */
const LIVE = "live";
const fileDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** « Dernière partie », « Partie du 3 oct. (2) », « Plantage du 3 oct. 2026 à 21:14 ». */
function fileLabel(file: GameLogFile): string {
  const when = file.modified ? fileDate.format(new Date(file.modified * 1000)) : file.name;
  if (file.folder === "crashReports") return `Plantage · ${when}`;
  if (file.name === "latest.log") return `Dernière partie · ${when}`;
  const archived = file.name.match(/^(\d{4})-(\d{2})-(\d{2})-(\d+)\.log(\.gz)?$/);
  if (archived) {
    const [, year, month, day, rank] = archived;
    const date = new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    return `Partie du ${date}${rank === "1" ? "" : ` (${rank})`}`;
  }
  return file.name;
}

const fileKey = (file: GameLogFile) => `${file.folder}/${file.name}`;

const LEVELS: { id: LogLevel; label: string; tone: string }[] = [
  { id: "info", label: "Infos", tone: "text-[#cfc8b8]" },
  { id: "warn", label: "Avertissements", tone: "text-accent" },
  { id: "error", label: "Erreurs", tone: "text-[#f3a19e]" },
];
const TONE = Object.fromEntries(LEVELS.map((level) => [level.id, level.tone])) as Record<LogLevel, string>;

/** Écart au bas de la liste sous lequel elle continue de suivre les nouvelles lignes. */
const FOLLOW_SLACK = 24;

const matches = (entry: LogEntry, query: string) =>
  [entry.message, entry.logger, entry.thread, entry.throwable].some((text) => text?.toLowerCase().includes(query));

/**
 * Sortie du jeu, en direct pendant la partie, sinon celle de la dernière partie. Filtrable par
 * niveau et par texte ; « Copier » prend les lignes affichées, au format de `latest.log`,
 * « Partager » publie tout le journal affiché (sans filtre) pour le support, et « Effacer » vide
 * la console (pas le fichier journal). La liste suit les nouvelles lignes tant
 * qu'on reste en bas.
 */
export function ConsoleScreen({
  entries: live,
  running,
  onClear,
  onOpenLogs,
  instances,
  instance,
  onInstance,
  services = api,
}: {
  entries: LogEntry[];
  running: boolean;
  onClear: () => void;
  onOpenLogs: () => void;
  /** Instances dont on peut relire les anciens journaux ; `running` : son jeu est ouvert. */
  instances: { id: string; name: string; running?: boolean }[];
  /** Instance affichée : sa partie en direct ou ses anciens journaux. */
  instance: string;
  onInstance: (id: string) => void;
  services?: Pick<typeof api, "gameLogs" | "readGameLog">;
}) {
  // Source affichée : la partie en direct, ou un ancien journal de l'instance choisie.
  const [files, setFiles] = useState<GameLogFile[]>([]);
  const [source, setSource] = useState(LIVE);
  const [archived, setArchived] = useState<{ key: string; entries: LogEntry[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    services.gameLogs(instance).then((list) => alive && setFiles(list)).catch(() => alive && setFiles([]));
    return () => {
      alive = false;
    };
  }, [instance, services, running]);
  const file = source === LIVE ? null : (files.find((entry) => fileKey(entry) === source) ?? null);
  useEffect(() => {
    if (!file) return;
    let alive = true;
    setLoadError(null);
    services
      .readGameLog(instance, file)
      .then((list) => alive && setArchived({ key: fileKey(file), entries: list }))
      .catch((reason) => alive && setLoadError(String(reason)));
    return () => {
      alive = false;
    };
    // `file` change d'objet à chaque relecture de la liste : seule sa clé compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, source, services]);
  const reading = file !== null;
  const entries = reading ? (archived?.key === source ? archived.entries : []) : live;

  const [levels, setLevels] = useState<Set<LogLevel>>(() => new Set(["info", "warn", "error"]));
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const counts = { info: 0, warn: 0, error: 0 };
  for (const entry of entries) counts[entry.level] += 1;
  const shown = entries.filter((entry) => levels.has(entry.level) && (!deferredQuery || matches(entry, deferredQuery)));

  useLayoutEffect(() => {
    if (follow && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [shown.length, follow]);

  const toggleLevel = (level: LogLevel) =>
    setLevels((current) => {
      const next = new Set(current);
      if (!next.delete(level)) next.add(level);
      return next;
    });

  const copy = async () => {
    await navigator.clipboard.writeText(formatLog(shown));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col px-12 pt-8 pb-8">
      <header className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[30px] leading-none">Console</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {reading ? (
              loadError ?? (archived?.key === source ? `${fileLabel(file)} : ${file.name}` : "Lecture du journal…")
            ) : running ? (
              <>
                <span className="size-2 rounded-full bg-primary" aria-hidden />
                Minecraft est lancé : sortie du jeu en direct.
              </>
            ) : entries.length > 0 ? (
              "Sortie de la dernière partie."
            ) : (
              "La sortie du jeu s'affichera ici pendant la partie."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={copy} disabled={shown.length === 0} className={secondaryButton}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copié" : "Copier"}
          </button>
          <ShareLogButton log={() => formatLog(entries)} disabled={entries.length === 0} />
          <button
            type="button"
            onClick={() => {
              setFollow(true);
              onClear();
            }}
            disabled={reading || entries.length === 0}
            className={secondaryButton}
          >
            <Eraser className="size-4" aria-hidden />
            Effacer
          </button>
          <button type="button" onClick={onOpenLogs} className={secondaryButton}>
            <FolderOpen className="size-4" aria-hidden />
            Ouvrir les journaux
          </button>
        </div>
      </header>

      <div className="mt-5 flex items-center gap-3">
        <Select
          value={instance}
          onValueChange={(next) => {
            onInstance(next);
            setSource(LIVE);
            setFollow(true);
          }}
        >
          <SelectTrigger aria-label="Instance" className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {instances.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                <span className="flex items-center gap-2">
                  {entry.running && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="En jeu" />}
                  {entry.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={source}
          onValueChange={(next) => {
            setSource(next);
            setFollow(next === LIVE);
          }}
        >
          <SelectTrigger aria-label="Journal affiché" className="h-9 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LIVE}>{running ? "En direct" : "Partie de cette session"}</SelectItem>
            {files.length > 0 && (
              <SelectGroup>
                <SelectLabel>Anciens journaux</SelectLabel>
                {files.map((entry) => (
                  <SelectItem key={fileKey(entry)} value={fileKey(entry)}>
                    {fileLabel(entry)}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <label className="relative block flex-1">
          <span className="sr-only">Rechercher dans la console</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher (mod, erreur, fil…)"
            className="h-9 w-full rounded-md border border-border bg-[#100e0b] pr-3 pl-9 text-sm text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
          />
        </label>
        <div role="group" aria-label="Niveaux affichés" className="flex gap-1 rounded-lg border border-border bg-[#100e0b] p-1">
          {LEVELS.map((level) => {
            const on = levels.has(level.id);
            return (
              <button
                key={level.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLevel(level.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1 text-[13px] font-semibold transition-colors",
                  on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {level.label}
                <span className={cn("font-pixel text-[11px]", on ? level.tone : "")}>{counts[level.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mt-3 min-h-0 flex-1">
        <div
          ref={list}
          role="log"
          aria-label="Sortie du jeu"
          tabIndex={0}
          onScroll={(event) => {
            const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
            setFollow(scrollHeight - scrollTop - clientHeight < FOLLOW_SLACK);
          }}
          className="h-full overflow-auto rounded-md border border-border bg-[#0c0b09] px-3 py-2 font-mono text-[11.5px] leading-[1.55] select-text"
        >
          {shown.length === 0 ? (
            <p className="py-6 text-center font-sans text-[13px] text-muted-foreground">
              {entries.length === 0 ? "Rien pour l'instant." : "Aucune ligne ne correspond aux filtres."}
            </p>
          ) : (
            shown.map((entry) => <Line key={entry.id} entry={entry} />)
          )}
        </div>
        {!follow && shown.length > 0 && (
          <button
            type="button"
            onClick={() => setFollow(true)}
            className={cn(secondaryButton, "absolute right-4 bottom-4 h-8 shadow-[0_8px_20px_rgb(0_0_0/0.5)]")}
          >
            <ArrowDown className="size-4" aria-hidden />
            Dernières lignes
          </button>
        )}
      </div>
    </main>
  );
}

function Line({ entry }: { entry: LogEntry }) {
  const prefix = logPrefix(entry);
  return (
    <div className={cn("break-words whitespace-pre-wrap", TONE[entry.level])}>
      {prefix && <span className="text-muted-foreground">{prefix} </span>}
      {entry.message}
      {entry.throwable && <div className="pl-4 text-[#f3a19e]/85">{entry.throwable}</div>}
    </div>
  );
}
