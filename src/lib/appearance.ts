/**
 * Choix d'apparence : couleur principale (boutons, sélections, barres) et teinte du bandeau de
 * l'accueil. Les teintes du bandeau sont celles du site (`siteweb/src/components/layout/PageHero.tsx`).
 */

export const ACCENTS = {
  emerald: { label: "Émeraude", color: "#52a96c" },
  diamond: { label: "Diamant", color: "#4cc3cf" },
  lapis: { label: "Lapis", color: "#6b8ff0" },
  amethyst: { label: "Améthyste", color: "#a68ae6" },
  cherry: { label: "Cerisier", color: "#e88fbd" },
  copper: { label: "Cuivre", color: "#e0894f" },
} as const;

export type Accent = keyof typeof ACCENTS;

export const HERO_TONES = {
  forest: { label: "Forêt", bg: "from-[#1d5a35] via-[#2f7d4c] to-[#16452b]", glow: "bg-[#9be38f]/15" },
  ocean: { label: "Océan", bg: "from-[#113552] via-[#1d5a80] to-[#0d2a42]", glow: "bg-[#8fd3f5]/15" },
  amethyst: { label: "Améthyste", bg: "from-[#35205a] via-[#553889] to-[#261642]", glow: "bg-[#c9a8f5]/15" },
  cherry: { label: "Cerisier", bg: "from-[#5a2141] via-[#94396b] to-[#431831]", glow: "bg-[#f5a8d0]/15" },
  nether: { label: "Nether", bg: "from-[#551818] via-[#853025] to-[#3f1212]", glow: "bg-[#f59a7a]/15" },
  gold: { label: "Or", bg: "from-[#5e3f0f] via-[#9a6a1c] to-[#4a310b]", glow: "bg-[#f5d27a]/20" },
  obsidian: { label: "Obsidienne", bg: "from-[#1c1638] via-[#302760] to-[#130f28]", glow: "bg-[#9d8cf0]/15" },
  iron: { label: "Fer", bg: "from-[#2b3036] via-[#4a525c] to-[#1f2328]", glow: "bg-[#d0d8e0]/15" },
} as const;

export type HeroTone = keyof typeof HERO_TONES;

/** Valeur enregistrée inconnue (réglage d'une version plus récente) : celle par défaut. */
export const heroTone = (value: string | undefined): HeroTone => (value && value in HERO_TONES ? (value as HeroTone) : "forest");
export const accent = (value: string | undefined): Accent => (value && value in ACCENTS ? (value as Accent) : "emerald");
