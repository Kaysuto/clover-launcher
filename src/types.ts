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

export type Tab = "home" | "instances" | "mods" | "skins" | "console" | "settings";

export type InstanceKind = "clover" | "vanilla" | "fabric";
export type Instance = {
  id: string; name: string; kind: InstanceKind;
  minecraft: string | null; loader: string | null;
  separate: boolean; memoryMb: number | null;
  enabledMods: string[] | null; disabledMods: string[]; lastPlayed: number | null;
};
export type InstanceEntry = Instance & { gameDir: string; installed: boolean };
export type InstanceInput = Pick<Instance, "name" | "kind" | "minecraft" | "loader" | "separate" | "memoryMb">;
export type AvailableVersion = { id: string; snapshot: boolean; released: string };
/** Partie terminée (`history.rs`) : début en secondes Unix, code de sortie `null` si le jeu a été tué. */
export type PlaySession = { instance: string; started: number; seconds: number; code: number | null; servers: string[] };
export type ContentFolder = "saves" | "datapacks" | "resourcepacks" | "shaderpacks" | "screenshots";
/** Monde, pack ou capture ; `image` est une adresse affichable (icône du monde, capture). */
/**
 * Élément d'un onglet d'instance. Pour un pack (ressources, shader, datapack) : `title` et `icon` du
 * projet Modrinth s'il y est publié, sinon logo `pack.png` du pack ; `world` : monde d'un datapack.
 */
export type ContentEntry = {
  name: string;
  title: string | null;
  icon: string | null;
  world: string | null;
  /** Pack chargé par le jeu ; toujours vrai pour les mondes et captures. */
  enabled: boolean;
  size: number;
  modified: number | null;
  image: string | null;
};

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

/**
 * Ce qu'on peut reprendre d'une instance d'un autre launcher. `options` comprend les réglages des mods
 * (`config/`) ; `mods` active les équivalents du catalogue, `personalMods` copie les autres dans « Mes mods ».
 */
export type ImportItem = "options" | "servers" | "resourcePacks" | "shaderPacks" | "screenshots" | "worlds" | "mods" | "personalMods";

/** Contenu d'une installation, ou ce qu'un import en a copié. */
export type ImportContent = { options: boolean; servers: number; resourcePacks: number; shaderPacks: number; screenshots: number; worlds: number };

/** Instance trouvée dans un autre launcher (officiel, Modrinth App, Prism, CurseForge…). */
export type DetectedInstance = {
  id: string;
  launcher: string;
  name: string;
  /** `null` quand l'autre launcher ne l'indique pas sans ouvrir ses données de compte. */
  minecraft: string | null;
  /** `null` pour une instance sans mods (vanilla) ou un loader inconnu. */
  loader: string | null;
  path: string;
  content: ImportContent;
  /** Mods du catalogue Clover reconnus par leur empreinte, pas encore activés. */
  catalogueMods: { id: string; name: string }[];
  /** Autres mods Fabric (noms de fichiers) : copiés dans « Mes mods » si le joueur le demande. */
  personalMods: string[];
  /** Mods d'un autre loader (Forge, NeoForge, Quilt) : pas repris. */
  otherMods: string[];
};

/** Avancement de la recherche (évènements `import-scan`) : installations annoncées, puis mods envoyés à Modrinth. */
export type ImportScan = { found: { launcher: string; name: string; mods: number }[]; identifying: number | null };

/** Résultat d'un import : éléments copiés, mods ajoutés à « Mes mods », et ce qui était déjà chez Clover. */
export type ImportResult = ImportContent & {
  mods: number;
  /** Dépendances obligatoires des mods copiés, téléchargées depuis Modrinth. */
  dependencies: number;
  /** Dépendances sans version pour Minecraft du serveur. */
  missingDependencies: number;
  /** Modrinth injoignable : dépendances non vérifiées. */
  dependenciesUnchecked: boolean;
  kept: number;
};

/**
 * Mod ajouté par le joueur (fichier .jar ou import depuis un autre launcher), hors catalogue.
 * L'état est lu dans `fabric.mod.json` et, pour les mises à jour, sur Modrinth par empreinte.
 */
export type PersonalMod = {
  id: string;
  name: string;
  /** Logo Modrinth, ou celui du .jar (adresse `data:`), sinon `null`. */
  icon: string | null;
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

/** Types de projets cherchés sur Modrinth ; un modpack devient une nouvelle instance. */
export type ModrinthKind = "mod" | "resourcepack" | "shader" | "datapack" | "modpack";

/** Projet trouvé par la recherche Modrinth, pour la version de l'instance. */
export type ModrinthHit = {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  /** Déjà fourni par les mods Clover activés, dépendances comprises. */
  providedByClover?: boolean;
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
