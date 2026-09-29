/** Profil Minecraft du compte actif (le jeton reste côté Rust). */
export type Profile = { uuid: string; name: string };

export type InstallPhase = "java" | "libraries" | "assets" | "mods";

/** Avancement émis par le cœur Rust (évènement `install-progress`). */
export type Progress = { phase: InstallPhase; done: number; total: number };

export type PlayState =
  | { kind: "ready" }
  | { kind: "installing"; progress?: Progress }
  | { kind: "running" };

/** `players` vaut `null` quand le serveur du mode ne répond pas. */
export type ModeStatus = { id: string; name: string; icon: string | null; players: number | null };

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
  available: boolean;
  enabled: boolean;
};

export type Tab = "home" | "mods" | "skins" | "settings";

/** Bras « classiques » (4 px) ou « fins » (3 px), comme dans Minecraft. */
export type SkinModel = "classic" | "slim";

/** Cape possédée par le compte Minecraft. */
export type Cape = { id: string; name: string; texture: string };

/** Apparence du compte actif : texture du skin, forme des bras, cape portée. */
export type SkinLook = { texture: string; model: SkinModel; cape: Cape | null };

export type SavedSkin = { id: string; name: string; texture: string; model: SkinModel };

/** Ce qu'on peut reprendre d'une instance d'un autre launcher. */
export type ImportItem = "options" | "servers" | "resourcePacks" | "shaderPacks" | "screenshots" | "worlds" | "mods";

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
  /** Mods hors catalogue : jamais importés. */
  otherMods: number;
};
