import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NotificationBell } from "@/components/NotificationBell";
import { SideNav } from "@/components/SideNav";
import { AccountMenu } from "@/components/AccountMenu";
import { TitleBar } from "@/components/TitleBar";
import { type UpdateState, UpdateToast } from "@/components/UpdateToast";
import { VoteTicker } from "@/components/VoteTicker";
import { api, type Catalogue, type ServerStatus, type SiteFeed, type SkinEntry, type Stored, type StorageUsage, type SystemInfo } from "@/lib/api";
import { formatLog } from "@/lib/log";
import { ConsoleScreen } from "@/screens/ConsoleScreen";
import { CrashDialog } from "@/screens/Dialogs";
import { HomeScreen } from "@/screens/HomeScreen";
import { ModsScreen, type ModsView } from "@/screens/ModsScreen";
import { OnboardingAccounts, OnboardingDone, type LoginState } from "@/screens/OnboardingScreen";
import { type Account, type Settings, SettingsScreen, type SettingsTab, type HiddenSetting } from "@/screens/SettingsScreen";
import { SkinEditorDialog } from "@/screens/SkinEditorDialog";
import { SkinsScreen } from "@/screens/SkinsScreen";
import type { Cape, ConsoleSnapshot, GameVersion, ModInfo, PersonalMod, PlayState, Profile, Progress, SavedSkin, SkinLook, Tab } from "@/types";

/** Étapes du premier lancement tant que l'import depuis les autres launchers n'existe pas (CLO-281). */
const STEPS = ["Comptes", "Terminé"] as const;

/** Fonctions dont la ligne de réglage reste masquée tant qu'elles ne sont pas branchées. */
const UPCOMING: HiddenSetting[] = ["desktopNotifications", "recommended", "steam", "changeGameDir"];
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
/** Console ouverte : nouvelles lignes du jeu. */
const CONSOLE_POLL_MS = 500;
/** Comme le cœur Rust (`game/console.rs`) : au-delà, les plus anciennes lignes tombent. */
const CONSOLE_MAX_ENTRIES = 10_000;
/** Fin de la sortie montrée par l'écran de plantage. */
const CRASH_LOG_ENTRIES = 40;

const SITE_URL = "https://clovergames.fr";

type Phase = "loading" | "onboarding-accounts" | "onboarding-done" | "signin" | "app";

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
  const [notice, setNotice] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("home");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [modsView, setModsView] = useState<ModsView>("catalogue");

  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [serverIcons, setServerIcons] = useState<Record<string, string>>({});
  const [feed, setFeed] = useState<SiteFeed>({ news: null, modes: null, votes: null });
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [personalMods, setPersonalMods] = useState<PersonalMod[]>([]);

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
  const updateChecked = useRef(false);

  const [maximized, setMaximized] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  const refreshStored = useCallback(async () => setStored(await api.getStored()), []);

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

  // ── Mise à jour du launcher : vérifiée une fois au démarrage, installée d'office si le réglage le demande ──
  const installUpdate = useCallback(async () => {
    setUpdate((current) => current && { ...current, installing: true, ratio: null, error: undefined });
    try {
      await api.installUpdate();
    } catch (reason) {
      setUpdate((current) => current && { ...current, installing: false, error: String(reason) });
    }
  }, []);

  useEffect(() => {
    if (!settings || updateChecked.current) return;
    updateChecked.current = true;
    const autoUpdate = settings.autoUpdate;
    api
      .checkUpdate()
      .then((info) => {
        if (!info) return;
        setUpdate({ info, installing: false, ratio: null });
        if (autoUpdate) installUpdate();
      })
      // CDN injoignable ou aucune version publiée : nouvel essai au prochain démarrage.
      .catch(() => {});
  }, [settings, installUpdate]);

  useEffect(() => {
    const unlisten = listen<{ done: number; total: number | null }>("update-progress", ({ payload }) =>
      setUpdate((current) => current && { ...current, ratio: payload.total ? payload.done / payload.total : null }),
    );
    return () => void unlisten.then((stop) => stop());
  }, []);

  useEffect(() => {
    if (tab === "settings" && settingsTab === "storage") api.storageUsage().then(setStorage).catch(() => {});
  }, [tab, settingsTab]);

  const refreshPersonalMods = useCallback(() => api.personalMods().then(setPersonalMods).catch((reason) => setNotice(String(reason))), []);

  useEffect(() => {
    if (tab === "mods") refreshPersonalMods();
  }, [tab, refreshPersonalMods]);

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
  const startGame = async (start: () => Promise<void>) => {
    setPlay({ kind: "installing" });
    try {
      await start();
      setPlay({ kind: "running" });
    } catch (reason) {
      setPlay({ kind: "ready", error: String(reason) });
    }
  };

  const defaultMods = useMemo(() => (catalogue?.mods ?? []).filter((mod) => mod.default && !mod.hidden && mod.available).map((mod) => mod.id), [catalogue]);
  const enabledIds = settings?.enabledMods ?? defaultMods;
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
    updateSettings({ enabledMods: next });
  };

  // ── Mes mods ──
  const togglePersonalMod = (id: string, enabled: boolean) => {
    setPersonalMods((all) => all.map((mod) => (mod.id === id ? { ...mod, enabled } : mod)));
    api.setPersonalModEnabled(id, enabled).catch((reason) => setNotice(String(reason)));
  };

  /** Ajoute les fichiers un par un : un .jar refusé n'empêche pas les autres d'être ajoutés. */
  const addPersonalMods = async (files: File[]) => {
    const errors: string[] = [];
    for (const file of files) await api.addPersonalMod(file).catch((reason) => errors.push(String(reason)));
    if (errors.length > 0) setNotice(errors.join(" "));
    await refreshPersonalMods();
  };

  const changePersonalMod = (action: Promise<void>) =>
    action.then(refreshPersonalMods).catch((reason) => setNotice(String(reason)));

  const versions: GameVersion[] = catalogue
    ? [
        {
          id: catalogue.minecraft.version,
          loader: `Fabric ${catalogue.fabric.loader}`,
          server: true,
          joinable: true,
          installed: Boolean(system?.java),
          sizeMb: null,
          mods: modInfos.filter((mod) => mod.available).length,
        },
      ]
    : [{ id: "…", loader: "Fabric", server: true, joinable: true, installed: false, sizeMb: null, mods: 0 }];

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

  if (phase !== "app") {
    const onboarding = phase === "onboarding-accounts" || phase === "onboarding-done";
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <TitleBar {...chrome} />
        {phase === "onboarding-done" ? (
          <OnboardingDone
            steps={STEPS}
            accounts={accounts}
            imports={[]}
            machine={{
              summary: system ? `${system.totalMemoryGb} Go de mémoire` : "Configuration détectée au premier lancement",
              memoryGb: settings.memoryAuto ? (system?.autoMemoryGb ?? 4) : settings.memoryGb,
            }}
            crashReports={settings.crashReports}
            onCrashReports={(crashReports) => updateSettings({ crashReports })}
            onBack={() => setPhase("onboarding-accounts")}
            onStart={async () => {
              await api.finishOnboarding();
              await refreshStored();
              setPhase("app");
            }}
          />
        ) : (
          <OnboardingAccounts
            standalone={!onboarding}
            steps={STEPS}
            accounts={accounts}
            login={login}
            onAdd={addAccount}
            onMakeMain={useAccount}
            onRemove={removeAccount}
            onContinue={async () => {
              if (onboarding) return setPhase("onboarding-done");
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
      </div>
    );
  }

  const activeAccount = stored.accounts.find((account) => account.uuid === stored.activeAccount);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <TitleBar
        {...chrome}
        session={profile ? { tab, onTab: setTab } : undefined}
        account={
          profile && (
            <AccountMenu
              profile={profile}
              skin={profile.skin?.url ?? activeAccount?.skinUrl ?? null}
              accounts={accounts}
              onUse={useAccount}
              onRemove={removeAccount}
              onAdd={addAccount}
              onManage={() => (setTab("settings"), setSettingsTab("general"))}
            />
          )
        }
        activity={settings.showVotes && feed.votes ? <VoteTicker votes={feed.votes} onVote={() => open(`${SITE_URL}/vote`)} /> : undefined}
        notifications={<NotificationBell items={[]} onOpen={() => {}} onReadAll={() => {}} />}
      />

      <div className="flex min-h-0 flex-1">
        <SideNav tab={tab} onTab={setTab} />
        <div className="flex min-w-0 flex-1 flex-col">
          {tab === "home" && (
            <HomeScreen
              look={look}
              animateSkin={settings.animatedSkin && settings.animations !== "reduced"}
              enabledMods={modInfos.filter((mod) => mod.enabled && mod.available).map((mod) => mod.name)}
              onManageMods={() => setTab("mods")}
              onOpenConsole={() => setTab("console")}
              play={play}
              onPlay={(mode) => startGame(() => api.play(mode))}
              versions={versions}
              selectedVersion={versions[0].id}
              onSelectVersion={() => {}}
              server={server && { online: server.online, players: server.players }}
              modes={(catalogue?.modes ?? []).map((mode) => ({
                id: mode.id,
                name: mode.name,
                icon: mode.image,
                players: modePlayers(feed, mode.id),
                quickPlay: Boolean(mode.host),
              }))}
              destination="lobby"
              otherServers={otherServers}
              onPlayServer={(address) => startGame(() => api.playServer(address))}
              news={feed.news ?? []}
              onOpenLink={open}
            />
          )}

          {tab === "mods" && (
            <ModsScreen
              view={modsView}
              onView={setModsView}
              mods={modInfos}
              minecraftVersion={catalogue?.minecraft.version ?? ""}
              onToggle={toggleMod}
              personal={personalMods}
              onTogglePersonal={togglePersonalMod}
              onUpdatePersonal={(id) => changePersonalMod(api.updatePersonalMod(id))}
              onRemovePersonal={(id) => changePersonalMod(api.removePersonalMod(id))}
              onAddFiles={(files) => void addPersonalMods(files)}
              modrinth={{ search: api.searchModrinth, onInstall: (project) => api.installModrinthMod(project).then(refreshPersonalMods), project: api.modrinthProject }}
              onOpenLink={open}
            />
          )}

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
              system={{ totalMemoryGb: system?.totalMemoryGb ?? 8, autoMemoryGb: system?.autoMemoryGb ?? 4, java: system?.java ?? null }}
              accounts={accounts}
              onUseAccount={useAccount}
              onRemoveAccount={removeAccount}
              onAddAccount={addAccount}
              onResetRecommended={() => {}}
              storage={{
                parts: (storage?.parts ?? []).filter((part) => part.bytes > 0).map((part) => ({ ...part, color: STORAGE_COLORS[part.id] ?? "#8a8477" })),
                reclaimable: storage?.reclaimable ?? 0,
                gameDir: storage?.gameDir ?? "",
              }}
              onOpenGameDir={() => void api.openGameDir()}
              onChangeGameDir={() => {}}
              onCleanStorage={async () => {
                await api.cleanStorage();
                setStorage(await api.storageUsage());
              }}
              steam={{ state: "absent", onAdd: () => {}, onRemove: () => {} }}
              isStaff={false}
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

      <CrashDialog
        open={crash !== null}
        exitCode={crash?.code ?? null}
        logTail={crash?.log ?? ""}
        onCopyLog={() => void navigator.clipboard.writeText(crash?.log ?? "")}
        onOpenLogs={() => void api.openLogsDir()}
        onRelaunch={() => {
          setCrash(null);
          startGame(() => api.play());
        }}
        onOpenChange={(openDialog) => !openDialog && setCrash(null)}
      />

      <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
        {update && <UpdateToast update={update} onInstall={() => void installUpdate()} onDismiss={() => setUpdate(null)} />}
        {notice && (
          <div role="alert" className="mc-frame flex max-w-[420px] items-start gap-3 bg-card px-4 py-3 text-[13px] shadow-[0_12px_32px_rgb(0_0_0/0.5)]">
            <p className="flex-1 leading-snug">{notice}</p>
            <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
