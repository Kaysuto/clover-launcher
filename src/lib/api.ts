/**
 * Appels au cœur Rust (commandes Tauri de `src-tauri/src/lib.rs`), typés pour l'interface.
 * Les erreurs arrivent en texte français, prêtes à afficher.
 */
import { invoke } from "@tauri-apps/api/core";

import type { Settings } from "@/screens/SettingsScreen";
import type { RecentVote } from "@/components/VoteTicker";
import type { ConsoleSnapshot, LauncherUpdate, ModCategory, ModrinthPage, ModrinthProject, NewsItem, PersonalMod, Profile, RecentServer, SkinModel } from "@/types";

export type AccountRef = { uuid: string; name: string; skinUrl: string | null };

export type Stored = {
  settings: Settings;
  accounts: AccountRef[];
  activeAccount: string | null;
  onboarded: boolean;
  disabledPersonalMods: string[];
  /** Serveurs rejoints en jeu, du plus récent au plus ancien, serveurs Clover Games compris. */
  recentServers: RecentServer[];
};

/** Manifeste distant signé, tel que vérifié par le launcher. */
export type Catalogue = {
  minecraft: { version: string };
  fabric: { loader: string };
  server: { host: string };
  modes: { id: string; name: string; image: string | null; host?: string }[];
  mods: {
    id: string;
    name: string;
    description: string | null;
    category: ModCategory | null;
    default: boolean;
    hidden: boolean;
    available: boolean;
    version: string | null;
    icon: string | null;
  }[];
};

/** `favicon` : icône du serveur en `data:` URL PNG, `null` s'il n'en a pas ou ne répond pas. */
export type ServerStatus = { online: boolean; players: number | null; max: number | null; favicon: string | null };
/** Contenu publié par le site ; une partie à `null` n'a pas pu être lue cette fois-ci. */
export type SiteFeed = {
  news: NewsItem[] | null;
  modes: { id: string; online: boolean | null; players: number | null }[] | null;
  votes: RecentVote[] | null;
};
export type SystemInfo = { totalMemoryGb: number; autoMemoryGb: number; java: string | null; launcher: string };
export type StorageUsage = { parts: { id: string; label: string; bytes: number }[]; reclaimable: number; gameDir: string };
export type SkinEntry = { id: string; name: string; model: SkinModel; texture: string };

export const api = {
  getStored: () => invoke<Stored>("get_stored"),
  restoreSession: () => invoke<Profile | null>("restore_session"),
  login: () => invoke<Profile>("login"),
  useAccount: (uuid: string) => invoke<Profile>("use_account", { uuid }),
  removeAccount: (uuid: string) => invoke<Profile | null>("remove_account", { uuid }),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  finishOnboarding: () => invoke<void>("finish_onboarding"),
  getCatalogue: () => invoke<Catalogue>("get_catalogue"),
  /** `host` : adresse telle que tapée dans le jeu (`hôte` ou `hôte:port`, SRV suivi). */
  serverStatus: (host: string) => invoke<ServerStatus>("server_status", { host }),
  siteFeed: () => invoke<SiteFeed>("site_feed"),
  systemInfo: () => invoke<SystemInfo>("system_info"),
  storageUsage: () => invoke<StorageUsage>("storage_usage"),
  cleanStorage: () => invoke<number>("clean_storage"),
  openGameDir: () => invoke<void>("open_game_dir"),
  openLogsDir: () => invoke<void>("open_logs_dir"),
  /** Sortie du jeu après l'entrée `after` (0 : tout ce que le launcher garde). */
  gameConsole: (after: number) => invoke<ConsoleSnapshot>("game_console", { after }),
  clearConsole: () => invoke<void>("clear_game_console"),
  checkUpdate: () => invoke<LauncherUpdate | null>("check_update"),
  /** Relance le launcher une fois la mise à jour installée : ne revient qu'en cas d'erreur. */
  installUpdate: () => invoke<void>("install_update"),
  listSkins: () => invoke<{ library: SkinEntry[]; defaults: SkinEntry[] }>("list_skins"),
  addSkin: (bytes: Uint8Array, name: string, model: SkinModel) => invoke<SkinEntry>("add_skin", { bytes: Array.from(bytes), name, model }),
  renameSkin: (id: string, name: string) => invoke<string>("rename_skin", { id, name }),
  removeSkin: (id: string) => invoke<void>("remove_skin", { id }),
  applySkin: (texture: string, model: SkinModel, cape: string | null) => invoke<Profile>("apply_skin", { texture, model, cape }),
  personalMods: () => invoke<PersonalMod[]>("list_personal_mods"),
  /** Octets bruts plutôt qu'un tableau JSON : un .jar pèse souvent plusieurs Mo. */
  addPersonalMod: async (file: File) =>
    invoke<void>("add_personal_mod", new Uint8Array(await file.arrayBuffer()), { headers: { "x-filename": encodeURIComponent(file.name) } }),
  removePersonalMod: (id: string) => invoke<void>("remove_personal_mod", { id }),
  setPersonalModEnabled: (id: string, enabled: boolean) => invoke<void>("set_personal_mod_enabled", { id, enabled }),
  updatePersonalMod: (id: string) => invoke<void>("update_personal_mod", { id }),
  searchModrinth: (query: string, offset: number) => invoke<ModrinthPage>("search_modrinth", { query, offset }),
  /** Renvoie les fichiers ajoutés (le mod et ses dépendances absentes). */
  modrinthProject: (project: string) => invoke<ModrinthProject>("modrinth_project", { project }),
  installModrinthMod: (project: string) => invoke<string[]>("install_modrinth_mod", { project }),
  /** `mode` : identifiant d'un mode du manifeste à rejoindre directement, absent pour le Lobby. */
  play: (mode?: string) => invoke<void>("play", { mode: mode ?? null, server: null }),
  /** `address` : un des `recentServers`, tout autre serveur est refusé. */
  playServer: (address: string) => invoke<void>("play", { mode: null, server: address }),
};
