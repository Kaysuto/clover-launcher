/**
 * Couleur par défaut du joueur sur la barre de localisation (Minecraft 1.21.6+), reprise du site
 * (`siteweb/src/lib/minecraft-player-extras.ts`) : teinte et saturation tirées de `UUID.hashCode()`
 * de Java, luminosité fixée à 0,9. Kaysuto (6b4d8d4f-…) : #5CE646, comme l'affiche NameMC.
 */
export function locatorBarColor(uuid: string): string | null {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  // UUID.hashCode() : (int)(hilo >> 32) ^ (int)hilo, avec hilo = msb ^ lsb.
  const hilo = BigInt(`0x${hex.slice(0, 16)}`) ^ BigInt(`0x${hex.slice(16)}`);
  const hash = Number((hilo ^ (hilo >> BigInt(32))) & BigInt(0xffffffff));
  const r = ((hash >>> 16) & 0xff) / 255;
  const g = ((hash >>> 8) & 0xff) / 255;
  const b = (hash & 0xff) / 255;
  // RVB → TSV, puis retour en TSV avec V = 0,9.
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  const s = max === 0 ? 0 : delta / max;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  const v = 0.9;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r1, g1, b1].map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
