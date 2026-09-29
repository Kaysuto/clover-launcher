import { cn } from "@/lib/utils";

/**
 * Visage du skin (texels 8–16) et son calque de chapeau (texels 40–48), découpés dans la texture
 * 64×64 elle-même : pas de service tiers, et le rendu reste pixelisé à toutes les tailles.
 */
export function PlayerHead({ skin, size, className }: { skin: string; size: number; className?: string }) {
  const layer = (x: number) => ({
    backgroundImage: `url("${skin}")`,
    backgroundSize: `${size * 8}px ${size * 8}px`,
    backgroundPosition: `-${x * size}px -${size}px`,
  });
  return (
    <span aria-hidden className={cn("relative inline-block shrink-0 overflow-hidden rounded-[3px]", className)} style={{ width: size, height: size }}>
      <span className="pixelated absolute inset-0" style={layer(1)} />
      <span className="pixelated absolute inset-0" style={layer(5)} />
    </span>
  );
}
