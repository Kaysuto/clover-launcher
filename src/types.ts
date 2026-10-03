/** Cape possédée par le compte, telle que renvoyée par Mojang. */
export type CapeInfo = { id: string; name: string; url: string; active: boolean };

/** Profil Minecraft du compte actif (le jeton reste côté Rust). */
export type Profile = {
  uuid: string;
  name: string;
  skin?: { url: string; model: SkinModel } | null;
  capes?: CapeInfo[];
};

export type InstallPhase = "java" | "libraries" | "assets" | "mods";

/** Avancement émis par le cœur Rust (évènement `install-progress`). */
export type Progress = { phase: InstallPhase; done: number; total: number };

export type PlayState =
  | { kind: "ready"; error?: string }
  | { kind: "installing"; progress?: Progress }
  | { kind: "running" };

/**
 * `players` : nombre en jeu, `null` si le serveur du mode ne répond pas, `undefined` si on ne le
 * sait pas (site injoignable, ou dernier relevé trop ancien).
 */
export type ModeStatus = {
  id: string;
  name: string;
  icon: string | null;
  players?: number | null;
  /** Le manifeste donne une adresse qui connecte directement à ce mode. */
  quickPlay?: boolean;
};

/** Serveur hors Clover Games déjà rejoint en jeu (journal Quick Play de Minecraft). */
export type RecentServer = { address: string; name: string };

export type NewsItem = {
  title: string;
  excerpt: string;
  image: string | null;
  url: string;
  publishedAt: string;
};

export type ModCategory = "performance" | "visual" | "comfort";

export type ModInfo = {
  id: string;
  name: string;
  description: string;
  category: ModCategory;
  version: string | null;
  /** Logo du mod, ou `null` (case vide). */
  icon: string | null;
  available: boolean;
  enabled: boolean;
};

export type Tab = "home" | "mods" | "skins" | "console" | "settings";

/** Version du launcher plus récente sur le CDN (updater Tauri). */
export type LauncherUpdate = { version: string };

export type LogLevel = "info" | "warn" | "error";

/**
 * Entrée de la sortie du jeu (évènement log4j, ou ligne brute sans heure ni fil). `id` croît
 * d'une partie à l'autre et sert de curseur.
 */
export type LogEntry = {
  id: number;
  time: number | null;
  level: LogLevel;
  thread: string | null;
  logger: string | null;
  message: string;
  throwable: string | null;
};

/** Entrées après un curseur ; `session` change à chaque lancement du jeu. */
export type ConsoleSnapshot = { session: number; running: boolean; entries: LogEntry[] };

/** Bras « classiques » (4 px) ou « fins » (3 px), comme dans Minecraft. */
export type SkinModel = "classic" | "slim";

/** Cape possédée par le compte Minecraft. */
export type Cape = { id: string; name: string; texture: string };

/** Apparence du compte actif : texture du skin, forme des bras, cape portée. */
export type SkinLook = { texture: string; model: SkinModel; cape: Cape | null };

export type SavedSkin = { id: string; name: string; texture: string; model: SkinModel };

/** Ce qu'on peut reprendre d'une instance d'un autre launcher. */
export type ImportItem = "options" | "servers" | "resourcePacks" | "shaderPacks" | "screenshots" | "worlds" | "mods" | "personalMods";

/** Instance trouvée dans un autre launcher (officiel, Modrinth App, Prism, CurseForge…). */
export type DetectedInstance = {
  id: string;
  launcher: string;
  name: string;
  minecraft: string;
  /** `null` pour une instance sans mods (vanilla). */
  loader: string | null;
  path: string;
  content: { options: boolean; servers: number; resourcePacks: number; shaderPacks: number; screenshots: number; worlds: number };
  /** Mods de l'instance qui existent dans le catalogue Clover, reconnus par leur empreinte. */
  catalogueMods: string[];
  /** Mods hors catalogue : copiés dans « Mes mods » si le joueur le demande, désactivés au départ. */
  otherMods: number;
};

/**
 * Mod ajouté par le joueur (fichier .jar ou import depuis un autre launcher), hors catalogue.
 * L'état est lu dans `fabric.mod.json` et, pour les mises à jour, sur Modrinth par empreinte.
 */
export type PersonalMod = {
  id: string;
  name: string;
  version: string | null;
  filename: string;
  /** « Importé de Prism Launcher · PvP 1.21 », ou `null` pour un fichier ajouté à la main. */
  source: string | null;
  /** Projet Modrinth du fichier, s'il y est publié. */
  projectId: string | null;
  enabled: boolean;
  status:
    | { kind: "ok" }
    | { kind: "update"; builtFor: string; version: string }
    | { kind: "outdated"; builtFor: string }
    | { kind: "loader"; loader: string };
};

/** Mod trouvé par la recherche Modrinth (Fabric, version du serveur, côté client). */
export type ModrinthHit = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
};

export type ModrinthPage = { hits: ModrinthHit[]; totalHits: number };

/** Page Modrinth d'un mod. Galerie : images mises en avant d'abord ; `url` est une miniature. */
export type ModrinthProject = {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** Description complète, en HTML déjà nettoyé côté Rust. */
  descriptionHtml: string;
  iconUrl: string | null;
  author: string | null;
  downloads: number;
  license: { id: string; name: string } | null;
  updated: string;
  sourceUrl: string | null;
  issuesUrl: string | null;
  wikiUrl: string | null;
  discordUrl: string | null;
  gallery: { url: string; rawUrl: string | null; title: string | null }[];
};

export type NotificationKind = "level" | "achievement" | "purchase" | "reward" | "vote" | "announcement";

/** Notification du site (table `notifications`) ou évènement du jeu (niveau, récompense…). */
export type LauncherNotification = {
  id: string;
  kind: NotificationKind;
  source: "site" | "game";
  title: string;
  message: string;
  /** Ouvert au clic (page du site), ou `null`. */
  url: string | null;
  createdAt: string;
  read: boolean;
};

/** Version de Minecraft que le launcher sait lancer (le serveur, ou une autre pour le solo). */
export type GameVersion = {
  id: string;
  loader: string;
  /** Version que fait tourner le réseau Clover Games (`minecraft.version` du manifeste). */
  server: boolean;
  /** Peut se connecter à play.clovergames.fr : seule la version du serveur, sans ViaBackwards. */
  joinable: boolean;
  installed: boolean;
  /** Taille du téléchargement restant, `null` si déjà installée. */
  sizeMb: number | null;
  /** Mods du catalogue Clover disponibles pour cette version. */
  mods: number;
};
