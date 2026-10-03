import { Check, Download, LoaderCircle, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ModIcon } from "@/components/ModIcon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { ModrinthHit, ModrinthPage } from "@/types";

const number = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  minecraftVersion: string;
  /** Projets Modrinth déjà dans « Mes mods ». */
  installed: Set<string>;
  search: (query: string, offset: number) => Promise<ModrinthPage>;
  /** Installe le mod et ses dépendances ; rejette avec un message à afficher. */
  onInstall: (projectId: string) => Promise<void>;
};

type Results = { query: string; hits: ModrinthHit[]; total: number } | { query: string; error: string };

/**
 * Recherche dans les mods Fabric de Modrinth faits pour la version du serveur et utilisables côté
 * client seul. Sans texte, les plus téléchargés. La source n'est pas nommée dans l'interface.
 */
export function ModrinthDialog({ open, onOpenChange, minecraftVersion, installed, search, onInstall }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Record<string, string>>({});
  /** Dernière recherche lancée : une réponse plus ancienne arrivée en retard est ignorée. */
  const latest = useRef("");

  const run = useCallback(async (text: string, offset: number) => {
    latest.current = text;
    setLoading(true);
    try {
      const page = await search(text, offset);
      if (latest.current !== text) return;
      setResults((current) =>
        offset > 0 && current && "hits" in current
          ? { query: text, hits: [...current.hits, ...page.hits], total: page.totalHits }
          : { query: text, hits: page.hits, total: page.totalHits },
      );
    } catch (reason) {
      if (latest.current === text) setResults({ query: text, error: String(reason) });
    } finally {
      if (latest.current === text) setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void run(query, 0), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [open, query, run]);

  const install = async (hit: ModrinthHit) => {
    setInstalling((current) => new Set(current).add(hit.projectId));
    setFailed(({ [hit.projectId]: _, ...rest }) => rest);
    try {
      await onInstall(hit.projectId);
    } catch (reason) {
      setFailed((current) => ({ ...current, [hit.projectId]: String(reason) }));
    } finally {
      setInstalling((current) => {
        const next = new Set(current);
        next.delete(hit.projectId);
        return next;
      });
    }
  };

  const hits = results && "hits" in results ? results.hits : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mc-frame flex max-h-[min(640px,calc(100vh-4rem))] flex-col gap-0 border-[var(--mc-outline)] bg-card p-0 ring-0 sm:max-w-[680px]">
        <DialogHeader className="gap-1 border-b border-border px-6 pt-5 pb-4">
          <DialogTitle className="font-display text-2xl font-normal">Rechercher un mod</DialogTitle>
          <DialogDescription className="text-xs">
            Mods Fabric pour Minecraft {minecraftVersion}, non vérifiés par l'équipe Clover Games. Les mods de triche sont interdits sur le serveur.
          </DialogDescription>
          <label className="relative mt-3 block">
            <span className="sr-only">Rechercher un mod</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Minimap, zoom, HUD…"
              className="h-10 w-full rounded-md border border-border bg-[#100e0b] pr-3 pl-9 text-sm text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
            />
          </label>
        </DialogHeader>

        <div className="min-h-[240px] flex-1 overflow-y-auto px-3 py-3" aria-busy={loading}>
          {results && "error" in results ? (
            <p className="px-3 py-10 text-center text-sm text-[#f3a19e]">{results.error}</p>
          ) : hits.length === 0 && !loading ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">Aucun mod trouvé pour Minecraft {minecraftVersion}.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {hits.map((hit) => {
                const done = installed.has(hit.projectId);
                const busy = installing.has(hit.projectId);
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
                      {failed[hit.projectId] && <p className="text-xs text-[#f3a19e]">{failed[hit.projectId]}</p>}
                    </div>
                    {done ? (
                      <span className="flex h-9 shrink-0 items-center gap-1.5 px-2 text-[13px] font-semibold text-primary">
                        <Check className="size-4" aria-hidden />
                        Installé
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void install(hit)}
                        aria-label={`Installer ${hit.title}`}
                        className={cn(primaryButton, "shrink-0")}
                      >
                        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                        {busy ? "Installation…" : "Installer"}
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
          {!loading && results && "hits" in results && hits.length < results.total && (
            <div className="flex justify-center py-3">
              <button type="button" onClick={() => void run(results.query, hits.length)} className={secondaryButton}>
                Voir plus
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
