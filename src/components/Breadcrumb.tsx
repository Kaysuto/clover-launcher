import { ArrowLeft, ChevronRight } from "lucide-react";
import { Fragment } from "react";

/**
 * Fil d'Ariane, affiché quand un raccourci a mené d'un écran à un autre (« Modifier » de l'instance
 * Clover vers les paramètres, par exemple) : le premier maillon ramène à l'écran de départ.
 */
export function Breadcrumb({ trail, onBack }: { trail: [string, ...string[]]; onBack: () => void }) {
  const [origin, ...rest] = trail;
  return (
    <nav aria-label="Fil d'Ariane" className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-6 text-[13px]">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 font-semibold text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {origin}
      </button>
      {rest.map((label, index) => {
        const current = index === rest.length - 1;
        return (
          <Fragment key={label}>
            <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden />
            <span aria-current={current ? "page" : undefined} className={current ? "font-semibold text-foreground" : "text-muted-foreground"}>
              {label}
            </span>
          </Fragment>
        );
      })}
    </nav>
  );
}
