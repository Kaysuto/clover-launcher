import { Check, Copy, Download, Link2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import launcherLogo from "@/assets/brand/launcher.png";
import { renderLargePose } from "@/components/SkinPose";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { formatDuration } from "@/lib/play-history";
import { cn } from "@/lib/utils";
import type { SkinModel } from "@/types";

/** Format des aperçus de lien de Discord et des réseaux. */
const WIDTH = 1200;
const HEIGHT = 630;
/** Personnage : rendu au double de sa taille sur la carte, pour des pixels nets. */
const POSE = { x: 70, y: 73, width: 360, height: 450 };

/** Fonds proposés : dégradé, lueur derrière le personnage. */
const THEMES = {
  foret: { label: "Forêt", stops: ["#1d5a35", "#2f7d4c", "#16452b"], glow: "155, 227, 143" },
  nuit: { label: "Nuit", stops: ["#151b3d", "#2b3f80", "#0e1230"], glow: "150, 175, 255" },
  nether: { label: "Nether", stops: ["#4a1010", "#8c2c1a", "#2a0909"], glow: "255, 150, 90" },
} as const;
export type CardTheme = keyof typeof THEMES;
const THEME_KEY = "clover.card-theme";

export type CardData = {
  name: string;
  texture: string;
  model: SkinModel;
  /** Cape portée, dessinée dans le dos du personnage. */
  cape: string | null;
  grade: { label: string; color: string } | null;
  level: { level: number; into: number; needed: number; rank: number | null } | null;
  /** Première venue sur le serveur (millisecondes). */
  since: number | null;
  /** Mode le plus joué : son illustration, essayée dans l'ordre (celle du serveur, puis celle du launcher). */
  favorite: { name: string; art: string[] } | null;
  /** Trois chiffres au plus : valeur et libellé. */
  facts: { value: string; label: string }[];
};

const number = new Intl.NumberFormat("fr-FR");
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** Première image qui se charge (une image distante sans CORS échoue), sinon `null`. */
async function firstImage(sources: string[]) {
  for (const source of sources) {
    const image = await loadImage(source).catch(() => null);
    if (image) return image;
  }
  return null;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

/** Suite pseudo-aléatoire tirée du pseudo : la même carte à chaque fois. */
function seeded(text: string) {
  let state = [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16_777_619), 2_166_136_261) >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function storedTheme(): CardTheme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value && value in THEMES ? (value as CardTheme) : "foret";
  } catch {
    return "foret";
  }
}

/** Carte du joueur en PNG : fond au choix, personnage posé avec sa cape, pseudo, niveau, mode favori, trois chiffres. */
export async function drawProfileCard(data: CardData, themeId: CardTheme = "foret"): Promise<Blob> {
  const theme = THEMES[themeId];
  await Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('600 20px "Montserrat Variable"'), document.fonts.load('28px "Monocraft"')]);
  const [pose, logo, favorite] = await Promise.all([
    renderLargePose(data.texture, data.model, data.cape, POSE.width * 2, POSE.height * 2).then(loadImage),
    loadImage(launcherLogo),
    data.favorite ? firstImage(data.favorite.art) : null,
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d")!;

  // Fond : dégradé, grain de blocs de 30 px comme le dessus d'un bloc d'herbe, lueur derrière le
  // personnage, coins assombris.
  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  theme.stops.forEach((color, index) => background.addColorStop(index / (theme.stops.length - 1), color));
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const random = seeded(data.name);
  for (let y = 0; y < HEIGHT; y += 30) {
    for (let x = 0; x < WIDTH; x += 30) {
      const roll = random();
      if (roll < 0.35) context.fillStyle = `rgba(255, 255, 255, ${0.012 + random() * 0.03})`;
      else if (roll > 0.75) context.fillStyle = `rgba(0, 0, 0, ${0.03 + random() * 0.05})`;
      else continue;
      context.fillRect(x, y, 30, 30);
    }
  }
  const glow = context.createRadialGradient(250, 320, 20, 250, 320, 340);
  glow.addColorStop(0, `rgba(${theme.glow}, 0.3)`);
  glow.addColorStop(1, `rgba(${theme.glow}, 0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const vignette = context.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.45, WIDTH / 2, HEIGHT / 2, WIDTH * 0.7);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "rgba(0, 0, 0, 0.22)";
  context.fillRect(0, HEIGHT - 86, WIDTH, 86);

  // Ombre au sol puis personnage. Les pieds du rendu posé sont à 92 % de sa hauteur : sur l'ombre.
  context.fillStyle = "rgba(0, 0, 0, 0.45)";
  context.beginPath();
  context.ellipse(256, 488, 112, 18, 0, 0, Math.PI * 2);
  context.fill();
  context.imageSmoothingQuality = "high";
  context.drawImage(pose, POSE.x, POSE.y, POSE.width, POSE.height);

  // Mode favori, en haut à droite.
  const left = 480;
  if (favorite) {
    const size = 176;
    const x = WIDTH - 50 - size;
    context.shadowColor = "rgba(0, 0, 0, 0.45)";
    context.shadowBlur = 18;
    context.shadowOffsetY = 6;
    context.drawImage(favorite, x, 34, size, size);
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.font = '700 14px "Montserrat Variable"';
    context.letterSpacing = "2px";
    context.textAlign = "center";
    context.fillStyle = "rgba(241, 236, 226, 0.75)";
    context.fillText("MODE FAVORI", x + size / 2, 232);
    context.letterSpacing = "0px";
    context.textAlign = "left";
  }

  // Pseudo, réduit s'il est long pour ne pas toucher le mode favori.
  const nameWidth = (favorite ? WIDTH - 50 - 176 - 24 : WIDTH - 50) - left;
  let size = 72;
  context.font = `${size}px "Lilita One"`;
  while (size > 44 && context.measureText(data.name).width > nameWidth) {
    size -= 4;
    context.font = `${size}px "Lilita One"`;
  }
  context.fillStyle = "#f1ece2";
  context.textBaseline = "alphabetic";
  context.shadowColor = "rgba(0, 0, 0, 0.45)";
  context.shadowOffsetY = 4;
  context.fillText(data.name, left, 160);
  context.shadowColor = "transparent";
  context.shadowOffsetY = 0;

  // Grade, puis ancienneté sur la même ligne.
  let after = left;
  if (data.grade) {
    context.font = '700 20px "Montserrat Variable"';
    const width = context.measureText(data.grade.label).width + 28;
    roundRect(context, left, 182, width, 34, 8);
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fill();
    context.strokeStyle = data.grade.color;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = data.grade.color;
    context.fillText(data.grade.label, left + 14, 206);
    after = left + width + 16;
  }
  if (data.since) {
    context.font = '600 18px "Montserrat Variable"';
    context.fillStyle = "rgba(241, 236, 226, 0.78)";
    context.fillText(`Sur Clover depuis ${monthYear.format(new Date(data.since))}`, after, 206);
  }

  // Niveau : chiffre vert cerné de noir et barre d'XP à crans, comme en jeu.
  if (data.level) {
    const barY = 290;
    const barWidth = 620;
    context.font = '40px "Monocraft"';
    context.textAlign = "center";
    context.lineWidth = 6;
    context.strokeStyle = "#000";
    context.strokeText(String(data.level.level), left + barWidth / 2, barY - 14);
    context.fillStyle = "#80ff20";
    context.fillText(String(data.level.level), left + barWidth / 2, barY - 14);
    context.textAlign = "left";
    context.fillStyle = "#000";
    context.fillRect(left - 3, barY - 3, barWidth + 6, 24);
    context.fillStyle = "#1d1b17";
    context.fillRect(left, barY, barWidth, 18);
    const fill = context.createLinearGradient(0, barY, 0, barY + 18);
    fill.addColorStop(0, "#a6ff5c");
    fill.addColorStop(0.5, "#80ff20");
    fill.addColorStop(1, "#4f9d14");
    context.fillStyle = fill;
    context.fillRect(left, barY, barWidth * Math.min(1, data.level.into / data.level.needed), 18);
    context.fillStyle = "rgba(0, 0, 0, 0.55)";
    for (let notch = 1; notch < 18; notch += 1) context.fillRect(left + (barWidth / 18) * notch - 1, barY, 2, 18);
    context.font = '600 18px "Montserrat Variable"';
    context.fillStyle = "rgba(241, 236, 226, 0.85)";
    const rank = data.level.rank === null ? "" : ` · ${data.level.rank === 1 ? "1er" : `${data.level.rank}e`} du réseau`;
    context.fillText(`Niveau ${data.level.level}${rank}`, left, barY + 50);
    context.textAlign = "right";
    context.fillStyle = "rgba(241, 236, 226, 0.6)";
    context.fillText(`${number.format(data.level.into)} / ${number.format(data.level.needed)} XP`, left + barWidth, barY + 50);
    context.textAlign = "left";
  }

  // Trois chiffres dans des cases d'inventaire.
  const facts = data.facts.slice(0, 3);
  const boxWidth = (620 - 2 * 16) / 3;
  facts.forEach((fact, index) => {
    const x = left + index * (boxWidth + 16);
    const y = 380;
    roundRect(context, x, y, boxWidth, 104, 10);
    context.fillStyle = "rgba(16, 14, 11, 0.72)";
    context.fill();
    context.strokeStyle = "rgba(255, 255, 255, 0.12)";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#f1ece2";
    context.font = '38px "Lilita One"';
    context.fillText(fact.value, x + 18, y + 54, boxWidth - 36);
    context.fillStyle = "rgba(241, 236, 226, 0.7)";
    context.font = '600 17px "Montserrat Variable"';
    context.fillText(fact.label, x + 18, y + 84, boxWidth - 36);
  });

  // Pied : logo et nom à gauche, adresse du serveur à droite.
  context.drawImage(logo, 50, HEIGHT - 70, 52, 52);
  context.fillStyle = "#f1ece2";
  context.font = '30px "Lilita One"';
  context.fillText("Clover Games", 116, HEIGHT - 34);
  context.font = '600 20px "Montserrat Variable"';
  context.fillStyle = "#ffd457";
  context.textAlign = "right";
  context.fillText("play.clovergames.fr", WIDTH - 50, HEIGHT - 36);
  context.textAlign = "left";

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image impossible à créer."))), "image/png"));
}

/** Chiffres de la carte, à partir des statistiques : temps de jeu, meilleur classement, votes, puis série et succès. */
export function cardFacts(input: {
  playtime: number | null;
  bestRank: { rank: number; mode: string } | null;
  votes: number | null;
  streak: number | null;
  achievements: { unlocked: number; total: number } | null;
}) {
  const facts: { value: string; label: string }[] = [];
  if (input.playtime) facts.push({ value: formatDuration(input.playtime), label: "de jeu sur Clover" });
  if (input.bestRank) facts.push({ value: input.bestRank.rank === 1 ? "1er" : `${input.bestRank.rank}e`, label: `en ${input.bestRank.mode}` });
  if (input.votes) facts.push({ value: number.format(input.votes), label: input.votes > 1 ? "votes" : "vote" });
  if (facts.length < 3 && input.streak) facts.push({ value: `${input.streak} j`, label: "de connexion d'affilée" });
  if (facts.length < 3 && input.achievements?.unlocked) facts.push({ value: `${input.achievements.unlocked}/${input.achievements.total}`, label: "succès débloqués" });
  return facts;
}

type Props = {
  data: CardData | null;
  /** Page publique du joueur sur le site. */
  link: string;
  onOpenChange: (open: boolean) => void;
  /** Enregistre l'image sur le disque ; rend le chemin, `null` si le joueur annule. */
  onSave: (png: Blob, name: string) => Promise<string | null>;
};

/** Aperçu de la carte, avec le choix du fond, à copier pour Discord, enregistrer en PNG ou partager en lien. */
export function ProfileCardDialog({ data, link, onOpenChange, onSave }: Props) {
  const [theme, setTheme] = useState<CardTheme>(storedTheme);
  const [card, setCard] = useState<{ blob: Blob; url: string } | { error: string } | null>(null);
  const [state, setState] = useState<{ kind: "copied" | "linked" | "saved" | "error"; message: string } | null>(null);

  useEffect(() => {
    setState(null);
    if (!data) {
      setCard(null);
      return;
    }
    // L'ancienne carte reste affichée pendant que la nouvelle se dessine (changement de fond).
    let alive = true;
    drawProfileCard(data, theme)
      .then((blob) => alive && setCard({ blob, url: URL.createObjectURL(blob) }))
      .catch((reason) => alive && setCard({ error: String(reason) }));
    return () => {
      alive = false;
    };
  }, [data, theme]);

  const ready = card && "blob" in card ? card : null;
  // Une adresse n'est libérée qu'une fois remplacée à l'écran.
  useEffect(() => {
    if (!ready) return;
    return () => URL.revokeObjectURL(ready.url);
  }, [ready]);

  const pick = (next: CardTheme) => {
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Préférence de confort : sans stockage, le fond par défaut revient au prochain lancement.
    }
  };

  const copy = async () => {
    if (!ready) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": ready.blob })]);
      setState({ kind: "copied", message: "Carte copiée : colle-la dans Discord avec Ctrl + V." });
    } catch {
      setState({ kind: "error", message: "Copie impossible : enregistre plutôt la carte en PNG." });
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setState({ kind: "linked", message: `Lien de ton profil copié : ${link}` });
    } catch {
      setState({ kind: "error", message: "Copie du lien impossible." });
    }
  };

  const save = async () => {
    if (!ready || !data) return;
    try {
      const path = await onSave(ready.blob, `${data.name} - Clover Games`);
      if (path) setState({ kind: "saved", message: `Carte enregistrée : ${path}` });
    } catch (reason) {
      setState({ kind: "error", message: String(reason) });
    }
  };

  return (
    <Dialog open={data !== null} onOpenChange={onOpenChange}>
      <DialogContent className="mc-frame gap-0 border-[var(--mc-outline)] bg-card p-0 ring-0 sm:max-w-[760px]">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-display text-2xl font-normal">Partager ma carte</DialogTitle>
          <DialogDescription className="text-[13px]">Une image de ton profil, prête à coller sur Discord ou à envoyer à tes amis.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 py-5">
          <div className="grid aspect-[1200/630] w-full place-items-center overflow-hidden rounded-lg border border-border bg-[#100e0b]">
            {ready ? (
              <img key={ready.url} src={ready.url} alt={`Carte de profil de ${data?.name ?? ""}`} className="size-full animate-in duration-200 fade-in" />
            ) : card && "error" in card ? (
              <p className="px-6 text-center text-sm text-[#ffb3b0]">{card.error}</p>
            ) : (
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Création de la carte" />
            )}
          </div>
          <div role="radiogroup" aria-label="Fond de la carte" className="flex items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">Fond</span>
            {(Object.keys(THEMES) as CardTheme[]).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={id === theme}
                onClick={() => pick(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
                  id === theme ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span aria-hidden className="size-3.5 rounded-full border border-black/50" style={{ background: `linear-gradient(135deg, ${THEMES[id].stops[0]}, ${THEMES[id].stops[1]})` }} />
                {THEMES[id].label}
              </button>
            ))}
          </div>
          {state && (
            <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "text-sm text-[#ffb3b0]" : "truncate text-sm text-muted-foreground"}>
              {state.message}
            </p>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4">
          <button type="button" onClick={() => void copyLink()} className={secondaryButton}>
            {state?.kind === "linked" ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
            {state?.kind === "linked" ? "Lien copié" : "Copier le lien"}
          </button>
          <button type="button" onClick={() => void save()} disabled={!ready} className={secondaryButton}>
            <Download className="size-4" aria-hidden />
            Enregistrer en PNG
          </button>
          <button type="button" onClick={() => void copy()} disabled={!ready} className={primaryButton}>
            {state?.kind === "copied" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {state?.kind === "copied" ? "Copiée" : "Copier l'image"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
