import { ArrowUpRight } from "lucide-react";

import type { NewsItem } from "@/types";

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/** Articles du blog du site, image en vignette 16:9, titre, résumé et date. */
export function NewsList({ items, onOpen }: { items: NewsItem[]; onOpen: (url: string) => void }) {
  return (
    <section aria-labelledby="news-title" className="flex min-h-0 min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="news-title" className="font-display text-xl">
          Actualités
        </h2>
        <button type="button" onClick={() => onOpen("https://clovergames.fr/blog")} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Tout lire
          <ArrowUpRight className="size-3.5" aria-hidden />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pas d'autre actualité pour le moment.</p>
      ) : (
        <ul className="-mr-2 flex min-h-0 flex-col gap-2 overflow-y-auto pr-2">
          {items.map((item) => (
            <li key={item.url}>
              <button
                type="button"
                onClick={() => onOpen(item.url)}
                className="group flex w-full gap-3.5 rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-muted-foreground/40 hover:bg-[#221e18]"
              >
                <span className="aspect-video w-[132px] shrink-0 self-start overflow-hidden rounded-md border border-border bg-[#100e0b]">
                  {item.image && <img src={item.image} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <time dateTime={item.publishedAt} className="text-[11px] font-semibold tracking-wide text-accent uppercase">
                    {date.format(new Date(item.publishedAt))}
                  </time>
                  <span className="line-clamp-2 text-[13px] leading-snug font-bold">{item.title}</span>
                  <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{item.excerpt}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
