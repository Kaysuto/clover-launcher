import { ArrowUpRight, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { safeHtml } from "@/lib/safe-html";
import type { MinecraftNewsItem } from "@/types";

/** Article à lire : un article du blog (par son slug) ou une note de version Minecraft. */
export type ReaderTarget =
  | { source: "clover"; slug: string; title: string; category: string | null; publishedAt: string; url: string }
  | { source: "minecraft"; item: MinecraftNewsItem };

type Services = Pick<typeof api, "blogArticle" | "minecraftArticle">;
type Loaded = { html: string; title: string; image: string | null; author: string | null };

const KIND_LABELS: Record<string, string> = { release: "Nouvelle version", snapshot: "Snapshot", news: "Annonce" };
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const keyOf = (target: ReaderTarget) => (target.source === "clover" ? `clover:${target.slug}` : `minecraft:${target.item.id}`);

/**
 * Lecture d'un article dans le launcher, sans ouvrir le site : HTML préparé par le site, filtré une
 * seconde fois ici. Les liens s'ouvrent dans le navigateur, jamais dans la fenêtre du launcher.
 */
export function ArticleReader({ target, onClose, onOpenLink, services = api }: { target: ReaderTarget | null; onClose: () => void; onOpenLink: (url: string) => void; services?: Services }) {
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!target) return;
    let alive = true;
    const key = keyOf(target);
    const request: Promise<Loaded> =
      target.source === "clover"
        ? services.blogArticle(target.slug).then((article) => ({ html: article.html, title: article.title, image: article.image, author: article.author }))
        : services.minecraftArticle(target.item.id).then((article) => ({ html: article.html, title: article.title, image: null, author: null }));
    request.then((value) => alive && setLoaded({ key, value, error: null })).catch((reason) => alive && setLoaded({ key, value: null, error: String(reason) }));
    return () => {
      alive = false;
    };
  }, [target, services]);

  const current = target && loaded?.key === keyOf(target) ? loaded : null;
  const html = useMemo(() => (current?.value ? safeHtml(current.value.html) : ""), [current]);
  const label = !target ? "" : target.source === "clover" ? (target.category ?? "Clover Games") : (KIND_LABELS[target.item.kind] ?? "Annonce");
  const date = !target ? "" : dateFormat.format(new Date(target.source === "clover" ? target.publishedAt : target.item.publishedAt));
  const fallbackTitle = !target ? "" : target.source === "clover" ? target.title : target.item.title;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="mc-frame flex max-h-[min(86vh,820px)] w-[min(92vw,820px)] max-w-none flex-col gap-0 overflow-hidden border-[var(--mc-outline)] bg-card p-0 sm:max-w-none">
        <div className="flex items-start gap-4 border-b border-border px-6 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-wide text-accent uppercase">
              {label} · {date}
              {current?.value?.author && <span className="text-muted-foreground normal-case"> · par {current.value.author}</span>}
            </span>
            <DialogTitle className="font-display text-2xl leading-tight font-normal">{current?.value?.title ?? fallbackTitle}</DialogTitle>
            <DialogDescription className="sr-only">{target?.source === "clover" ? "Article du blog de Clover Games." : "Note de version officielle de Minecraft."}</DialogDescription>
          </div>
          {target?.source === "clover" && (
            <button
              type="button"
              onClick={() => onOpenLink(target.url)}
              title="Réactions et partage sur le site"
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Sur le site
              <ArrowUpRight className="size-3.5" aria-hidden />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!current ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" aria-live="polite">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {target?.source === "minecraft" ? "Chargement de la note de version…" : "Chargement de l'article…"}
            </p>
          ) : current.error ? (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">{current.error}</p>
          ) : (
            <>
              {current.value?.image && <img src={current.value.image} alt="" className="aspect-[16/6] w-full border-b border-border object-cover" />}
              <article
                className="prose prose-sm prose-invert max-w-none px-6 py-5 select-text prose-headings:font-display prose-headings:font-normal prose-a:text-primary prose-code:rounded prose-code:bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-img:rounded-md"
                // Liens : dans le navigateur, jamais dans la fenêtre du launcher.
                onClick={(event) => {
                  const link = (event.target as HTMLElement).closest("a");
                  if (!link) return;
                  event.preventDefault();
                  if (link.href.startsWith("https://")) onOpenLink(link.href);
                }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
