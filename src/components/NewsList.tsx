import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NewsItem } from "@/types";

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/** Articles du blog du site, image en vignette 16:9, titre, résumé et date ; « Tout lire » mène à la page Actualités. */
export function NewsList({ items, onOpen, onAll, className }: { items: NewsItem[]; onOpen: (item: NewsItem) => void; onAll: () => void; className?: string }) {
  return (
    <section aria-labelledby="news-title" className={cn("flex min-h-0 min-w-0 flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between px-1">
        <h2 id="news-title" className="font-display text-xl">
          Actualités
        </h2>
        <button type="button" onClick={onAll} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Tout lire
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Aucune actualité à afficher pour le moment.</p>
      ) : (
        <ul className="-mr-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-2">
          {items.map((item) => (
            <li key={item.url}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="group flex w-full gap-3.5 rounded-lg p-1.5 text-left transition-colors hover:bg-card"
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
