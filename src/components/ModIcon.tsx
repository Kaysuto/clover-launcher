import { type ReactNode, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Logo d'un mod ou d'un pack dans une case d'inventaire ; sans logo (ou s'il ne charge pas), la case
 * montre `fallback`, ou reste vide.
 */
export function ModIcon({ src, fallback, className }: { src: string | null; fallback?: ReactNode; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span aria-hidden className={cn("mc-slot grid size-11 shrink-0 place-items-center overflow-hidden [--mc-radius:6px]", className)}>
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" /> : fallback}
    </span>
  );
}
