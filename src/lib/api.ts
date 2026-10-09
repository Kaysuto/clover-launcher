/**
 * Appels au cœur Rust (commandes Tauri de `src-tauri/src/lib.rs`), typés pour l'interface.
 * Les erreurs arrivent en texte français, prêtes à afficher.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Instance, InstanceEntry, InstanceInput, InstanceKind, AvailableVersion, ContentEntry, ContentFolder, PlaySession } from "@/types";

import type { Settings, SteamState } from "@/screens/SettingsScreen";
import type { RecentVote } from "@/components/VoteTicker";
import type { ConsoleSnapshot, DetectedInstance, ExportedModpack, ExportParts, GameLogFile, LaunchRequest, LogEntry, ImportItem, ImportResult, ImportedModpack, LauncherNotification, LauncherUpdate, ModCategory, ModrinthKind, ModrinthPage, ModrinthProject, BlogArticle, MinecraftArticle, NewsItem, NewsPage, PersonalMod, Profile, RecentServer, SkinModel, SkinOrder, SkinTag, CommunitySkin, CatalogueCape, CapeWearers, PlayerLook, PlayerStats } from "@/types";

export type AccountRef = { uuid: string; name: string; skinUrl: string | null };

export type Stored = {
  settings: Settings;
  accounts: AccountRef[];
  activeAccount: string | null;
  onboarded: boolean;
  disabledPersonalMods: string[];
  /** Serveurs rejoints en jeu, du plus récent au plus ancien, serveurs Clover Games compris. */
  recentServers: RecentServer[];
  /** Noms donnés dans le launcher aux serveurs rejoints, par adresse en minuscules. */
  serverNames?: Record<string, string>;
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
/** Niveau de la machine, qui choisit les réglages recommandés. */
export type MachineLevel = "modest" | "standard" | "powerful";
export type MachineProfile = { memoryMb: number; cores: number; gpu: { name: string; vramMb: number | null } | null; level: MachineLevel };
/** `tray` : icône de zone de notification visible (GNOME sans l'extension AppIndicator : non). */
/** `crash` : DSN et version pour les rapports de plantage de l'interface (avec l'accord du joueur). */
export type SystemInfo = {
  totalMemoryGb: number;
  autoMemoryGb: number;
  java: string | null;
  launcher: string;
  store: boolean;
  tray: boolean;
  /** Raccourcis d'instance sur le bureau possibles (Windows hors Store, Linux). */
  desktopShortcuts: boolean;
  machine: MachineProfile;
  crash: { dsn: string; release: string; environment: string };
};
export type StorageUsage = { parts: { id: string; label: string; bytes: number }[]; reclaimable: number; gameDir: string };
export type SkinEntry = { id: string; name: string; model: SkinModel; texture: string };
export type TrayState = { available: boolean; canPlay: boolean };
/** `changedAt` : dernier changement de pseudo (ISO 8601). */
export type NameChange = { allowed: boolean; changedAt: string | null; createdAt?: string | null };
export type NameAvailability = "available" | "taken" | "not_allowed";

export const api = {
  trayState: () => invoke<TrayState>("tray_state"),
  trayAction: (action: "open" | "play" | "instances" | "settings" | "quit") => invoke<void>("tray_menu_action", { action }),
  hideTrayMenu: () => invoke<void>("hide_tray_menu"),
  setTrayState: (available: boolean, canPlay: boolean) => invoke<void>("set_tray_state", { available, canPlay }),
  listInstances: () => invoke<InstanceEntry[]>("list_instances"),
  instanceVersions: () => invoke<AvailableVersion[]>("instance_versions"),
  /** Octets à télécharger avant de jouer à cette version (0 si déjà installée). */
  downloadSize: (minecraft: string) => invoke<number>("download_size", { minecraft }),
  /** Versions du loader (Fabric, Forge, NeoForge) pour `minecraft`, celle à proposer d'abord. */
  instanceLoaders: (kind: InstanceKind, minecraft: string) => invoke<string[]>("instance_loaders", { kind, minecraft }),
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
  /** Nom affiché d'un monde solo (`level.dat`), pas celui de son dossier. */
  renameWorld: (id: string, world: string, name: string) => invoke<void>("rename_world", { id, world, name }),
  /** Nom d'un serveur rejoint ; vide pour reprendre celui du jeu. */
  renameServer: (address: string, name: string) => invoke<void>("rename_server", { address, name }),
  /** Paramètres de la page d'une instance ; le nom de Clover Games ne change pas. */
  updateInstance: (id: string, name: string, memoryMb: number | null, javaArgs: string) => invoke<void>("update_instance", { id, name, memoryMb, javaArgs }),
  playInstance: (id: string) => invoke<void>("play", { mode: null, server: null, instanceId: id }),
  /** Ouvre directement un monde solo de l'instance (Minecraft 1.20 et suivantes). */
  playWorld: (id: string, world: string) => invoke<void>("play", { mode: null, server: null, world, instanceId: id }),
  /** Publie le journal sur mclo.gs ; renvoie l'adresse de sa page. */
  shareLog: (log: string) => invoke<string>("share_log", { log }),
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
  /** Notifications du compte du site lié au compte actif ; `linked: false` sans compte lié. */
  notifications: () => invoke<{ linked: boolean; items: (Omit<LauncherNotification, "source"> & { source?: LauncherNotification["source"] })[] }>("notifications"),
  /** Marque lues `ids`, ou toutes. */
  markNotificationsRead: (ids?: string[]) => invoke<void>("mark_notifications_read", { ids: ids ?? null }),
  /** Bulle du système (fenêtre cachée ou réduite). */
  systemNotification: (title: string, message: string) => invoke<void>("system_notification", { title, message }),
  /** Raccourci « Clover Games » dans la bibliothèque Steam. */
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
  /** Page Actualités : blog de Clover Games et annonces officielles de Minecraft. */
  newsPage: () => invoke<NewsPage>("news_page"),
  /** Article du blog de Clover Games, lu dans le launcher. */
  blogArticle: (slug: string) => invoke<BlogArticle>("blog_article", { slug }),
  /** Note de version Minecraft complète. */
  minecraftArticle: (id: string) => invoke<MinecraftArticle>("minecraft_article", { id }),
  systemInfo: () => invoke<SystemInfo>("system_info"),
  /** Installations des autres launchers ; jamais leurs comptes ni leurs jetons. */
  detectInstallations: () => invoke<DetectedInstance[]>("detect_installations"),
  /** Copie dans l'instance Clover intégrée ; avancement par l'évènement `import-progress`. */
  importInstallation: (id: string, choices: Record<ImportItem, boolean>) => invoke<ImportResult>("import_installation", { id, choices }),
  setInstancePinned: (id: string, pinned: boolean) => invoke<void>("set_instance_pinned", { id, pinned }),
  /** Copie d'une instance personnelle (mondes compris si son dossier est séparé) ; renvoie son identifiant. */
  duplicateInstance: (id: string) => invoke<string>("duplicate_instance", { id }),
  /** Raccourci « <instance> - Clover » sur le bureau ; renvoie son chemin. */
  createDesktopShortcut: (id: string) => invoke<string>("create_desktop_shortcut", { id }),
  /** Partie demandée par un raccourci du bureau ou un lien `clover://`, une seule fois. */
  takeLaunchRequest: () => invoke<LaunchRequest | null>("take_launch_request"),
  /** `.mrpack` de l'instance, à l'endroit choisi par le joueur ; `null` s'il annule. */
  exportModpack: (id: string, parts: ExportParts) => invoke<ExportedModpack | null>("export_modpack", { id, parts }),
  /** Nouvelle instance (Vanilla ou Fabric, dossier séparé) à partir d'une installation détectée ; renvoie son identifiant. */
  importAsInstance: (id: string, choices: Record<ImportItem, boolean>) => invoke<string>("import_as_instance", { id, choices }),
  storageUsage: () => invoke<StorageUsage>("storage_usage"),
  cleanStorage: () => invoke<number>("clean_storage"),
  openGameDir: () => invoke<void>("open_game_dir"),
  openLogsDir: () => invoke<void>("open_logs_dir"),
  /** Sortie du jeu de l'instance après l'entrée `after` (0 : tout ce que le launcher garde). */
  gameConsole: (instance: string, after: number) => invoke<ConsoleSnapshot>("game_console", { instance, after }),
  /** Instances dont le jeu, lancé par ce launcher, est ouvert. */
  runningGames: () => invoke<string[]>("running_games"),
  /** Ferme le jeu de l'instance (comme la croix de sa fenêtre), ou le tue avec `force`. `false` :
   * pas encore de fenêtre à fermer. */
  stopGame: (instance: string, force: boolean) => invoke<boolean>("stop_game", { instance, force }),
  /** Anciens journaux d'une instance, du plus récent au plus ancien. */
  gameLogs: (id: string) => invoke<GameLogFile[]>("game_logs", { id }),
  readGameLog: (id: string, file: GameLogFile) => invoke<LogEntry[]>("read_game_log", { id, folder: file.folder, name: file.name }),
  clearConsole: (instance: string) => invoke<void>("clear_game_console", { instance }),
  checkUpdate: () => invoke<LauncherUpdate | null>("check_update"),
  /** Relance le launcher une fois la mise à jour installée : ne revient qu'en cas d'erreur. */
  installUpdate: () => invoke<void>("install_update"),
  listSkins: () => invoke<{ library: SkinEntry[] }>("list_skins"),
  addSkin: (bytes: Uint8Array, name: string, model: SkinModel) => invoke<SkinEntry>("add_skin", { bytes: Array.from(bytes), name, model }),
  renameSkin: (id: string, name: string) => invoke<string>("rename_skin", { id, name }),
  removeSkin: (id: string) => invoke<void>("remove_skin", { id }),
  applySkin: (texture: string, model: SkinModel, cape: string | null) => invoke<Profile>("apply_skin", { texture, model, cape }),
  /** Ajoute à la bibliothèque une texture de laby.net ou de Mojang. */
  addRemoteSkin: (texture: string, name: string, model: SkinModel) => invoke<SkinEntry>("add_remote_skin", { texture, name, model }),
  /** Enregistre un skin en .png là où le joueur le choisit ; `null` s'il annule. */
  exportSkin: (texture: string, name: string) => invoke<string | null>("export_skin", { texture, name }),
  discoverTags: () => invoke<SkinTag[]>("discover_tags"),
  discoverSkins: (input: string, order: SkinOrder, offset: number) => invoke<CommunitySkin[]>("discover_skins", { input, order, offset }),
  discoverCapes: () => invoke<CatalogueCape[]>("discover_capes"),
  capeWearers: (labyId: string) => invoke<CapeWearers>("cape_wearers", { labyId }),
  playerLook: (name: string) => invoke<PlayerLook | null>("player_look", { name }),
  /** Pseudo du compte actif : Mojang n'en permet qu'un changement tous les 30 jours. */
  nameChangeInfo: () => invoke<NameChange>("name_change_info"),
  /** Statistiques Clover Games du compte actif (`/api/launcher/profile` du site). */
  playerStats: () => invoke<PlayerStats>("player_stats"),
  /** Enregistre une image PNG (carte de profil) là où le joueur le choisit ; `null` s'il annule. */
  savePng: async (png: Blob, name: string) =>
    invoke<string | null>("save_png", new Uint8Array(await png.arrayBuffer()), { headers: { "x-filename": encodeURIComponent(name) } }),
  nameAvailability: (name: string) => invoke<NameAvailability>("name_availability", { name }),
  changeName: (name: string) => invoke<Profile>("change_name", { name }),
  /** « Mes mods » de `instance`, de l'instance choisie sans elle. */
  personalMods: (instance?: string) => invoke<PersonalMod[]>("list_personal_mods", { instance: instance ?? null }),
  /** Octets bruts plutôt qu'un tableau JSON : un .jar pèse souvent plusieurs Mo. */
  addPersonalMod: async (file: File) =>
    invoke<void>("add_personal_mod", new Uint8Array(await file.arrayBuffer()), { headers: { "x-filename": encodeURIComponent(file.name) } }),
  /** Dépendances obligatoires des mods ajoutés à la main ; `missing` : sans version pour ce Minecraft. */
  installPersonalDependencies: (files: string[]) => invoke<{ added: string[]; missing: string[] }>("install_personal_dependencies", { files }),
  removePersonalMod: (id: string) => invoke<void>("remove_personal_mod", { id }),
  setPersonalModEnabled: (id: string, enabled: boolean) => invoke<void>("set_personal_mod_enabled", { id, enabled }),
  updatePersonalMod: (id: string) => invoke<void>("update_personal_mod", { id }),
  /** Filtrée sur la version de Minecraft de `instance`, de l'instance choisie sans elle. */
  searchModrinth: (kind: ModrinthKind, query: string, offset: number, instance?: string) =>
    invoke<ModrinthPage>("search_modrinth", { kind, query, offset, instance: instance ?? null }),
  modrinthProject: (project: string) => invoke<ModrinthProject>("modrinth_project", { project }),
  /** Renvoie les fichiers ajoutés (le mod et ses dépendances absentes). */
  installModrinthMod: (project: string, instance?: string) => invoke<string[]>("install_modrinth_mod", { project, instance: instance ?? null }),
  /** Pack de ressources, shader ou datapack (`world` : dossier du monde) pour `instance`, l'instance choisie sans elle. */
  installModrinthContent: (kind: ModrinthKind, project: string, world?: string, instance?: string) =>
    invoke<string>("install_modrinth_content", { kind, project, world: world ?? null, instance: instance ?? null }),
  /** Crée et choisit une instance à partir du modpack ; renvoie son identifiant. */
  installModpack: (project: string) => invoke<string>("install_modpack", { project }),
  /** Crée et choisit une instance depuis un `.mrpack` ou un `.zip` CurseForge choisi par le joueur ; `null` s'il annule. */
  importModpackFile: () => invoke<ImportedModpack | null>("import_modpack_file"),
  /** `mode` : identifiant d'un mode du manifeste à rejoindre directement, absent pour le menu du jeu. */
  play: (mode?: string) => invoke<void>("play", { mode: mode ?? null, server: null, instanceId: "clover" }),
  /** `address` : un des `recentServers`, tout autre serveur est refusé. */
  playServer: (address: string) => invoke<void>("play", { mode: null, server: address, instanceId: "clover" }),
};
