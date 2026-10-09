/**
 * Capes officielles : nom français, façon dont elle s'obtient ou s'obtenait, et si c'est encore
 * possible, d'après le Minecraft Wiki (vérifié le 2026-10-07). Indexées par l'identifiant de
 * capes.me ; une cape absente garde le nom de capes.me, sans statut.
 */
export type CapeStatus =
  /** Encore possible ; `until` (AAAA-MM-JJ) passé, elle devient « Plus disponible » d'elle-même. */
  | { kind: "open"; until?: string }
  /** Seulement en se rendant à une exposition ou un évènement en cours. */
  | { kind: "event" }
  /** Réservée à certains joueurs (employés, bénévoles), sur décision de Mojang. */
  | { kind: "reserved" }
  | { kind: "closed" };

export type CapeText = { name: string; how: string; status?: CapeStatus };

const closed: CapeStatus = { kind: "closed" };
const reserved: CapeStatus = { kind: "reserved" };
const personal = "Cape personnelle, offerte par Mojang à un seul joueur.";

const CAPES: Record<string, CapeText> = {
  "2011": { name: "MINECON 2011", status: closed, how: "Offerte en 2011 aux détenteurs d'un billet pour la MINECON de Las Vegas." },
  "2012": { name: "MINECON 2012", status: closed, how: "Offerte en 2012 aux détenteurs d'un billet pour la MINECON de Disneyland Paris." },
  "2013": { name: "MINECON 2013", status: closed, how: "Offerte en 2013 aux détenteurs d'un billet pour la MINECON d'Orlando." },
  "2015": { name: "MINECON 2015", status: closed, how: "Offerte en 2015 aux détenteurs d'un billet pour la MINECON de Londres." },
  "2016": { name: "MINECON 2016", status: closed, how: "Offerte en 2016 aux détenteurs d'un billet pour la MINECON d'Anaheim." },
  realms: { name: "Realms MapMaker", status: reserved, how: "Donnée aux créateurs retenus par le programme de contenu de Realms, selon ses critères." },
  migrator_cape: {
    name: "Migrator",
    status: closed,
    how: "Donnée aux joueurs qui ont migré leur compte Mojang vers un compte Microsoft, jusqu'à la fin des migrations le 19 septembre 2023.",
  },
  vanilla_cape: {
    name: "Vanilla",
    status: closed,
    how: "Donnée aux joueurs qui possédaient déjà Java et Bedrock pour Windows le 6 juin 2022, quand les deux éditions ont été réunies.",
  },
  cherry: { name: "Cerisier en fleurs", status: closed, how: "Donnée en 2023 aux joueurs qui ont voté au Mob Vote ou rejoint son serveur d'évènement." },
  "15A": { name: "15e anniversaire", status: closed, how: "À réclamer sur la page des 15 ans de minecraft.net, en mai 2024." },
  twitch: { name: "Cœur violet", status: closed, how: "Code reçu en regardant 15 minutes un live Minecraft sur Twitch, du 15 au 31 mai 2024, pour les 15 ans du jeu." },
  tiktok: { name: "Follower's", status: closed, how: "Code reçu en regardant un live Minecraft sur TikTok, du 18 mai au 18 juin 2024, pour les 15 ans du jeu." },
  mcc: { name: "MCC 15e année", status: closed, how: "Remise pour les 15 défis du serveur MCC x Minecraft 15th Anniversary Party, fermé le 5 août 2024." },
  mcexp: {
    name: "Minecraft Experience",
    status: { kind: "event" },
    how: "Remise aux visiteurs de l'exposition Minecraft Experience: Villager Rescue, en code à utiliser dans les 30 jours, selon les villes de la tournée.",
  },
  mojangoffice: { name: "Bureau de Mojang", status: closed, how: "Remise pour les cinq défis quotidiens du serveur Eerie Mojang Office Party, en décembre 2024." },
  menace: { name: "Menace", status: closed, how: "Code reçu en regardant un live Minecraft sur TikTok, du 18 mars au 6 avril 2025, pour le film Minecraft." },
  home: { name: "Home", status: closed, how: "Code reçu en regardant 3 minutes un live Minecraft sur Twitch, du 18 mars au 6 avril 2025, pour le film Minecraft." },
  yearn: { name: "Yearn", status: closed, how: "Remise pour les six quêtes du serveur A Minecraft Movie Live Event, ouvert du 25 mars au 14 avril 2025." },
  common: { name: "Common", status: closed, how: "Donnée à tous les joueurs connectés avec un compte Microsoft entre le 6 mai 2025 et le 5 mai 2026." },
  founders: {
    name: "Fondateur",
    status: closed,
    how: "Livrée avec un pack de skins gratuit pendant la MINECON Live 2019 ; ceux qui l'avaient réclamé l'ont reçue sur Java le 8 mai 2025.",
  },
  pan: { name: "Pan", status: { kind: "open" }, how: "Offerte à tous les joueurs, y compris ceux qui achètent le jeu aujourd'hui. Sur Java depuis le 8 mai 2025." },
  copper: { name: "Cuivre", status: closed, how: "Remise pour le dernier défi de la Copper Cape Quest, en octobre 2025." },
  zombiehorse: { name: "Cheval zombie", status: closed, how: "Remise pour le défi Spear Mayhem, du 12 au 15 décembre 2025." },
  moonlighttrail: { name: "Moonlight Trail", status: { kind: "event" }, how: "Remise aux visiteurs de l'exposition Minecraft Experience: Moonlight Trail, ouverte en mai 2026." },
  crafter: { name: "Crafter", status: closed, how: "Remise aux visiteurs de la TwitchCon 2026 (30 et 31 mai) qui avaient réuni trois autocollants émeraude." },
  builder: { name: "Bâtisseur", status: closed, how: "Code reçu en regardant un live sur Twitch ou TikTok, entre le 30 mai et le 22 juin 2026." },
  hero: {
    name: "Héros",
    status: { kind: "open", until: "2026-12-31" },
    how: "Donnée aux joueurs qui se connectent à Minecraft Dungeons puis à Minecraft Dungeons II avant le 31 décembre 2026.",
  },
  twisted: { name: "Twisted", status: closed, how: "Bonus réservé aux joueurs qui avaient précommandé Minecraft Dungeons II avant sa sortie." },
  aurora: {
    name: "Aurore",
    status: { kind: "open", until: "2026-10-15" },
    how: "Code reçu en regardant 3 minutes un live Minecraft Dungeons II sur TikTok, jusqu'au 15 octobre 2026, à utiliser sur minecraft.net/redeem. Les codes Twitch sont épuisés depuis le 2 octobre.",
  },
  cobalt: { name: "Cobalt", status: closed, how: "Remise aux gagnants de compétitions du jeu Cobalt, en 2016." },
  mojangstudios: { name: "Mojang Studios", status: reserved, how: "Réservée aux employés de Mojang Studios." },
  mojang: { name: "Mojang", status: closed, how: "Ancienne cape des employés de Mojang, de 2015 à 2021." },
  mojangold: { name: "Mojang classique", status: closed, how: "Première cape des employés de Mojang, de 2010 à 2015." },
  scrolls: { name: "Champion de Scrolls", status: closed, how: "Remise aux champions de compétitions du jeu Scrolls, en 2014." },
  mojira: { name: "Modérateur", status: reserved, how: "Donnée aux modérateurs bénévoles de Mojira, le suivi des bugs de Minecraft." },
  translator: { name: "Traducteur", status: reserved, how: "Donnée aux relecteurs bénévoles les plus actifs de la traduction de Minecraft." },
  translatorchinese: { name: "Traducteur chinois", status: closed, how: "Donnée à trois traducteurs de la version chinoise." },
  translatorjapanese: { name: "cheapsh0t", status: closed, how: "Cape personnelle de cheapsh0t, traducteur japonais." },
  millionth: { name: "Millionième client", status: closed, how: "Offerte au millionième acheteur de Minecraft, en janvier 2011." },
  turtle: { name: "Tortue", status: closed, how: personal },
  prismarine: { name: "Prismarine", status: closed, how: personal },
  spade: { name: "Pique", status: closed, how: personal },
  snowman: { name: "Bonhomme de neige", status: closed, how: personal },
  dB: { name: "dB", status: closed, how: personal },
  birthday: { name: "Anniversaire", status: closed, how: personal },
  valentine: { name: "Saint-Valentin", status: closed, how: personal },
  oxeye: { name: "Marguerite", status: closed, how: personal },
};

export function capeText(id: string, title: string): CapeText {
  return CAPES[id] ?? { name: title, how: "Conditions d'obtention pas encore renseignées." };
}

const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/**
 * Libellé du statut et sa teinte : `open` (vert), `event` (or), `reserved` et `closed` (neutre).
 * Une date limite dépassée rend la cape « Plus disponible » sans retoucher le tableau.
 */
export function capeAvailability(status: CapeStatus | undefined, now = new Date()): { label: string; tone: "open" | "event" | "closed" } | null {
  if (!status) return null;
  if (status.kind === "open") {
    if (!status.until) return { label: "Toujours disponible", tone: "open" };
    const until = new Date(`${status.until}T23:59:59`);
    return now > until ? { label: "Plus disponible", tone: "closed" } : { label: `Disponible jusqu'au ${day.format(until)}`, tone: "open" };
  }
  if (status.kind === "event") return { label: "Seulement sur place, pendant l'exposition", tone: "event" };
  if (status.kind === "reserved") return { label: "Réservée, sur décision de Mojang", tone: "closed" };
  return { label: "Plus disponible", tone: "closed" };
}

/** Nom anglais de Mojang (`alias` du profil, réduit à ses lettres et chiffres) → identifiant de capes.me, quand ils diffèrent. */
const BY_MOJANG_NAME: Record<string, string> = {
  minecon2011: "2011",
  minecon2012: "2012",
  minecon2013: "2013",
  minecon2015: "2015",
  minecon2016: "2016",
  realmsmapmaker: "realms",
  migrator: "migrator_cape",
  vanilla: "vanilla_cape",
  cherryblossom: "cherry",
  "15thanniversary": "15A",
  purpleheart: "twitch",
  followers: "tiktok",
  mcc15thyear: "mcc",
  minecraftexperience: "mcexp",
  mojangclassic: "mojangold",
  moderator: "mojira",
  mojiramoderator: "mojira",
};

/** Cape du compte : nom français et obtention, d'après le nom anglais donné par Mojang. */
export function ownedCapeText(mojangName: string): CapeText {
  const key = mojangName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return capeText(BY_MOJANG_NAME[key] ?? key, mojangName);
}

/** Empreinte d'une texture `textures.minecraft.net` (dernier segment de l'adresse). */
export function textureHash(url: string) {
  return url.split("/").pop() ?? "";
}

const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });

/** 5 738 317 → « 5,7 M ». */
export function shortCount(value: number) {
  return compact.format(value);
}
