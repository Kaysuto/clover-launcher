/**
 * Appels au cœur Rust (commandes Tauri de `src-tauri/src/lib.rs`), typés pour l'interface.
 * Les erreurs arrivent en texte français, prêtes à afficher.
 */
import { invoke } from "@tauri-apps/api/core";

import type { Settings } from "@/screens/SettingsScreen";
import type { RecentVote } from "@/components/VoteTicker";
import type { ModCategory, NewsItem, Profile, SkinModel } from "@/types";

export type AccountRef = { uuid: string; name: string; skinUrl: string | null };

export type Stored = {
  settings: Settings;
  accounts: AccountRef[];
  activeAccount: string | null;
  onboarded: boolean;
};

/** Manifeste distant signé, tel que vérifié par le launcher. */
export type Catalogue = {
  minecraft: { version: string };
  fabric: { loader: string };
  server: { host: string };
  modes: { id: string; name: string; image: string | null }[];
  mods: {
    id: string;
    name: string;
    description: string | null;
    category: ModCategory | null;
    default: boolean;
    hidden: boolean;
    available: boolean;
    version?: string | null;
  }[];
};

export type ServerStatus = { online: boolean; players: number | null; max: number | null };
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
  serverStatus: (host: string) => invoke<ServerStatus>("server_status", { host }),
  siteFeed: () => invoke<SiteFeed>("site_feed"),
  systemInfo: () => invoke<SystemInfo>("system_info"),
  storageUsage: () => invoke<StorageUsage>("storage_usage"),
  cleanStorage: () => invoke<number>("clean_storage"),
  openGameDir: () => invoke<void>("open_game_dir"),
  openLogsDir: () => invoke<void>("open_logs_dir"),
  gameLogTail: () => invoke<string>("game_log_tail"),
  listSkins: () => invoke<{ library: SkinEntry[]; defaults: SkinEntry[] }>("list_skins"),
  addSkin: (bytes: Uint8Array, name: string, model: SkinModel) => invoke<SkinEntry>("add_skin", { bytes: Array.from(bytes), name, model }),
  removeSkin: (id: string) => invoke<void>("remove_skin", { id }),
  applySkin: (texture: string, model: SkinModel, cape: string | null) => invoke<Profile>("apply_skin", { texture, model, cape }),
  play: () => invoke<void>("play"),
};
