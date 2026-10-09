import { ArrowUpRight, BookOpen, Clover, CloudOff, LoaderCircle, Newspaper, Pickaxe, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ReaderTarget } from "@/components/ArticleReader";
import { api } from "@/lib/api";
import { secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { MinecraftNewsItem, NewsItem, NewsPage } from "@/types";

type Services = Pick<typeof api, "newsPage">;
type Filter = "all" | "clover" | "minecraft";

/** Une carte : article du blog ou annonce Minecraft, rangés ensemble par date. */
type Card =
  | { source: "clover"; key: string; date: string; item: NewsItem }
  | { source: "minecraft"; key: string; date: string; item: MinecraftNewsItem };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "clover", label: "Clover Games" },
  { id: "minecraft", label: "Minecraft" },
];
const KIND_LABELS: Record<string, string> = { release: "Nouvelle version", snapshot: "Snapshot", news: "Annonce" };
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Actualités : articles du blog de Clover Games et annonces officielles de Minecraft (en anglais,
 * comme Mojang les publie, sauf si le site les traduit). Articles du blog et notes de version se lisent dans le launcher
 * (`onRead`) ; les autres annonces Minecraft s'ouvrent sur minecraft.net.
 */
export function NewsScreen({
  onOpenLink,
  onRead,
  initial = null,
  services = api,
}: {
  onOpenLink: (url: string) => void;
  /** Lecteur d'article commun (ArticleReader). */
  onRead: (target: ReaderTarget) => void;
  /** Contenu déjà connu (planche des maquettes) : pas de chargement. */
  initial?: NewsPage | null;
  services?: Services;
}) {
  const [page, setPage] = useState<NewsPage | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    setLoading(true);
    services
      .newsPage()
      .then(setPage)
      .catch(() => setPage({ blog: null, minecraft: null }))
      .finally(() => setLoading(false));
  }, [services]);
  useEffect(() => {
    if (initial === null) load();
  }, [initial, load]);

  const cards = useMemo<Card[]>(() => {
    const clover: Card[] = (page?.blog ?? []).map((item) => ({ source: "clover", key: item.url, date: item.publishedAt, item }));
    const minecraft: Card[] = (page?.minecraft?.items ?? []).map((item) => ({ source: "minecraft", key: item.id, date: item.publishedAt, item }));
    return [...(filter === "minecraft" ? [] : clover), ...(filter === "clover" ? [] : minecraft)].sort((a, b) => b.date.localeCompare(a.date));
  }, [page, filter]);

  const minecraftMissing = page !== null && page.minecraft === null && filter !== "clover";
  const english = page?.minecraft?.translated === false;
  const blogMissing = page !== null && page.blog === null && filter !== "minecraft";

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-12 pt-8 pb-8">
        <header className="flex items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[30px] leading-none">Actualités</h1>
            <p className="text-sm text-muted-foreground">Le blog de Clover Games et les annonces officielles de Minecraft.</p>
          </div>
          <button type="button" onClick={load} disabled={loading} className={secondaryButton}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
            Actualiser
          </button>
        </header>

        <div role="radiogroup" aria-label="Source" className="mt-5 flex gap-1 self-start rounded-lg border border-border bg-[#100e0b] p-1">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filter === id}
              onClick={() => setFilter(id)}
              className={cn("rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors", filter === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>

        {(minecraftMissing || blogMissing) && (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs leading-snug text-muted-foreground">
            <CloudOff className="mt-px size-4 shrink-0" aria-hidden />
            {minecraftMissing && "Les annonces de Minecraft ne sont pas disponibles pour le moment. "}
            {blogMissing && "Le blog de Clover Games ne répond pas pour le moment."}
          </p>
        )}

        {loading && page === null ? (
          <p className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Chargement des actualités…
          </p>
        ) : cards.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Aucune actualité à afficher pour le moment.</p>
        ) : (
          <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {cards.map((card) => (
              <li key={card.key}>
                <NewsCard card={card} english={english} onOpen={() => openCard(card, onRead, onOpenLink)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

/** Article du blog et note de version : lus dans le launcher. Autre annonce : minecraft.net. */
function openCard(card: Card, onRead: (target: ReaderTarget) => void, onOpenLink: (url: string) => void) {
  if (card.source === "clover") {
    const { slug, title, category, publishedAt, url } = card.item;
    if (slug) onRead({ source: "clover", slug, title, category: category ?? null, publishedAt, url });
    else onOpenLink(url);
  } else if (card.item.readable) {
    onRead({ source: "minecraft", item: card.item });
  } else if (card.item.url) {
    onOpenLink(card.item.url);
  }
}

/** `english` : annonces Minecraft non traduites, signalées sur la carte. */
function NewsCard({ card, english, onOpen }: { card: Card; english: boolean; onOpen: () => void }) {
  const clover = card.source === "clover";
  const title = card.item.title;
  const text = clover ? card.item.excerpt : card.item.summary;
  const label = clover ? (card.item.category ?? "Blog") : KIND_LABELS[card.item.kind] ?? "Annonce";
  const inside = clover ? Boolean(card.item.slug) : card.item.readable;
  const action = clover ? (inside ? "Lire l'article" : "Lire sur le site") : inside ? "Lire la note de version" : "Article complet sur minecraft.net";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-muted-foreground/40 hover:bg-[#221e18]"
    >
      <span className="relative aspect-[16/8] w-full overflow-hidden border-b border-border bg-[#100e0b]">
        {card.item.image ? (
          <img src={card.item.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground/50">
            <Newspaper className="size-8" aria-hidden />
          </span>
        )}
        <span
          className={cn(
            "absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold shadow",
            clover ? "bg-primary text-primary-foreground" : "bg-[#14120f]/90 text-foreground",
          )}
        >
          {clover ? <Clover className="size-3.5" aria-hidden /> : <Pickaxe className="size-3.5" aria-hidden />}
          {clover ? "Clover Games" : "Minecraft"}
          {!clover && english && <span className="font-semibold text-muted-foreground">· EN</span>}
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1.5 p-3.5">
        <span className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase">
          <span className="text-accent">{label}</span>
          <span className="text-muted-foreground">·</span>
          <time dateTime={card.date} className="text-muted-foreground">
            {dateFormat.format(new Date(card.date))}
          </time>
        </span>
        <span className="line-clamp-2 text-[15px] leading-snug font-bold">{title}</span>
        <span className="line-clamp-3 text-[13px] leading-snug text-muted-foreground">{text}</span>
        <span className="mt-auto flex items-center gap-1 pt-2 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
          {inside ? <BookOpen className="size-3.5" aria-hidden /> : <ArrowUpRight className="size-3.5" aria-hidden />}
          {action}
        </span>
      </span>
    </button>
  );
}
