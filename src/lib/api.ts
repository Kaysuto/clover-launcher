/**
 * Appels au cœur Rust (commandes Tauri de `src-tauri/src/lib.rs`), typés pour l'interface.
 * Les erreurs arrivent en texte français, prêtes à afficher.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Instance, InstanceEntry, InstanceInput, AvailableVersion, ContentEntry, ContentFolder, PlaySession } from "@/types";

import type { Settings, SteamState } from "@/screens/SettingsScreen";
import type { RecentVote } from "@/components/VoteTicker";
import type { ConsoleSnapshot, DetectedInstance, ImportItem, ImportResult, LauncherNotification, LauncherUpdate, ModCategory, ModrinthKind, ModrinthPage, ModrinthProject, NewsItem, PersonalMod, Profile, RecentServer, SkinModel } from "@/types";

export type AccountRef = { uuid: string; name: string; skinUrl: string | null };

export type Stored = {
  settings: Settings;
  accounts: AccountRef[];
  activeAccount: string | null;
  onboarded: boolean;
  disabledPersonalMods: string[];
  /** Serveurs rejoints en jeu, du plus récent au plus ancien, serveurs Clover Games compris. */
  recentServers: RecentServer[];
  instances: Instance[];
  selectedInstance: string | null;
  expertInstances: boolean;
  lastLaunchedInstance: string | null;
};

/** Manifeste distant signé, tel que vérifié par le launcher. */
export type Catalogue = {
  minecraft: { version: string };
  /** Comptes Minecraft (UUID) qui voient le réglage « Canal bêta ». */
  betaTesters?: string[];
  /** Réglages recommandés par niveau de machine (absents des anciens manifestes). */
  presets?: Partial<Record<MachineLevel, unknown>>;
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
  /** Maintenance annoncée sur le site ; `null` si la route n'a pas répondu. */
  maintenance: boolean | null;
  votes: RecentVote[] | null;
};
/** `store` : lancé depuis le paquet du Microsoft Store (mises à jour par le Store). */
/** Niveau de la machine, qui choisit les réglages recommandés (CLO-280). */
export type MachineLevel = "modest" | "standard" | "powerful";
export type MachineProfile = { memoryMb: number; cores: number; gpu: { name: string; vramMb: number | null } | null; level: MachineLevel };
/** `tray` : icône de zone de notification visible (GNOME sans l'extension AppIndicator : non). */
export type SystemInfo = { totalMemoryGb: number; autoMemoryGb: number; java: string | null; launcher: string; store: boolean; tray: boolean; machine: MachineProfile };
export type StorageUsage = { parts: { id: string; label: string; bytes: number }[]; reclaimable: number; gameDir: string };
export type SkinEntry = { id: string; name: string; model: SkinModel; texture: string };
export type TrayState = { available: boolean; canPlay: boolean };

export const api = {
  trayState: () => invoke<TrayState>("tray_state"),
  trayAction: (action: "open" | "play" | "instances" | "settings" | "quit") => invoke<void>("tray_menu_action", { action }),
  hideTrayMenu: () => invoke<void>("hide_tray_menu"),
  setTrayState: (available: boolean, canPlay: boolean) => invoke<void>("set_tray_state", { available, canPlay }),
  listInstances: () => invoke<InstanceEntry[]>("list_instances"),
  instanceVersions: () => invoke<AvailableVersion[]>("instance_versions"),
  /** Octets à télécharger avant de jouer à cette version (0 si déjà installée). */
  downloadSize: (minecraft: string) => invoke<number>("download_size", { minecraft }),
  fabricLoaders: (minecraft: string) => invoke<string[]>("fabric_loaders", { minecraft }),
  saveInstance: (id: string | null, input: InstanceInput) => invoke<string>("save_instance", { id, input }),
  selectInstance: (id: string) => invoke<void>("select_instance", { id }),
  setInstancesView: (expert: boolean) => invoke<void>("set_instances_view", { expert }),
  removeInstance: (id: string) => invoke<void>("remove_instance", { id }),
  /** `world` : dossier d'un monde précis (ou ses datapacks). */
  openInstanceFolder: (id: string, folder: string, world?: string) => invoke<void>("open_instance_folder", { id, folder, world: world ?? null }),
  setInstanceCatalogue: (mods: string[]) => invoke<void>("set_instance_catalogue", { mods }),
  playHistory: (id: string) => invoke<PlaySession[]>("play_history", { id }),
  /** Les chemins d'image deviennent des adresses du protocole `asset`, seules lisibles par la WebView. */
  instanceContent: async (id: string, folder: ContentFolder) =>
    (await invoke<ContentEntry[]>("instance_content", { id, folder })).map((entry) => ({ ...entry, image: entry.image && convertFileSrc(entry.image) })),
  /** Active ou désactive un pack de ressources, un shader ou un datapack. */
  setContentEnabled: (id: string, folder: ContentFolder, item: ContentEntry, enabled: boolean) =>
    invoke<void>("set_content_enabled", { id, folder, name: item.name, world: item.world, enabled }),
  /** Met un élément d'un onglet d'instance à la corbeille du système. */
  trashContent: (id: string, folder: ContentFolder, item: ContentEntry) =>
    invoke<void>("trash_content", { id, folder, name: item.name, world: item.world, enabled: item.enabled }),
  playInstance: (id: string) => invoke<void>("play", { mode: null, server: null, instanceId: id }),
  getStored: () => invoke<Stored>("get_stored"),
  restoreSession: () => invoke<Profile | null>("restore_session"),
  login: () => invoke<Profile>("login"),
  useAccount: (uuid: string) => invoke<Profile>("use_account", { uuid }),
  removeAccount: (uuid: string) => invoke<Profile | null>("remove_account", { uuid }),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  finishOnboarding: () => invoke<void>("finish_onboarding"),
  /** Sélecteur de dossier du système ; `null` si le joueur annule. */
  pickGameDir: () => invoke<string | null>("pick_game_dir"),
  /** Déplace le dossier du launcher puis le redémarre ; avancement par l'évènement `move-progress`. */
  moveGameDir: (chosen: string) => invoke<void>("move_game_dir", { chosen }),
  /** Notifications du compte du site lié au compte actif (CLO-283) ; `linked: false` sans compte lié. */
  notifications: () => invoke<{ linked: boolean; items: Omit<LauncherNotification, "source">[] }>("notifications"),
  /** Marque lues `ids`, ou toutes. */
  markNotificationsRead: (ids?: string[]) => invoke<void>("mark_notifications_read", { ids: ids ?? null }),
  /** Bulle du système (fenêtre cachée ou réduite). */
  systemNotification: (title: string, message: string) => invoke<void>("system_notification", { title, message }),
  /** Raccourci « Clover Games » dans la bibliothèque Steam (CLO-285). */
  steamStatus: () => invoke<SteamState>("steam_status"),
  steamAdd: () => invoke<SteamState>("steam_add"),
  steamRemove: () => invoke<SteamState>("steam_remove"),
  /** Réglages recommandés pour la machine, dans l'instance Clover Games ; fichiers écrits. */
  resetRecommended: () => invoke<string[]>("reset_recommended"),
  /** Retient la version de Minecraft du serveur ; l'ancienne si elle vient de changer. */
  noteServerVersion: (version: string) => invoke<string | null>("note_server_version", { version }),
  getCatalogue: () => invoke<Catalogue>("get_catalogue"),
  /** `host` : adresse telle que tapée dans le jeu (`hôte` ou `hôte:port`, SRV suivi). */
  serverStatus: (host: string) => invoke<ServerStatus>("server_status", { host }),
  siteFeed: () => invoke<SiteFeed>("site_feed"),
  systemInfo: () => invoke<SystemInfo>("system_info"),
  /** Installations des autres launchers ; jamais leurs comptes ni leurs jetons. */
  detectInstallations: () => invoke<DetectedInstance[]>("detect_installations"),
  /** Copie dans l'instance Clover intégrée ; avancement par l'évènement `import-progress`. */
  importInstallation: (id: string, choices: Record<ImportItem, boolean>) => invoke<ImportResult>("import_installation", { id, choices }),
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
  /** Dépendances obligatoires des mods ajoutés à la main ; `missing` : sans version pour ce Minecraft. */
  installPersonalDependencies: (files: string[]) => invoke<{ added: string[]; missing: string[] }>("install_personal_dependencies", { files }),
  removePersonalMod: (id: string) => invoke<void>("remove_personal_mod", { id }),
  setPersonalModEnabled: (id: string, enabled: boolean) => invoke<void>("set_personal_mod_enabled", { id, enabled }),
  updatePersonalMod: (id: string) => invoke<void>("update_personal_mod", { id }),
  searchModrinth: (kind: ModrinthKind, query: string, offset: number) => invoke<ModrinthPage>("search_modrinth", { kind, query, offset }),
  /** Renvoie les fichiers ajoutés (le mod et ses dépendances absentes). */
  modrinthProject: (project: string) => invoke<ModrinthProject>("modrinth_project", { project }),
  installModrinthMod: (project: string) => invoke<string[]>("install_modrinth_mod", { project }),
  /** Pack de ressources, shader ou datapack (`world` : dossier du monde) pour l'instance choisie. */
  installModrinthContent: (kind: ModrinthKind, project: string, world?: string) => invoke<string>("install_modrinth_content", { kind, project, world: world ?? null }),
  /** Crée et choisit une instance à partir du modpack ; renvoie son identifiant. */
  installModpack: (project: string) => invoke<string>("install_modpack", { project }),
  /** `mode` : identifiant d'un mode du manifeste à rejoindre directement, absent pour le Lobby. */
  play: (mode?: string) => invoke<void>("play", { mode: mode ?? null, server: null, instanceId: "clover" }),
  /** `address` : un des `recentServers`, tout autre serveur est refusé. */
  playServer: (address: string) => invoke<void>("play", { mode: null, server: address, instanceId: "clover" }),
};
