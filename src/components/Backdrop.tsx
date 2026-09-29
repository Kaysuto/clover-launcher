import { cn } from "@/lib/utils";

/**
 * Bandeau du hero, repris du site (`siteweb/src/components/layout/PageHero.tsx`, teinte « forest ») :
 * aplat vert en dégradé, blocs de feuillage pixelisés et lueur. Bord bas droit : pas de biseau.
 */
export function HeroBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden bg-linear-to-br from-[#1d5a35] via-[#2f7d4c] to-[#16452b]",
        className,
      )}
    >
      <div className="absolute top-12 left-[5%] h-10 w-24 bg-white/8 shadow-[40px_-16px_0_-4px_rgb(255_255_255/0.06)]" />
      <div className="absolute top-20 right-[36%] h-12 w-28 bg-white/8 shadow-[-36px_-18px_0_-6px_rgb(255_255_255/0.06)]" />
      <div className="absolute bottom-20 left-[38%] h-8 w-16 bg-black/10" />
      <div className="absolute right-[6%] bottom-28 h-8 w-20 bg-black/10" />
      <div className="absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#9be38f]/15 blur-[120px]" />
    </div>
  );
}
