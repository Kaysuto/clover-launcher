/** Cape possédée par le compte, telle que renvoyée par Mojang. */
export type CapeInfo = { id: string; name: string; url: string; active: boolean };

/** Profil Minecraft du compte actif (le jeton reste côté Rust). */
export type Profile = {
  uuid: string;
  name: string;
  skin?: { url: string; model: SkinModel } | null;
  capes?: CapeInfo[];
};

export type InstallPhase = "java" | "libraries" | "loader" | "assets" | "mods";

/** Avancement émis par le cœur Rust (évènement `install-progress`). */
export type Progress = { phase: InstallPhase; done: number; total: number };

/** État du bouton Jouer d'une instance. Plusieurs instances jouent en même temps. */
export type PlayState =
  /** `busy` : une autre instance est en cours de lancement. */
  | { kind: "ready"; error?: string; busy?: boolean }
  | { kind: "installing"; progress?: Progress }
  /** `closing` : fermeture demandée ; `slow`, le jeu ne s'est pas fermé après un délai. */
  | { kind: "running"; closing?: "asked" | "slow" };

/** Fin d'une partie (évènement `game-exited`). */
export type GameExited = { instance: string; code: number | null };

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
  /** Catégorie du blog (« Annonce », « Mise à jour »…). */
  category?: string | null;
  /** Article lisible dans le launcher ; absent : il s'ouvre sur le site. */
  slug?: string | null;
  image: string | null;
  url: string;
  publishedAt: string;
};

/** Annonce officielle de Minecraft (en anglais, ou traduite par le site si une clé DeepL est configurée). */
export type MinecraftNewsItem = {
  id: string;
  kind: "release" | "snapshot" | "news";
  title: string;
  summary: string;
  image: string | null;
  /** Article sur minecraft.net (en anglais) ; `null` pour une note de version lue dans le launcher. */
  url: string | null;
  publishedAt: string;
  readable: boolean;
};

/** Page Actualités ; `null` : le site n'a pas répondu pour cette source. */
export type NewsPage = {
  blog: NewsItem[] | null;
  /** `translated: false` : annonces en anglais, comme Mojang les publie. */
  minecraft: { translated: boolean; items: MinecraftNewsItem[] } | null;
};

export type BlogArticle = { slug: string; title: string; category: string | null; image: string | null; author: string | null; publishedAt: string; url: string; html: string };

export type MinecraftArticle = { id: string; title: string; html: string; publishedAt: string; image: string | null };

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

export type Tab = "home" | "news" | "instances" | "mods" | "skins" | "console" | "settings" | "profile";

export type InstanceKind = "clover" | "vanilla" | "fabric" | "forge" | "neoforge";
export type Instance = {
  id: string; name: string; kind: InstanceKind;
  minecraft: string | null; loader: string | null;
  separate: boolean; memoryMb: number | null;
  /** Arguments Java ajoutés à ceux du launcher pour cette instance. */
  javaArgs?: string | null;
  enabledMods: string[] | null; disabledMods: string[]; lastPlayed: number | null;
  /** Épinglée en haut de la liste (clic droit). */
  pinned?: boolean;
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
/** Fiche d'un monde, lue dans son `level.dat`. */
export type WorldInfo = {
  /** Nom donné en jeu, qui peut différer de celui du dossier. */
  name: string | null;
  mode: "survival" | "creative" | "adventure" | "spectator" | null;
  hardcore: boolean;
  difficulty: "peaceful" | "easy" | "normal" | "hard" | null;
  commands: boolean;
  /** Version du jeu de la dernière partie. */
  version: string | null;
  lastPlayed: number | null;
  datapacks: number;
};

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
  /** Mondes seulement. */
  level?: WorldInfo | null;
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
  /** Heure écrite dans un ancien journal (`12:34:56`), quand `time` manque. */
  clock?: string;
  level: LogLevel;
  thread: string | null;
  logger: string | null;
  message: string;
  throwable: string | null;
};

/** Ancien journal d'une instance (`logs/`) ou rapport de plantage (`crash-reports/`). */
export type GameLogFile = { folder: "logs" | "crashReports"; name: string; size: number; modified: number | null };

/** Entrées après un curseur ; `session` change à chaque lancement du jeu. */
export type ConsoleSnapshot = { session: number; running: boolean; entries: LogEntry[] };

/** Bras « classiques » (4 px) ou « fins » (3 px), comme dans Minecraft. */
export type SkinModel = "classic" | "slim";

/** Cape possédée par le compte Minecraft. */
export type Cape = { id: string; name: string; texture: string };

/** Apparence du compte actif : texture du skin, forme des bras, cape portée. */
export type SkinLook = { texture: string; model: SkinModel; cape: Cape | null };

export type SavedSkin = { id: string; name: string; texture: string; model: SkinModel };

/** Tris de la Découverte, ceux de laby.net. */
export type SkinOrder = "trending_24h" | "trending_7d" | "trending_30d" | "most_used" | "latest";

/** Étiquette de laby.net : `name` anglais pour la recherche, `label` en français si traduit. */
export type SkinTag = { name: string; label: string; count: number; emoji: string | null };

/** Skin de la communauté (laby.net) ; `uses` : comptes vus avec ce skin. */
export type CommunitySkin = { hash: string; texture: string; model: SkinModel; uses: number };

/** Cape officielle (capes.me) ; `hashes` reconnaît une cape du compte, `owners` : comptes recensés. */
export type CatalogueCape = { id: string; title: string; texture: string; hashes: string[]; labyId: string | null; owners: number };

/** Joueurs vus avec une cape par laby.net : `count` au total, quelques pseudos. */
export type CapeWearers = { count: number; players: { name: string; uuid: string }[] };

/** Skin et cape actuels d'un joueur, lus chez Mojang ; `texture` absent : skin par défaut. */
export type PlayerLook = { name: string; uuid: string; texture: string | null; model: SkinModel; cape: string | null };

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
  /** Version du loader dans l'autre launcher : reprise par une nouvelle instance si elle est encore publiée. */
  loaderVersion: string | null;
  /** Mods du catalogue Clover reconnus par leur empreinte, pas encore activés. */
  catalogueMods: { id: string; name: string }[];
  /** Mods faits pour le loader de l'installation, catalogue compris : ceux d'une nouvelle instance créée par l'import. */
  loaderMods: string[];
  /** Autres mods Fabric (noms de fichiers) : copiés dans « Mes mods » si le joueur le demande. */
  personalMods: string[];
  /** Mods d'un autre loader que Fabric : pas repris dans l'instance Clover Games. */
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
/** Modpack importé depuis un fichier : l'instance créée, et les fichiers du pack introuvables hors de CurseForge. */
export type ImportedModpack = { instance: string; missing: { name: string; url: string }[] };

/** Partie demandée par un raccourci du bureau (`instance`) ou un lien `clover://play/<mode>` (`mode`). */
export type LaunchRequest = { kind: "instance" | "mode"; id: string };

/** Ce que l'export `.mrpack` ajoute aux mods de l'instance. */
export type ExportParts = { config: boolean; resourcePacks: boolean; shaderPacks: boolean; options: boolean };

/** Modpack exporté : `listed` fichiers téléchargés depuis Modrinth à l'import, `included` dans l'archive. */
export type ExportedModpack = { path: string; listed: number; included: number };

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

export type NotificationKind = "level" | "achievement" | "purchase" | "reward" | "vote" | "announcement" | "ranking" | "account";

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

/** Chiffres d'un mode, tels que le site les calcule (`siteweb/src/lib/player-stats.ts`). */
export type BedWarsStats = { matches: number; wins: number; losses: number; kills: number; finalKills: number; deaths: number; beds: number; stars: number; leaguePoints: number | null };
export type PracticeStats = { rating: number | null; peakRating: number | null; wins: number; losses: number; kills: number; deaths: number };
export type ArenaStats = { kills: number; deaths: number; assists: number; bestStreak: number; bounties: number };
export type ModeStats =
  | { id: "bedwars"; rank: number | null; stats: BedWarsStats }
  | { id: "practice"; rank: number | null; stats: PracticeStats }
  | { id: "skypvp" | "pvpsoup"; rank: number | null; stats: ArenaStats };

/** Statistiques Clover Games du compte actif ; chaque bloc vaut `null` si sa source est indisponible. */
export type PlayerStats = {
  linked: boolean;
  grade: { label: string; color: string } | null;
  level: { level: number; totalXp: number; into: number; needed: number; rank: number | null } | null;
  coins: number | null;
  votes: { total: number; month: number } | null;
  streak: { current: number; best: number } | null;
  /** Dates en millisecondes ; `online` : serveur où il joue en ce moment. */
  presence: { firstSeen: number | null; lastSeen: number | null; lastServer: string | null; online: string | null } | null;
  /** Secondes actives (hors AFK) ; `servers` du plus joué au moins joué. */
  playtime: { total: number; longest: number; joins: number; servers: { id: string; seconds: number }[] } | null;
  modes: ModeStats[] | null;
  achievements: { unlocked: number; total: number; points: number; recent: { name: string; icon: string; description: string; unlockedAt: string }[] } | null;
  /** Amis, favoris puis en ligne d'abord ; serveur et dernière connexion selon leurs réglages. */
  friends: Friend[] | null;
};

export type Friend = {
  uuid: string;
  name: string;
  favorite: boolean;
  online: boolean;
  server: string | null;
  /** Millisecondes. */
  lastSeen: number | null;
  status: string | null;
  canJoin: boolean;
};
