import { useState } from "react";

import { cn } from "@/lib/utils";

/** Logo d'un mod dans une case d'inventaire ; case vide sans logo ou s'il ne charge pas. */
export function ModIcon({ src, className }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span aria-hidden className={cn("mc-slot grid size-11 shrink-0 place-items-center overflow-hidden [--mc-radius:6px]", className)}>
      {src && !broken && <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />}
    </span>
  );
}
