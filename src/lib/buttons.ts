/** Boutons « bloc » du launcher, repris du système du site (`mc-bevel`). */
export const primaryButton =
  "mc-bevel flex h-9 items-center justify-center gap-2 whitespace-nowrap bg-primary px-4 text-[13px] font-bold text-primary-foreground disabled:opacity-60";

/** Entrée de navigation (colonne principale, onglets des Paramètres) : l'entrée ouverte est teintée de la couleur principale. */
export const navItem = (active: boolean) =>
  active ? "bg-primary/12 text-foreground ring-1 ring-primary/25 ring-inset [&>svg]:text-primary" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground";

export const secondaryButton =
  "mc-bevel flex h-9 items-center justify-center gap-2 whitespace-nowrap bg-secondary px-3.5 text-[13px] font-semibold text-foreground disabled:opacity-60";
