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

export type Tab = "home" | "mods" | "settings";
