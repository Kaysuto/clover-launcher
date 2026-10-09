import { Check, Download, ExternalLink, FileUp, LoaderCircle, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { acceptsMods, InstancePicker } from "@/components/InstancePicker";
import { modLoader } from "@/lib/instances";
import { ModIcon } from "@/components/ModIcon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { ImportedModpack, InstanceEntry, ModrinthHit, ModrinthKind, ModrinthPage } from "@/types";

const number = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

/** Libellés, aide et exemples de recherche de chaque type de contenu. */
export const MODRINTH_KINDS: Record<ModrinthKind, { label: string; hint: (minecraft: string, loader: string) => string; placeholder: string; install: string; done: string }> = {
  mod: {
    label: "Mods",
    hint: (minecraft, loader) => `Mods ${loader} pour Minecraft ${minecraft}, non vérifiés par l'équipe Clover Games. Les mods de triche sont interdits sur le serveur.`,
    placeholder: "Minimap, zoom, HUD…",
    install: "Installer",
    done: "Installé",
  },
  resourcepack: {
    label: "Packs de ressources",
    hint: (minecraft) => `Textures, sons et polices pour Minecraft ${minecraft}. À activer en jeu dans Options > Packs de ressources.`,
    placeholder: "Faithful, animations, PvP…",
    install: "Installer",
    done: "Installé",
  },
  shader: {
    label: "Shaders",
    hint: (minecraft, loader) => `Shaders pour ${loader === "Forge" ? "Oculus" : "Iris"} et Minecraft ${minecraft}, installé avec eux si besoin. À choisir en jeu dans Options > Vidéo > Shaders.`,
    placeholder: "Complementary, BSL…",
    install: "Installer",
    done: "Installé",
  },
  datapack: {
    label: "Datapacks",
    hint: (minecraft) => `Datapacks pour Minecraft ${minecraft}, ajoutés au monde choisi. Ils se chargent à sa prochaine ouverture.`,
    placeholder: "Arbres, structures, recettes…",
    install: "Ajouter",
    done: "Ajouté",
  },
  modpack: {
    label: "Modpacks",
    hint: () => "Modpacks Fabric : chacun devient une nouvelle instance, avec sa version de Minecraft, ses mods et ses réglages. Un modpack peut aussi venir d'un fichier : .mrpack, ou .zip exporté par CurseForge.",
    placeholder: "Fabulously Optimized, aventure…",
    install: "Créer l'instance",
    done: "Instance créée",
  },
};

const KIND_ORDER: ModrinthKind[] = ["mod", "resourcepack", "shader", "datapack", "modpack"];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ModrinthKind;
  onKind: (kind: ModrinthKind) => void;
  /** Instances où installer ; la recherche suit la version de Minecraft de celle visée. */
  instances: InstanceEntry[];
  /** Instance visée à l'ouverture : celle choisie dans le launcher. */
  defaultInstance: string;
  /** Projets Modrinth déjà dans « Mes mods » de l'instance. */
  installedMods: (instance: string) => Promise<string[]>;
  search: (kind: ModrinthKind, query: string, offset: number, instance: string) => Promise<ModrinthPage>;
  /** Installe le projet dans `instance` ; rejette avec un message à afficher. `world` : monde visé par un datapack. */
  onInstall: (kind: ModrinthKind, projectId: string, instance: string, world?: string) => Promise<void>;
  /** Mondes de l'instance, pour les datapacks. */
  worlds: (instance: string) => Promise<string[]>;
  /** Fichiers posés pendant la création d'une instance depuis un modpack. */
  progress?: [number, number] | null;
  /** Importe un modpack depuis un fichier choisi par le joueur ; `null` s'il annule. */
  onImportFile: () => Promise<ImportedModpack | null>;
  onOpenLink: (url: string) => void;
};

type Results = { key: string; hits: ModrinthHit[]; total: number } | { key: string; error: string };

/**
 * Recherche dans Modrinth, filtrée sur la version de l'instance visée. Sans texte, les plus
 * téléchargés. La source n'est pas nommée dans l'interface.
 */
export function ModrinthDialog({ open, onOpenChange, kind, onKind, instances, defaultInstance, installedMods, search, onInstall, worlds, progress, onImportFile, onOpenLink }: Props) {
  const [imported, setImported] = useState<{ busy: true } | { busy: false; result?: ImportedModpack; error?: string } | null>(null);
  const [target, setTarget] = useState(defaultInstance);
  // Chaque ouverture repart de l'instance choisie dans le launcher.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTarget(defaultInstance);
      setImported(null);
    }
  }
  // Mods et shaders demandent un loader : une instance Vanilla visée cède la place à une autre, et
  // revient si le joueur repasse sur un type qu'elle accepte.
  const choices = kind === "mod" || kind === "shader" ? instances.filter(acceptsMods) : instances;
  const entry = choices.find((other) => other.id === target) ?? choices.find((other) => other.id === defaultInstance) ?? choices[0];
  const instance = entry?.id ?? target;
  const minecraftVersion = entry?.minecraft ?? "";
  const [installed, setInstalled] = useState<{ instance: string; projects: Set<string> } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [worldList, setWorldList] = useState<string[] | null>(null);
  const [world, setWorld] = useState<string | null>(null);
  /** Dernière recherche lancée : une réponse plus ancienne arrivée en retard est ignorée. */
  const latest = useRef("");
  const text = MODRINTH_KINDS[kind];

  const run = useCallback(async (searched: ModrinthKind, value: string, offset: number, into: string) => {
    const key = `${into}:${searched}:${value}`;
    latest.current = key;
    setLoading(true);
    try {
      const page = await search(searched, value, offset, into);
      if (latest.current !== key) return;
      setResults((current) =>
        offset > 0 && current && "hits" in current && current.key === key
          ? { key, hits: [...current.hits, ...page.hits], total: page.totalHits }
          : { key, hits: page.hits, total: page.totalHits },
      );
    } catch (reason) {
      if (latest.current === key) setResults({ key, error: String(reason) });
    } finally {
      if (latest.current === key) setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void run(kind, query, 0, instance), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [open, kind, query, instance, run]);

  useEffect(() => {
    if (!open || kind !== "mod") return;
    let alive = true;
    installedMods(instance)
      .then((projects) => alive && setInstalled({ instance, projects: new Set(projects) }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, kind, instance, installedMods]);

  useEffect(() => {
    if (!open || kind !== "datapack") return;
    let alive = true;
    worlds(instance)
      .then((list) => {
        if (!alive) return;
        setWorldList(list);
        setWorld((current) => (current && list.includes(current) ? current : (list[0] ?? null)));
      })
      .catch(() => alive && setWorldList([]));
    return () => {
      alive = false;
    };
  }, [open, kind, instance, worlds]);

  /** Une installation par instance (et par monde pour un datapack). */
  const keyOf = (hit: ModrinthHit) => `${instance}:${kind}:${hit.projectId}${kind === "datapack" ? `:${world}` : ""}`;

  const install = async (hit: ModrinthHit) => {
    const key = keyOf(hit);
    setInstalling((current) => new Set(current).add(key));
    setFailed(({ [key]: _, ...rest }) => rest);
    try {
      await onInstall(kind, hit.projectId, instance, kind === "datapack" ? (world ?? undefined) : undefined);
      setAdded((current) => new Set(current).add(key));
    } catch (reason) {
      setFailed((current) => ({ ...current, [key]: String(reason) }));
    } finally {
      setInstalling((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const importFile = async () => {
    setImported({ busy: true });
    try {
      const result = await onImportFile();
      setImported(result ? { busy: false, result } : null);
    } catch (reason) {
      setImported({ busy: false, error: String(reason) });
    }
  };
  const importedName = imported && !imported.busy && imported.result && instances.find((entry) => entry.id === imported.result?.instance)?.name;

  const current = results?.key === `${instance}:${kind}:${query}` ? results : null;
  const installedHere = installed?.instance === instance ? installed.projects : null;
  const hits = current && "hits" in current ? current.hits : [];
  const noWorld = kind === "datapack" && worldList !== null && worldList.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mc-frame flex max-h-[min(680px,calc(100vh-4rem))] flex-col gap-0 border-[var(--mc-outline)] bg-card p-0 ring-0 sm:max-w-[720px]">
        <DialogHeader className="gap-1 border-b border-border px-6 pt-5 pb-4">
          <div className="flex min-h-10 items-center justify-between gap-4 pr-8">
            <DialogTitle className="font-display text-2xl font-normal">Rechercher</DialogTitle>
            {/* Un modpack devient sa propre instance : rien à viser. */}
            {kind !== "modpack" && choices.length > 0 && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Installer dans
                <InstancePicker instances={choices} value={instance} onChange={setTarget} label="Installer dans l'instance" className="w-56" />
              </span>
            )}
          </div>
          <div role="tablist" aria-label="Type de contenu" className="mt-2 flex flex-wrap gap-1 self-start rounded-lg border border-border bg-[#100e0b] p-1">
            {KIND_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={kind === id}
                onClick={() => onKind(id)}
                className={cn("rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors", kind === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {MODRINTH_KINDS[id].label}
              </button>
            ))}
          </div>
          <DialogDescription className="mt-2 text-xs">{text.hint(minecraftVersion, (entry && modLoader(entry.kind)) ?? "Fabric")}</DialogDescription>
          <div className="mt-3 flex gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">Rechercher des {text.label.toLowerCase()}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={text.placeholder}
                className="h-10 w-full rounded-md border border-border bg-[#100e0b] pr-3 pl-9 text-sm text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
              />
            </label>
            {kind === "modpack" && (
              <button type="button" onClick={() => void importFile()} disabled={imported?.busy} className={cn(secondaryButton, "h-10 shrink-0")}>
                {imported?.busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
                {imported?.busy ? (progress ? `${progress[0]} / ${progress[1]}` : "Import…") : "Importer un fichier"}
              </button>
            )}
            {kind === "datapack" && worldList && worldList.length > 0 && (
              <Select value={world ?? undefined} onValueChange={(value) => value && setWorld(value)}>
                <SelectTrigger aria-label="Monde" className="h-10 w-52">
                  <SelectValue placeholder="Monde" />
                </SelectTrigger>
                <SelectContent>
                  {worldList.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {kind === "modpack" && imported && !imported.busy && (imported.error || imported.result) && (
            <div role="status" className={cn("mt-3 rounded-lg border px-4 py-3 text-[13px] leading-relaxed", imported.error ? "border-[#f3a19e]/30 bg-[#f3a19e]/8 text-[#f3a19e]" : "border-primary/30 bg-primary/8")}>
              {imported.error ?? (
                <>
                  <p className="font-semibold text-primary">« {importedName ?? "Le modpack"} » est prête dans tes instances.</p>
                  {imported.result && imported.result.missing.length > 0 && (
                    <>
                      <p className="mt-1 text-muted-foreground">Introuvables hors de CurseForge : télécharge-les, puis ajoute-les dans « Mes mods » de l'instance.</p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {imported.result.missing.map((entry) => (
                          <li key={entry.url}>
                            <button type="button" onClick={() => onOpenLink(entry.url)} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-semibold hover:text-primary">
                              {entry.name}
                              <ExternalLink className="size-3" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {noWorld && <p className="mt-2 text-xs text-[#f3a19e]">Aucun monde dans {entry?.name ?? "cette instance"} : crée-en un en jeu, puis reviens ajouter des datapacks.</p>}
        </DialogHeader>

        <div className="min-h-[240px] flex-1 overflow-y-auto px-3 py-3" aria-busy={loading}>
          {current && "error" in current ? (
            <p className="px-3 py-10 text-center text-sm text-[#f3a19e]">{current.error}</p>
          ) : hits.length === 0 && !loading ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">Aucun résultat{kind === "modpack" ? "" : ` pour Minecraft ${minecraftVersion}`}.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {hits.map((hit) => {
                const key = keyOf(hit);
                const done = hit.providedByClover || (kind === "mod" && installedHere?.has(hit.projectId)) || added.has(key);
                const busy = installing.has(key);
                return (
                  <li key={hit.projectId} className="flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-secondary/50">
                    <ModIcon src={hit.iconUrl} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="flex items-baseline gap-2 text-sm font-semibold">
                        <span className="truncate">{hit.title}</span>
                        <span className="shrink-0 text-[11px] font-normal text-muted-foreground">par {hit.author}</span>
                      </p>
                      <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{hit.description}</p>
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                        <Download className="size-3" aria-hidden />
                        {number.format(hit.downloads)} téléchargements
                      </p>
                      {failed[key] && <p className="text-xs text-[#f3a19e]">{failed[key]}</p>}
                    </div>
                    {done ? (
                      <span className="flex h-9 shrink-0 items-center gap-1.5 px-2 text-[13px] font-semibold text-primary">
                        <Check className="size-4" aria-hidden />
                        {hit.providedByClover ? "Activé dans Clover" : text.done}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || (kind === "datapack" && !world)}
                        onClick={() => void install(hit)}
                        aria-label={`${text.install} : ${hit.title}`}
                        className={cn(primaryButton, "shrink-0")}
                      >
                        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                        {busy ? (kind === "modpack" && progress ? `${progress[0]} / ${progress[1]}` : "Installation…") : text.install}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {loading && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Recherche…
            </p>
          )}
          {!loading && current && "hits" in current && hits.length < current.total && (
            <div className="flex justify-center py-3">
              <button type="button" onClick={() => void run(kind, query, hits.length, instance)} className={secondaryButton}>
                Voir plus
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
