import { useId } from "react";

import { cn } from "@/lib/utils";

/** Pixels épars d'une tuile de 12×12 cases de 8 px : [colonne, ligne, couleur]. */
const PIXELS: [number, number, string][] = [
  [1, 2, "rgb(82 169 108 / 0.20)"],
  [7, 1, "rgb(82 169 108 / 0.12)"],
  [4, 5, "rgb(217 164 65 / 0.14)"],
  [10, 4, "rgb(82 169 108 / 0.16)"],
  [2, 9, "rgb(82 169 108 / 0.10)"],
  [8, 8, "rgb(217 164 65 / 0.10)"],
  [11, 10, "rgb(82 169 108 / 0.14)"],
  [5, 11, "rgb(82 169 108 / 0.08)"],
];

/**
 * Fond d'ambiance, sans photo : deux lueurs aux couleurs du trèfle et de l'or, et des pixels
 * épars comme des particules, estompés vers les bords.
 */
export function Backdrop({ className }: { className?: string }) {
  const pattern = useId();
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_85%_at_80%_40%,rgb(82_169_108/0.22),transparent_70%),radial-gradient(ellipse_45%_70%_at_10%_100%,rgb(217_164_65/0.10),transparent_70%)]" />
      <svg className="absolute inset-0 size-full [mask-image:radial-gradient(ellipse_75%_95%_at_75%_40%,black,transparent_80%)]">
        <defs>
          <pattern id={pattern} width="96" height="96" patternUnits="userSpaceOnUse">
            {PIXELS.map(([x, y, color]) => (
              <rect key={`${x}-${y}`} x={x * 8} y={y * 8} width="8" height="8" fill={color} />
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${CSS.escape(pattern)})`} />
      </svg>
    </div>
  );
}
