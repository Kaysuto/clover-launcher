import { ArrowUpRight } from "lucide-react";

import type { NewsItem } from "@/types";

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function NewsList({ items, onOpen }: { items: NewsItem[]; onOpen: (url: string) => void }) {
  return (
    <section aria-labelledby="news-title" className="flex min-h-0 min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="news-title" className="font-display text-xl">
          Actualités
        </h2>
        <button type="button" onClick={() => onOpen("https://clovergames.fr/blog")} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Tout lire sur clovergames.fr
          <ArrowUpRight className="size-3.5" aria-hidden />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pas d'autre actualité pour le moment.</p>
      ) : (
        <ul className="-mr-2 flex min-h-0 flex-col gap-1 overflow-y-auto pr-2">
          {items.map((item) => (
            <li key={item.url}>
              <button
                type="button"
                onClick={() => onOpen(item.url)}
                className="flex w-full items-center gap-3.5 rounded-lg p-2 text-left transition-colors hover:bg-card"
              >
                <span className="h-[58px] w-[104px] shrink-0 overflow-hidden rounded-md border border-border bg-card">
                  {item.image && <img src={item.image} alt="" className="size-full object-cover" />}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 text-[13px] leading-snug font-semibold">{item.title}</span>
                  <time dateTime={item.publishedAt} className="text-[11px] text-muted-foreground">
                    {date.format(new Date(item.publishedAt))}
                  </time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
