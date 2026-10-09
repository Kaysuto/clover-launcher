const art = import.meta.glob<string>("../assets/modes/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

/**
 * Illustration d'un mode (personnage et nom du mode en lettrage) : celle du manifeste si le
 * serveur en publie une, sinon celle livrée avec le launcher pour cet identifiant.
 */
export function modeArt(id: string, image: string | null): string | null {
  return image ?? art[`../assets/modes/${id}.webp`] ?? null;
}
