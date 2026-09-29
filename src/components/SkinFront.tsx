import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { SkinModel } from "@/types";

/** [x source, y source, largeur, hauteur, x cible, y cible], en pixels de texture. */
type Part = [number, number, number, number, number, number];

/**
 * Faces avant d'un skin 64×64, placées sur une silhouette de 16×32. Les anciens skins 64×32 n'ont
 * ni bras ni jambe gauches : ils reprennent le côté droit en miroir, comme dans le jeu.
 */
function parts(model: SkinModel, legacy: boolean) {
  const arm = model === "slim" ? 3 : 4;
  const base: { part: Part; mirror?: boolean }[] = [
    { part: [8, 8, 8, 8, 4, 0] },
    { part: [20, 20, 8, 12, 4, 8] },
    { part: [44, 20, arm, 12, 4 - arm, 8] },
    legacy ? { part: [44, 20, arm, 12, 12, 8], mirror: true } : { part: [36, 52, arm, 12, 12, 8] },
    { part: [4, 20, 4, 12, 4, 20] },
    legacy ? { part: [4, 20, 4, 12, 8, 20], mirror: true } : { part: [20, 52, 4, 12, 8, 20] },
  ];
  const overlay: Part[] = [[40, 8, 8, 8, 4, 0]];
  if (!legacy) {
    overlay.push(
      [20, 36, 8, 12, 4, 8],
      [44, 36, arm, 12, 4 - arm, 8],
      [52, 52, arm, 12, 12, 8],
      [4, 36, 4, 12, 4, 20],
      [4, 52, 4, 12, 8, 20],
    );
  }
  return [...base, ...overlay.map((part) => ({ part, mirror: false }))];
}

/** Vue de face à plat, en 2D : légère pour les grilles de skins, sans contexte WebGL par vignette. */
export function SkinFront({ texture, model, scale, className }: { texture: string; model: SkinModel; scale: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const context = canvas.current?.getContext("2d");
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, 16 * scale, 32 * scale);
      context.imageSmoothingEnabled = false;
      context.scale(scale, scale);
      for (const { part, mirror } of parts(model, image.height === 32)) {
        const [sx, sy, w, h, dx, dy] = part;
        if (mirror) {
          context.save();
          context.translate(dx + w, dy);
          context.scale(-1, 1);
          context.drawImage(image, sx, sy, w, h, 0, 0, w, h);
          context.restore();
        } else {
          context.drawImage(image, sx, sy, w, h, dx, dy, w, h);
        }
      }
    };
    image.src = texture;
  }, [texture, model, scale]);

  return <canvas ref={canvas} width={16 * scale} height={32 * scale} aria-hidden className={cn("pixelated", className)} />;
}

/** Face avant d'une cape (texture 64×32 : 10×16 pixels à partir de 1,1). */
export function CapeFront({ texture, scale, className }: { texture: string; scale: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("pixelated inline-block", className)}
      style={{
        width: 10 * scale,
        height: 16 * scale,
        backgroundImage: `url("${texture}")`,
        backgroundSize: `${64 * scale}px ${32 * scale}px`,
        backgroundPosition: `-${scale}px -${scale}px`,
      }}
    />
  );
}
