import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NotificationBell } from "@/components/NotificationBell";
import { SideNav, TAB_LABELS } from "@/components/SideNav";
import { AccountMenu } from "@/components/AccountMenu";
import { TitleBar } from "@/components/TitleBar";
import { type UpdateState, UpdateToast } from "@/components/UpdateToast";
import { VoteTicker } from "@/components/VoteTicker";
import { api, type Catalogue, type MachineLevel, type ServerStatus, type SiteFeed, type SkinEntry, type Stored, type StorageUsage, type SystemInfo } from "@/lib/api";
import { formatLog } from "@/lib/log";
import { networkPlayers } from "@/lib/site";
import { ConsoleScreen } from "@/screens/ConsoleScreen";
import { CrashDialog } from "@/screens/Dialogs";
import { Breadcrumb } from "@/components/Breadcrumb";
import { HomeScreen } from "@/screens/HomeScreen";
import { InstancePanel, type InstanceDraft, newInstance } from "@/screens/InstancePanel";
import { InstancesScreen } from "@/screens/InstancesScreen";
import { ModrinthDialog } from "@/screens/ModrinthDialog";
import { ModsScreen, type ModsView } from "@/screens/ModsScreen";
import { DEFAULT_IMPORT, OnboardingAccounts, OnboardingDone, OnboardingImport, type LoginState } from "@/screens/OnboardingScreen";
import { type Account, type Settings, SettingsScreen, type SettingsTab, type HiddenSetting, settingsTabLabel } from "@/screens/SettingsScreen";
import { SkinEditorDialog } from "@/screens/SkinEditorDialog";
import { SkinsScreen } from "@/screens/SkinsScreen";
import type { Cape, ConsoleSnapshot, DetectedInstance, ImportItem, ImportResult, ImportScan, InstanceEntry, InstanceInput, ModInfo, ModrinthKind, PersonalMod, PlayState, Profile, Progress, SavedSkin, SkinLook, Tab } from "@/types";

/** Fonctions dont la ligne de réglage reste masquée tant qu'elles ne sont pas branchées. */
const UPCOMING: HiddenSetting[] = ["desktopNotifications", "steam", "changeGameDir"];
/** Paquet du Microsoft Store : le Store gère les mises à jour du launcher. */
const STORE_HIDDEN: HiddenSetting[] = ["autoUpdate"];

const STORAGE_COLORS: Record<string, string> = {
  assets: "#52a96c",
  java: "#d9a441",
  minecraft: "#5aafd6",
  mods: "#a57bc9",
  worlds: "#e08a4d",
  screenshots: "#8a8477",
};

const SERVER_POLL_MS = 60_000;
/** Après un échec (souvent le premier ping, lancé pendant le démarrage), on réessaie plus vite. */
const SERVER_RETRY_MS = 8_000;
/** Actualités, joueurs par mode et votes : le site les met en cache 30 s à 5 min. */
const SITE_POLL_MS = 60_000;
/** Les réglages sont enregistrés 300 ms après le dernier changement. */
const SETTINGS_SAVED_MS = 600;
/** Mise à jour du launcher : vérification périodique, même fenêtre fermée. */
const UPDATE_POLL_MS = 6 * 60 * 60_000;
/** Console ouverte : nouvelles lignes du jeu. */
const CONSOLE_POLL_MS = 500;
/** Comme le cœur Rust (`game/console.rs`) : au-delà, les plus anciennes lignes tombent. */
const CONSOLE_MAX_ENTRIES = 10_000;
/** Fin de la sortie montrée par l'écran de plantage. */
const CRASH_LOG_ENTRIES = 40;

const SITE_URL = "https://clovergames.fr";

/** `import` : import depuis les autres launchers ouvert depuis les paramètres. */
type Phase = "loading" | "onboarding-accounts" | "onboarding-import" | "onboarding-done" | "signin" | "import" | "app";

/** « Modrinth App · Fabulously Optimized : réglages, 2 serveurs, 3 mods activés, 40 mods copiés ». */
function importSummary(instance: DetectedInstance, result: ImportResult, mods: number): string {
  const count = (n: number, one: string, many: string) => (n > 0 ? [`${n} ${n > 1 ? many : one}`] : []);
  const parts = [
    ...(result.options ? ["réglages"] : []),
    ...count(result.servers, "serveur", "serveurs"),
    ...count(result.resourcePacks, "pack de ressources", "packs de ressources"),
    ...count(result.shaderPacks, "shader", "shaders"),
    ...count(result.screenshots, "capture", "captures"),
    ...count(result.worlds, "monde", "mondes"),
    ...count(mods, "mod activé", "mods activés"),
    ...count(result.mods, "mod copié", "mods copiés"),
    ...count(result.dependencies, "dépendance ajoutée", "dépendances ajoutées"),
  ];
  return `${instance.launcher} · ${instance.name} : ${parts.length > 0 ? parts.join(", ") : "déjà à jour"}`;
}

const LEVEL_LABEL: Record<MachineLevel, string> = { modest: "machine modeste", standard: "machine standard", powerful: "machine puissante" };

/** « 32 Go de mémoire · 32 cœurs · NVIDIA GeForce RTX 5080 (16 Go) ». */
function machineSummary(system: SystemInfo): string {
  const { gpu, cores } = system.machine;
  const card = gpu ? ` · ${gpu.name}${gpu.vramMb ? ` (${Math.round(gpu.vramMb / 1024)} Go)` : ""}` : "";
  return `${system.totalMemoryGb} Go de mémoire · ${cores} cœurs${card}`;
}

/** Compte listé dans le manifeste pour tester le canal bêta (UUID avec ou sans tirets). */
function isBetaTester(catalogue: Catalogue | null, uuid: string | undefined): boolean {
  const plain = (id: string) => id.replace(/-/g, "").toLowerCase();
  return Boolean(uuid && catalogue?.betaTesters?.some((tester) => plain(tester) === plain(uuid)));
}

/** `undefined` tant que le site n'a rien dit de ce mode, `null` s'il est hors ligne. */
function modePlayers(feed: SiteFeed, id: string): number | null | undefined {
  const mode = feed.modes?.find((entry) => entry.id === id);
  if (!mode || mode.online === null) return undefined;
  return mode.online ? mode.players : null;
}

const toCape = (cape: { id: string; name: string; url: string }): Cape => ({ id: cape.id, name: cape.name, texture: cape.url });

async function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [stored, setStored] = useState<Stored | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [login, setLogin] = useState<LoginState>({ kind: "idle" });
  // ── Import depuis les autres launchers ──
  const [detected, setDetected] = useState<DetectedInstance[] | null>(null);
  const [importScan, setImportScan] = useState<ImportScan>({ found: [], identifying: null });
  const [importSelected, setImportSelected] = useState<string | null>(null);
  const [importChoices, setImportChoices] = useState<Record<ImportItem, boolean>>(DEFAULT_IMPORT);
  const [importing, setImporting] = useState<{ id: string; ratio: number } | null>(null);
  /** Installations importées et une ligne de récapitulatif pour chacune. */
  const [imports, setImports] = useState<{ id: string; summary: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("home");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  /** Écran quitté par un raccourci : le fil d'Ariane y ramène. */
  const [from, setFrom] = useState<Tab | null>(null);
  /** Navigation principale (barre latérale, roue dentée) : pas de fil d'Ariane. */
  const navigate = useCallback((next: Tab) => {
    setFrom(null);
    if (next !== "instances") setInstanceDraft(null);
    setTab(next);
  }, []);
  const jump = (next: Tab, section?: SettingsTab) => {
    if (section) setSettingsTab(section);
    setFrom(next === tab ? from : tab);
    setTab(next);
  };
  const [modsView, setModsView] = useState<ModsView>("catalogue");

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [serverIcons, setServerIcons] = useState<Record<string, string>>({});
  const [feed, setFeed] = useState<SiteFeed>({ news: null, modes: null, maintenance: null, votes: null });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [personalMods, setPersonalMods] = useState<PersonalMod[]>([]);
  const personalGeneration = useRef(0);
  const [instances, setInstances] = useState<InstanceEntry[]>([]);
  const selectedInstance = stored?.selectedInstance ?? "clover";
  const activeInstance = instances.find((entry) => entry.id === selectedInstance);
  const [lastLaunched, setLastLaunched] = useState("clover");
  const [instanceDraft, setInstanceDraft] = useState<InstanceDraft | null>(null);

  const [play, setPlay] = useState<PlayState>({ kind: "ready" });
  const [crash, setCrash] = useState<{ code: number | null; log: string } | null>(null);
  const [gameLog, setGameLog] = useState<ConsoleSnapshot>({ session: -1, running: false, entries: [] });
  const gameLogRef = useRef(gameLog);
  const pulling = useRef<Promise<ConsoleSnapshot> | null>(null);

  const [skins, setSkins] = useState<{ library: SkinEntry[]; defaults: SkinEntry[] }>({ library: [], defaults: [] });
  const [selectedSkin, setSelectedSkin] = useState<string | null>(null);
  const [skinStatus, setSkinStatus] = useState<{ kind: "busy" | "error"; message: string } | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; draft: SkinLook | null; saving: boolean }>({ open: false, draft: null, saving: false });

  const [update, setUpdate] = useState<UpdateState | null>(null);

  const [maximized, setMaximized] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  const refreshStored = useCallback(async () => setStored(await api.getStored()), []);
  const refreshInstances = useCallback(async () => {
    const [entries, current] = await Promise.all([api.listInstances(), api.getStored()]);
    setInstances(entries); setStored(current);
  }, []);
  const selectInstance = useCallback(async (id: string) => {
    await api.selectInstance(id);
    // Vidée seulement si l'instance change : l'effet qui recharge la liste suit `selectedInstance`
    // et ne repasserait pas pour la même instance.
    if (id !== selectedInstance) {
      personalGeneration.current += 1;
      setPersonalMods([]);
    }
    await refreshStored();
  }, [refreshStored, selectedInstance]);

  useEffect(() => { if (phase === "app") refreshInstances().catch((reason) => setNotice(String(reason))); }, [phase, refreshInstances]);

  // ── Démarrage : réglages, session du compte actif, puis l'écran qui convient ──
  useEffect(() => {
    (async () => {
      let restored: Profile | null = null;
      let error: string | null = null;
      try {
        restored = await api.restoreSession();
      } catch (reason) {
        error = String(reason);
      }
      const current = await api.getStored();
      setStored(current);
      setLastLaunched(current.lastLaunchedInstance ?? "clover");
      setProfile(restored);
      if (!current.onboarded) setPhase("onboarding-accounts");
      else if (restored) setPhase("app");
      else {
        if (error) setLogin({ kind: "error", message: error });
        setPhase("signin");
      }
    })();
    api.systemInfo().then(setSystem).catch(() => {});
    api.getCatalogue().then(setCatalogue).catch((reason) => setNotice(String(reason)));
    api.listSkins().then(setSkins).catch(() => {});
  }, []);

  // ── Fenêtre sans cadre : état agrandi ──
  useEffect(() => {
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => appWindow.isMaximized().then(setMaximized));
    return () => void unlisten.then((stop) => stop());
  }, []);

  // ── Console du jeu : nouvelles lignes après la dernière reçue ; tout est remplacé à chaque partie ──
  const pullConsole = useCallback(() => {
    pulling.current ??= (async () => {
      const current = gameLogRef.current;
      try {
        const next = await api.gameConsole(current.entries[current.entries.length - 1]?.id ?? 0);
        // Console effacée pendant la requête : sa réponse remettrait les anciennes lignes.
        if (gameLogRef.current !== current) return gameLogRef.current;
        const fresh = next.session !== current.session;
        if (!fresh && next.entries.length === 0 && next.running === current.running) return current;
        const entries = fresh ? next.entries : [...current.entries, ...next.entries];
        const updated = { session: next.session, running: next.running, entries: entries.slice(-CONSOLE_MAX_ENTRIES) };
        gameLogRef.current = updated;
        setGameLog(updated);
        return updated;
      } catch {
        return current;
      } finally {
        pulling.current = null;
      }
    })();
    return pulling.current;
  }, []);

  // Le cœur Rust vide aussi sa console : les lignes suivantes repartent de là, même au plantage.
  const clearConsole = useCallback(async () => {
    await api.clearConsole();
    const cleared = { ...gameLogRef.current, entries: [] };
    gameLogRef.current = cleared;
    setGameLog(cleared);
  }, []);

  useEffect(() => {
    if (tab !== "console") return;
    pullConsole();
    const timer = window.setInterval(pullConsole, CONSOLE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [tab, pullConsole]);

  // ── Installation et fin de partie ──
  useEffect(() => {
    const unlisten = [
      listen<Progress>("install-progress", ({ payload }) => setPlay({ kind: "installing", progress: payload })),
      listen<number | null>("game-exited", async ({ payload }) => {
        setPlay({ kind: "ready" });
        // Serveurs rejoints pendant la partie.
        refreshStored();
        if (payload === 0) return;
        const log = await pullConsole();
        setCrash({ code: payload, log: formatLog(log.entries.slice(-CRASH_LOG_ENTRIES)) });
      }),
    ];
    return () => unlisten.forEach((promise) => promise.then((stop) => stop()));
  }, [refreshStored, pullConsole]);

  // ── Statut du serveur ──
  useEffect(() => {
    if (!catalogue) return;
    let cancelled = false;
    let timer: number | undefined;
    const ping = async () => {
      const status = await api.serverStatus(catalogue.server.host).catch(() => null);
      if (cancelled) return;
      if (status) setServer(status);
      timer = window.setTimeout(ping, status?.online ? SERVER_POLL_MS : SERVER_RETRY_MS);
    };
    ping();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [catalogue]);

  // ── Contenu du site : une partie illisible garde la version précédente ──
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await api.siteFeed().catch(() => null);
      if (cancelled || !next) return;
      setFeed((previous) => ({
        news: next.news ?? previous.news,
        modes: next.modes ?? previous.modes,
        maintenance: next.maintenance ?? previous.maintenance,
        votes: next.votes ?? previous.votes,
      }));
    };
    refresh();
    const timer = window.setInterval(refresh, SITE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // ── Apparence : taille de l'interface et animations ──
  const settings = stored?.settings;
  useEffect(() => {
    if (!settings) return;
    getCurrentWebview().setZoom(settings.scale / 100).catch(() => {});
    document.documentElement.classList.toggle("reduce-motion", settings.animations === "reduced");
  }, [settings?.scale, settings?.animations]);

  // ── Mise à jour du launcher : vérifiée au démarrage puis toutes les 6 h (le launcher peut rester des
  // jours dans la zone de notification), installée d'office si le réglage le demande et sans partie ──
  const installUpdate = useCallback(async () => {
    setUpdate((current) => current && { ...current, installing: true, ratio: null, error: undefined });
    try {
      await api.installUpdate();
    } catch (reason) {
      setUpdate((current) => current && { ...current, installing: false, error: String(reason) });
    }
  }, []);

  // Le serveur change de version (26.2 → 26.4) : l'instance Clover suit d'office, on le dit une fois.
  const serverVersion = catalogue?.minecraft.version;
  useEffect(() => {
    if (!serverVersion) return;
    api
      .noteServerVersion(serverVersion)
      .then((previous) => {
        if (previous) setNotice(`Clover Games passe de Minecraft ${previous} à ${serverVersion} : l'instance Clover Games se met à jour au prochain lancement. Tes mondes et tes réglages sont gardés.`);
      })
      .catch(() => {});
  }, [serverVersion]);

  // Canal bêta changé : manifeste et mise à jour du nouveau canal, une fois le réglage enregistré.
  const channel = settings?.betaChannel;
  const firstChannel = useRef(true);
  useEffect(() => {
    if (channel === undefined) return;
    if (firstChannel.current) {
      firstChannel.current = false;
      return;
    }
    const timer = window.setTimeout(() => api.getCatalogue().then(setCatalogue).catch((reason) => setNotice(String(reason))), SETTINGS_SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [channel]);

  const autoUpdate = useRef(false);
  const offered = useRef<string | null>(null);
  autoUpdate.current = Boolean(settings?.autoUpdate) && play.kind !== "running";
  const settingsReady = Boolean(settings);
  useEffect(() => {
    if (!settingsReady) return;
    const check = () =>
      api
        .checkUpdate()
        .then((info) => {
          // Une version déjà proposée ne l'est pas deux fois.
          if (!info || info.version === offered.current) return;
          offered.current = info.version;
          setUpdate({ info, installing: false, ratio: null });
          if (autoUpdate.current) installUpdate();
        })
        // CDN injoignable ou aucune version publiée : nouvel essai à la prochaine vérification.
        .catch(() => {});
    // Après l'enregistrement du réglage : un changement de canal vérifie le nouveau canal.
    const first = window.setTimeout(check, SETTINGS_SAVED_MS);
    const timer = window.setInterval(check, UPDATE_POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [settingsReady, channel, installUpdate]);

  useEffect(() => {
    const unlisten = listen<{ done: number; total: number | null }>("update-progress", ({ payload }) =>
      setUpdate((current) => current && { ...current, ratio: payload.total ? payload.done / payload.total : null }),
    );
    return () => void unlisten.then((stop) => stop());
  }, []);

  useEffect(() => {
    if (tab === "settings" && settingsTab === "storage") api.storageUsage().then(setStorage).catch(() => {});
  }, [tab, settingsTab]);

  const refreshPersonalMods = useCallback(() => {
    const request = ++personalGeneration.current;
    return api.personalMods().then((mods) => { if (request === personalGeneration.current) setPersonalMods(mods); })
      .catch((reason) => { if (request === personalGeneration.current) setNotice(String(reason)); });
  }, []);

  useEffect(() => {
    if ((tab === "mods" || tab === "instances") && activeInstance?.kind !== "vanilla") refreshPersonalMods();
  }, [tab, selectedInstance, activeInstance?.kind, refreshPersonalMods]);

  /** Réglage modifié : appliqué tout de suite, enregistré peu après (le curseur de mémoire bouge vite). */
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setStored((current) => {
      if (!current) return current;
      const next = { ...current, settings: { ...current.settings, ...patch } };
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => api.saveSettings(next.settings).catch((reason) => setNotice(String(reason))), 300);
      return next;
    });
  }, []);

  // ── Comptes ──
  const addAccount = async () => {
    setLogin({ kind: "waiting" });
    try {
      const added = await api.login();
      await refreshStored();
      setProfile((current) => current ?? added);
      setLogin({ kind: "idle" });
    } catch (reason) {
      setLogin({ kind: "error", message: String(reason) });
    }
  };

  const useAccount = async (uuid: string) => {
    try {
      setProfile(await api.useAccount(uuid));
      await refreshStored();
    } catch (reason) {
      setNotice(String(reason));
    }
  };

  const removeAccount = async (uuid: string) => {
    try {
      const next = await api.removeAccount(uuid);
      setProfile(next);
      await refreshStored();
      if (!next && phase === "app") setPhase("signin");
    } catch (reason) {
      setNotice(String(reason));
    }
  };

  const accounts: Account[] = (stored?.accounts ?? []).map((account) => ({
    profile: { uuid: account.uuid, name: account.name },
    skin: account.skinUrl,
    active: account.uuid === stored?.activeAccount,
  }));

  // ── Jeu ──
  const startGame = useCallback(async (start: () => Promise<void>) => {
    setPlay({ kind: "installing" });
    try {
      await start();
      setPlay({ kind: "running" });
    } catch (reason) {
      setPlay({ kind: "ready", error: String(reason) });
      setNotice(String(reason));
    }
  }, []);

  const trayAvailable = phase === "app" && Boolean(profile && stored);
  useEffect(() => {
    let cancelled = false;
    const unlisten = listen<"play" | "instances" | "settings">("tray-action", ({ payload }) => {
      if (!trayAvailable) return;
      if (payload === "play") {
        if (play.kind !== "ready") return;
        navigate("home");
        setLastLaunched(selectedInstance);
        void startGame(() => api.playInstance(selectedInstance));
      } else if (payload === "instances" || payload === "settings") {
        navigate(payload);
      }
    });
    // Enable the native shortcuts only after their listener is ready.
    void unlisten.then(() => {
      if (!cancelled) return api.setTrayState(trayAvailable, play.kind === "ready");
    }).catch((reason) => console.error("[tray]", reason));
    return () => {
      cancelled = true;
      void unlisten.then((stop) => stop());
    };
  }, [trayAvailable, play.kind, selectedInstance, navigate, startGame]);

  const defaultMods = useMemo(() => (catalogue?.mods ?? []).filter((mod) => mod.default && !mod.hidden && mod.available).map((mod) => mod.id), [catalogue]);
  const enabledIds = (selectedInstance === "clover" ? settings?.enabledMods : activeInstance?.enabledMods) ?? defaultMods;
  const modInfos: ModInfo[] = (catalogue?.mods ?? [])
    .filter((mod) => !mod.hidden && mod.category)
    .map((mod) => ({
      id: mod.id,
      name: mod.name,
      description: mod.description ?? "",
      category: mod.category!,
      version: mod.version,
      icon: mod.icon,
      available: mod.available,
      enabled: enabledIds.includes(mod.id),
    }));

  const toggleMod = (id: string, enabled: boolean) => {
    const next = enabled ? [...new Set([...enabledIds, id])] : enabledIds.filter((other) => other !== id);
    if (selectedInstance === "clover") updateSettings({ enabledMods: next });
    else {
      setInstances((entries) => entries.map((entry) => entry.id === selectedInstance ? { ...entry, enabledMods: next } : entry));
      api.setInstanceCatalogue(next).then(refreshInstances).catch((reason) => setNotice(String(reason)));
    }
  };

  // ── Import depuis les autres launchers : nouvelle recherche à chaque ouverture ──
  /**
   * La première ouverture anime la recherche. Les suivantes affichent tout de suite le dernier
   * résultat et le remplacent quand la nouvelle recherche répond : le cœur Rust ne relit que les mods
   * ajoutés ou modifiés depuis, la mise à jour est presque immédiate.
   */
  const detection = useRef(0);
  const openImport = (next: "onboarding-import" | "import") => {
    const request = ++detection.current;
    setPhase(next);
    setImportScan({ found: [], identifying: null });
    api
      .detectInstallations()
      .then((found) => {
        if (request !== detection.current) return;
        setDetected(found);
        setImportSelected((current) => (found.some((entry) => entry.id === current) ? current : (found[0]?.id ?? null)));
      })
      .catch((reason) => {
        if (request !== detection.current) return;
        setDetected((current) => current ?? []);
        setNotice(String(reason));
      });
  };

  useEffect(() => {
    type ScanEvent = { kind: "installation"; launcher: string; name: string; mods: number } | { kind: "identify"; mods: number };
    const unlisten = [
      listen<number>("import-progress", ({ payload }) => setImporting((current) => current && { ...current, ratio: payload })),
      listen<ScanEvent>("import-scan", ({ payload }) =>
        setImportScan((scan) =>
          payload.kind === "identify"
            ? { ...scan, identifying: payload.mods }
            : { ...scan, found: [...scan.found, { launcher: payload.launcher, name: payload.name, mods: payload.mods }] },
        ),
      ),
    ];
    return () => unlisten.forEach((promise) => void promise.then((stop) => stop()));
  }, []);

  const runImport = async () => {
    const instance = detected?.find((entry) => entry.id === importSelected);
    if (!instance || importing) return;
    setImporting({ id: instance.id, ratio: 0 });
    try {
      const result = await api.importInstallation(instance.id, importChoices);
      // Les mods ne sont pas copiés : leurs équivalents du catalogue sont activés pour Clover Games.
      const current = settings?.enabledMods ?? defaultMods;
      const added = importChoices.mods ? instance.catalogueMods.map((mod) => mod.id).filter((id) => !current.includes(id)) : [];
      if (added.length > 0) updateSettings({ enabledMods: [...current, ...added] });
      const summary = importSummary(instance, result, added.length);
      if (result.dependenciesUnchecked) setNotice("Modrinth ne répond pas : les dépendances des mods copiés n'ont pas été vérifiées. Relance l'import plus tard.");
      else if (result.missingDependencies > 0)
        setNotice(`${result.missingDependencies} dépendance${result.missingDependencies > 1 ? "s" : ""} de tes mods n'existe${result.missingDependencies > 1 ? "nt" : ""} pas pour cette version de Minecraft : désactive les mods signalés si le jeu plante.`);
      setImports((done) => [...done.filter((entry) => entry.id !== instance.id), { id: instance.id, summary }]);
    } catch (reason) {
      setNotice(String(reason));
    } finally {
      setImporting(null);
    }
  };

  // ── Mes mods ──
  const togglePersonalMod = (id: string, enabled: boolean) => {
    setPersonalMods((all) => all.map((mod) => (mod.id === id ? { ...mod, enabled } : mod)));
    api.setPersonalModEnabled(id, enabled).catch((reason) => setNotice(String(reason)));
  };

  /** Ajoute les fichiers un par un : un .jar refusé n'empêche pas les autres d'être ajoutés. */
  const addPersonalMods = async (files: File[]) => {
    const errors: string[] = [];
    const added: string[] = [];
    for (const file of files) await api.addPersonalMod(file).then(() => added.push(file.name), (reason) => errors.push(String(reason)));
    // Un mod qui exige Fabric API, Cloth Config… planterait sans elles : elles viennent de Modrinth.
    if (added.length > 0) {
      await api
        .installPersonalDependencies(added)
        .then(({ missing }) => {
          if (missing.length > 0) errors.push(`Dépendances introuvables pour cette version de Minecraft : ${missing.join(", ")}. Le jeu risque de planter avec ces mods.`);
        })
        .catch((reason) => errors.push(`Dépendances non vérifiées : ${reason}`));
    }
    if (errors.length > 0) setNotice(errors.join(" "));
    await refreshPersonalMods();
  };

  /** Mods de l'instance choisie : écran Mods, ou onglet de la page de l'instance. */
  const modsScreen = (embedded: boolean) => (
    <ModsScreen
      embedded={embedded}
      key={selectedInstance}
      view={activeInstance?.kind === "fabric" ? "personal" : modsView}
      onView={setModsView}
      mods={activeInstance?.kind === "fabric" ? [] : modInfos}
      catalogueVisible={activeInstance?.kind !== "fabric"}
      instanceName={activeInstance?.name}
      minecraftVersion={activeInstance?.minecraft ?? catalogue?.minecraft.version ?? ""}
      onToggle={toggleMod}
      personal={personalMods}
      onTogglePersonal={togglePersonalMod}
      onUpdatePersonal={(id) => changePersonalMod(api.updatePersonalMod(id))}
      onRemovePersonal={(id) => changePersonalMod(api.removePersonalMod(id))}
      onAddFiles={(files) => void addPersonalMods(files)}
      modrinth={{ project: api.modrinthProject }}
      onSearch={() => setSearchKind("mod")}
      onOpenLink={open}
    />
  );

  /** Recherche Modrinth ouverte, sur ce type de contenu. */
  const [searchKind, setSearchKind] = useState<ModrinthKind | null>(null);
  /** Fichiers posés pendant la création d'une instance depuis un modpack. */
  const [modpackProgress, setModpackProgress] = useState<[number, number] | null>(null);
  /** Change après chaque installation : la page de l'instance relit son dossier. */
  const [contentRevision, setContentRevision] = useState(0);
  useEffect(() => {
    const unlisten = listen<[number, number]>("modpack-progress", ({ payload }) => setModpackProgress(payload));
    return () => void unlisten.then((stop) => stop());
  }, []);
  const worlds = useCallback(() => api.instanceContent(selectedInstance, "saves").then((list) => list.map((world) => world.name)), [selectedInstance]);
  // Vanilla ne charge ni mods ni Iris.
  const searchKinds: ModrinthKind[] = activeInstance?.kind === "vanilla" ? ["resourcepack", "datapack", "modpack"] : ["mod", "resourcepack", "shader", "datapack", "modpack"];
  const installFromModrinth = async (kind: ModrinthKind, project: string, world?: string) => {
    if (kind === "mod") {
      await api.installModrinthMod(project);
      await refreshPersonalMods();
    } else if (kind === "modpack") {
      setModpackProgress(null);
      try {
        await api.installModpack(project);
      } finally {
        setModpackProgress(null);
      }
      await refreshInstances();
    } else {
      await api.installModrinthContent(kind, project, world);
      // Les shaders passent par Iris : activé dans le catalogue Clover, installé d'office ailleurs.
      if (kind === "shader" && selectedInstance === "clover" && !enabledIds.includes("iris")) toggleMod("iris", true);
      if (kind === "shader" && activeInstance?.kind === "fabric") await refreshPersonalMods();
    }
    setContentRevision((value) => value + 1);
  };

  /** L'instance Clover intégrée suit le manifeste : seuls les réglages du launcher la concernent. */
  const editInstance = (entry: InstanceEntry) => {
    if (entry.id === "clover") {
      jump("settings", "game");
      return;
    }
    const { name, kind, minecraft, loader, separate, memoryMb } = entry;
    setInstanceDraft({ id: entry.id, input: { name, kind, minecraft, loader, separate, memoryMb } });
  };

  const saveInstance = async (id: string | null, input: InstanceInput) => {
    await selectInstance(await api.saveInstance(id, input));
    await refreshInstances();
    setInstanceDraft(null);
  };

  const changePersonalMod = (action: Promise<void>) =>
    action.then(refreshPersonalMods).catch((reason) => setNotice(String(reason)));

  // Serveurs Clover Games exclus : l'adresse du serveur, celles des modes et leurs sous-domaines.
  const cloverHosts = catalogue ? [catalogue.server.host, ...catalogue.modes.flatMap((mode) => mode.host ?? [])] : [];
  const isClover = (address: string) => {
    const host = address.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
    return cloverHosts.some((clover) => host === clover || host.endsWith(`.${clover}`));
  };
  const recentOthers = catalogue ? (stored?.recentServers ?? []).filter((server) => !isClover(server.address)).slice(0, 3) : [];
  const otherServers = recentOthers.map((server) => ({ ...server, icon: serverIcons[server.address] ?? null }));

  // Icônes des autres serveurs : celle que le serveur renvoie au ping, comme dans la liste du jeu.
  // Adresses jointes en une clé stable pour l'effet ; une adresse ne contient jamais d'espace.
  const otherAddresses = recentOthers.map((server) => server.address).join(" ");
  useEffect(() => {
    let cancelled = false;
    for (const address of otherAddresses.split(" ").filter(Boolean)) {
      api
        .serverStatus(address)
        .then(({ favicon }) => !cancelled && favicon && setServerIcons((icons) => ({ ...icons, [address]: favicon })))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [otherAddresses]);

  // ── Skins ──
  const activeCape = profile?.capes?.find((cape) => cape.active);
  const fallbackSkin = skins.defaults.find((skin) => skin.id === "default-steve");
  const look: SkinLook = {
    texture: profile?.skin?.url ?? fallbackSkin?.texture ?? "",
    model: profile?.skin?.model ?? "classic",
    cape: activeCape ? toCape(activeCape) : null,
  };

  const applySkin = async (skin: SavedSkin) => {
    setSelectedSkin(skin.id);
    setSkinStatus({ kind: "busy", message: `Application de « ${skin.name} » sur ton compte…` });
    try {
      setProfile(await api.applySkin(skin.texture, skin.model, activeCape?.id ?? null));
      await refreshStored();
      setSkinStatus(null);
    } catch (reason) {
      setSelectedSkin(null);
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  const addSkinFile = async (file: File) => {
    try {
      await api.addSkin(new Uint8Array(await file.arrayBuffer()), file.name, "classic");
      setSkins(await api.listSkins());
      setSkinStatus(null);
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  const renameSkin = async (skin: SavedSkin, name: string) => {
    try {
      const kept = await api.renameSkin(skin.id, name);
      setSkins((current) => ({ ...current, library: current.library.map((entry) => (entry.id === skin.id ? { ...entry, name: kept } : entry)) }));
      setSkinStatus(null);
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  const removeSkin = async (skin: SavedSkin) => {
    try {
      await api.removeSkin(skin.id);
      setSkins(await api.listSkins());
      setSkinStatus(null);
    } catch (reason) {
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  const saveEditor = async () => {
    if (!editor.draft) return;
    setEditor((current) => ({ ...current, saving: true }));
    try {
      setProfile(await api.applySkin(editor.draft.texture, editor.draft.model, editor.draft.cape?.id ?? null));
      await refreshStored();
      setEditor({ open: false, draft: null, saving: false });
      setSkinStatus(null);
    } catch (reason) {
      setEditor((current) => ({ ...current, saving: false }));
      setSkinStatus({ kind: "error", message: String(reason) });
    }
  };

  // ── Rendu ──
  const appWindow = getCurrentWindow();
  const chrome = {
    maximized,
    onMinimize: () => void appWindow.minimize(),
    onToggleMaximize: () => void appWindow.toggleMaximize(),
    onClose: () => void appWindow.close(),
  };
  const open = (url: string) => void openUrl(url);

  if (phase === "loading" || !stored || !settings) {
    return <div className="h-full bg-background" />;
  }

  const noticeToast = notice && (
    <div role="alert" className="mc-frame flex max-w-[420px] items-start gap-3 bg-card px-4 py-3 text-[13px] shadow-[0_12px_32px_rgb(0_0_0/0.5)]">
      <p className="flex-1 leading-snug">{notice}</p>
      <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
        Fermer
      </button>
    </div>
  );

  if (phase !== "app") {
    const onboarding = phase === "onboarding-accounts" || phase === "onboarding-import" || phase === "onboarding-done";
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <TitleBar {...chrome} />
        {phase === "onboarding-import" || phase === "import" ? (
          <OnboardingImport
            standalone={phase === "import"}
            instances={detected}
            scan={importScan}
            selectedId={importSelected}
            onSelect={setImportSelected}
            choices={importChoices}
            onChoice={(item, value) => setImportChoices((choices) => ({ ...choices, [item]: value }))}
            importing={importing}
            imported={imports.map((entry) => entry.id)}
            onImport={() => void runImport()}
            onBack={() => setPhase("onboarding-accounts")}
            onContinue={() => setPhase(phase === "import" ? "app" : "onboarding-done")}
          />
        ) : phase === "onboarding-done" ? (
          <OnboardingDone
            accounts={accounts}
            imports={imports.map((entry) => entry.summary)}
            machine={{
              summary: system ? machineSummary(system) : "Configuration détectée au premier lancement",
              preset: system && catalogue?.presets?.[system.machine.level] ? LEVEL_LABEL[system.machine.level] : undefined,
              memoryGb: settings.memoryAuto ? (system?.autoMemoryGb ?? 4) : settings.memoryGb,
            }}
            crashReports={settings.crashReports}
            onCrashReports={(crashReports) => updateSettings({ crashReports })}
            onBack={() => setPhase("onboarding-import")}
            onStart={async () => {
              await api.finishOnboarding();
              await refreshStored();
              setPhase("app");
            }}
          />
        ) : (
          <OnboardingAccounts
            standalone={!onboarding}
            accounts={accounts}
            login={login}
            onAdd={addAccount}
            onMakeMain={useAccount}
            onRemove={removeAccount}
            onContinue={async () => {
              if (onboarding) return openImport("onboarding-import");
              try {
                const restored = await api.restoreSession();
                if (restored) {
                  setProfile(restored);
                  setPhase("app");
                }
              } catch (reason) {
                setLogin({ kind: "error", message: String(reason) });
              }
            }}
          />
        )}
        <div className="fixed right-4 bottom-4 z-50">{noticeToast}</div>
      </div>
    );
  }

  const activeAccount = stored.accounts.find((account) => account.uuid === stored.activeAccount);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <TitleBar
        {...chrome}
        session={profile ? { tab, onTab: navigate } : undefined}
        account={
          profile && (
            <AccountMenu
              profile={profile}
              skin={profile.skin?.url ?? activeAccount?.skinUrl ?? null}
              accounts={accounts}
              onUse={useAccount}
              onRemove={removeAccount}
              onAdd={addAccount}
              onManage={() => jump("settings", "general")}
            />
          )
        }
        activity={settings.showVotes && feed.votes ? <VoteTicker votes={feed.votes} onVote={() => open(`${SITE_URL}/vote`)} /> : undefined}
        notifications={<NotificationBell items={[]} onOpen={() => {}} onReadAll={() => {}} />}
      />

      <div className="flex min-h-0 flex-1">
        <SideNav tab={tab} onTab={navigate} />
        <div className="flex min-w-0 flex-1 flex-col">
          {from && (
            <Breadcrumb
              trail={[TAB_LABELS[from], TAB_LABELS[tab], ...(tab === "settings" ? [settingsTabLabel(settingsTab)] : [])]}
              onBack={() => navigate(from)}
            />
          )}
          {tab === "home" && (
            <HomeScreen
              look={look}
              animateSkin={settings.animatedSkin && settings.animations !== "reduced"}
              enabledMods={activeInstance?.kind === "vanilla" ? [] : activeInstance?.kind === "fabric" ? personalMods.filter((mod) => mod.enabled && mod.status.kind === "ok").map((mod) => mod.name) : modInfos.filter((mod) => mod.enabled && mod.available).map((mod) => mod.name)}
              onManageMods={() => jump("mods")}
              onOpenConsole={() => jump("console")}
              play={play}
              onPlay={(mode) => {
                const id = mode ? "clover" : selectedInstance;
                setLastLaunched(id);
                startGame(() => mode ? selectInstance("clover").then(() => api.play(mode)) : api.playInstance(id));
              }}
              instances={instances}
              selectedInstance={selectedInstance}
              onSelectInstance={(id) => selectInstance(id).catch((reason) => setNotice(String(reason)))}
              onCreateInstance={() => { setInstanceDraft(newInstance()); jump("instances"); }}
              onManageInstances={() => jump("instances")}
              server={server && { online: server.online, players: networkPlayers(feed, catalogue?.modes ?? []) }}
              modes={(catalogue?.modes ?? []).map((mode) => ({
                id: mode.id,
                name: mode.name,
                icon: mode.image,
                players: modePlayers(feed, mode.id),
                quickPlay: Boolean(mode.host),
              }))}
              destination="lobby"
              otherServers={otherServers}
              onPlayServer={(address) => { setLastLaunched("clover"); startGame(() => selectInstance("clover").then(() => api.playServer(address))); }}
              news={feed.news ?? []}
              maintenance={feed.maintenance === true}
              onOpenLink={open}
            />
          )}

          {tab === "instances" && (
            <div className="flex min-h-0 flex-1">
            <InstancesScreen
              instances={instances}
              selected={selectedInstance}
              expert={stored.expertInstances}
              play={play}
              running={play.kind === "running" ? lastLaunched : null}
              onSelect={(id) => selectInstance(id).catch((reason) => setNotice(String(reason)))}
              onView={(expert) => { setStored((current) => current && { ...current, expertInstances: expert }); api.setInstancesView(expert).catch((reason) => setNotice(String(reason))); }}
              onPlay={(id) => { setLastLaunched(id); startGame(() => selectInstance(id).then(() => api.playInstance(id)).then(refreshInstances)); }}
              onCreate={(minecraft) => setInstanceDraft(newInstance(minecraft))}
              onEdit={editInstance}
              onOpenFolder={(id, folder) => api.openInstanceFolder(id, folder).catch((reason) => setNotice(String(reason)))}
              mods={modsScreen(true)}
              contentRevision={contentRevision}
              onSearch={setSearchKind}
              onRemove={(id) => api.removeInstance(id).then(refreshInstances).catch((reason) => setNotice(String(reason)))}
            />
            {instanceDraft && <InstancePanel draft={instanceDraft} onClose={() => setInstanceDraft(null)} onSave={saveInstance} />}
            </div>
          )}

          {tab === "mods" && activeInstance?.kind === "vanilla" && <main className="flex flex-1 flex-col items-center justify-center gap-4"><h1 className="font-display text-2xl">Vanilla se lance sans mods</h1><p className="text-sm text-muted-foreground">Choisis une instance Fabric ou Clover pour gérer tes mods.</p><button className="text-primary hover:underline" onClick={() => jump("instances")}>Voir les instances</button></main>}
          {tab === "mods" && activeInstance?.kind !== "vanilla" && modsScreen(false)}

          {tab === "skins" && profile && (
            <SkinsScreen
              playerName={profile.name}
              look={look}
              animateSkin={settings.animatedSkin && settings.animations !== "reduced"}
              saved={skins.library}
              defaults={skins.defaults}
              activeId={selectedSkin}
              onSelect={applySkin}
              onAddFile={addSkinFile}
              onRename={(skin, name) => void renameSkin(skin, name)}
              onRemove={(skin) => void removeSkin(skin)}
              onEdit={() => setEditor({ open: true, draft: look, saving: false })}
              status={skinStatus}
            />
          )}

          {tab === "console" && (
            <ConsoleScreen entries={gameLog.entries} running={gameLog.running} onClear={() => void clearConsole()} onOpenLogs={() => void api.openLogsDir()} />
          )}

          {tab === "settings" && (
            <SettingsScreen
              hidden={system?.store ? [...UPCOMING, ...STORE_HIDDEN] : UPCOMING}
              tab={settingsTab}
              onTab={setSettingsTab}
              settings={settings}
              onChange={updateSettings}
              system={{ totalMemoryGb: system?.totalMemoryGb ?? 8, autoMemoryGb: system?.autoMemoryGb ?? 4, java: system?.java ?? null, tray: system?.tray ?? true }}
              accounts={accounts}
              onUseAccount={useAccount}
              onRemoveAccount={removeAccount}
              onAddAccount={addAccount}
              onResetRecommended={() =>
                api
                  .resetRecommended()
                  .then((written) => setNotice(written.length > 0 ? "Réglages recommandés rétablis : les anciens fichiers sont gardés en .bak dans le dossier du jeu." : "Réglages déjà à jour."))
                  .catch((reason) => setNotice(String(reason)))
              }
              storage={{
                parts: (storage?.parts ?? []).filter((part) => part.bytes > 0).map((part) => ({ ...part, color: STORAGE_COLORS[part.id] ?? "#8a8477" })),
                reclaimable: storage?.reclaimable ?? 0,
                gameDir: storage?.gameDir ?? "",
              }}
              onOpenGameDir={() => void api.openGameDir()}
              onImport={() => openImport("import")}
              onChangeGameDir={() => {}}
              onCleanStorage={async () => {
                await api.cleanStorage();
                setStorage(await api.storageUsage());
              }}
              steam={{ state: "absent", onAdd: () => {}, onRemove: () => {} }}
              isStaff={isBetaTester(catalogue, profile?.uuid) || settings.betaChannel}
              about={{ launcher: system?.launcher ?? "", minecraft: catalogue?.minecraft.version ?? "", fabric: catalogue?.fabric.loader ?? "" }}
              onOpenLink={open}
            />
          )}
        </div>
      </div>

      {editor.draft && (
        <SkinEditorDialog
          open={editor.open}
          draft={editor.draft}
          capes={(profile?.capes ?? []).map(toCape)}
          saving={editor.saving}
          onChange={(draft) => setEditor((current) => ({ ...current, draft }))}
          onReplaceTexture={async (file) => {
            const texture = await readAsDataUrl(file);
            setEditor((current) => (current.draft ? { ...current, draft: { ...current.draft, texture } } : current));
          }}
          onSave={saveEditor}
          onOpenChange={(openEditor) => setEditor((current) => ({ ...current, open: openEditor }))}
        />
      )}

      <ModrinthDialog
        open={searchKind !== null}
        onOpenChange={(next) => !next && setSearchKind(null)}
        minecraftVersion={(searchKind === "modpack" ? null : activeInstance?.minecraft) ?? catalogue?.minecraft.version ?? ""}
        kinds={searchKinds}
        kind={searchKind ?? "mod"}
        onKind={setSearchKind}
        installed={new Set(personalMods.flatMap((mod) => (mod.projectId ? [mod.projectId] : [])))}
        search={api.searchModrinth}
        onInstall={installFromModrinth}
        worlds={worlds}
        progress={modpackProgress}
      />

      <CrashDialog
        open={crash !== null}
        exitCode={crash?.code ?? null}
        logTail={crash?.log ?? ""}
        onCopyLog={() => void navigator.clipboard.writeText(crash?.log ?? "")}
        onOpenLogs={() => void api.openLogsDir()}
        onRelaunch={() => {
          setCrash(null);
          startGame(() => api.playInstance(lastLaunched));
        }}
        onOpenChange={(openDialog) => !openDialog && setCrash(null)}
      />

      <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
        {update && <UpdateToast update={update} onInstall={() => void installUpdate()} onDismiss={() => setUpdate(null)} />}
        {noticeToast}
      </div>
    </div>
  );
}
