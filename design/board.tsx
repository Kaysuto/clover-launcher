/**
 * Planche des maquettes (CLO-269) : chaque écran du launcher rendu avec des données d'exemple,
 * sans Tauri. `npm run dev` puis http://localhost:1420/design/board.html ; `?screen=<id>` affiche
 * un seul écran qui remplit le navigateur (captures, essais de redimensionnement).
 *
 * Les icônes des modes sont des textures du jeu extraites en local dans `design/placeholder/`
 * (ignoré par git) ; les vraies viendront du manifeste.
 */
import { StrictMode, type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";

import "@/styles.css";
import { TitleBar } from "@/components/TitleBar";
import { CrashDialog, CrashReportConsentDialog } from "@/screens/Dialogs";
import { HomeScreen } from "@/screens/HomeScreen";
import { LoginScreen, type LoginState } from "@/screens/LoginScreen";
import { ModsScreen } from "@/screens/ModsScreen";
import { type Settings, SettingsScreen } from "@/screens/SettingsScreen";
import type { ModInfo, ModeStatus, NewsItem, PlayState, Profile, Tab } from "@/types";

const icon = (name: string) => new URL(`./placeholder/${name}.png`, import.meta.url).href;
const skin = new URL("./placeholder/skin.png", import.meta.url).href;
const noop = () => {};

const profile: Profile = { uuid: "6b4d8d4f-8fda-498f-b402-e2cfbbf6d144", name: "Kaysuto" };

const modes: ModeStatus[] = [
  { id: "lobby", name: "Lobby", icon: icon("compass_00"), players: 38 },
  { id: "bedwars", name: "BedWars", icon: icon("red_wool"), players: 124 },
  { id: "practice", name: "Practice", icon: icon("diamond_sword"), players: 57 },
  { id: "pvpsoup", name: "PvPSoup", icon: icon("mushroom_stew"), players: 23 },
  { id: "skypvp", name: "SkyPvP", icon: icon("diamond_chestplate"), players: null },
  { id: "creatif", name: "Créatif", icon: icon("bricks"), players: 29 },
];

const news: NewsItem[] = [
  {
    title: "PvPSoup : le nouveau mode de combat libre",
    excerpt: "Soupes, kits et arène ouverte : tout ce qu'il faut savoir avant ta première partie.",
    image: null,
    url: "https://clovergames.fr/blog/pvpsoup-saison-1",
    publishedAt: "2026-09-20",
  },
  {
    title: "Clover Games passe en Minecraft 26.2",
    excerpt: "Ce que ça change pour vous, et pourquoi un client plus ancien ne pourra plus se connecter.",
    image: "https://clovergames.fr/api/uploads/b63633ba-24f1-41a5-9690-096501875113",
    url: "https://clovergames.fr/blog/minecraft-26-2",
    publishedAt: "2026-09-12",
  },
  {
    title: "Voter pour Clover Games : gratuit, et ça rapporte",
    excerpt: "Vingt-et-un paliers de récompenses, une vote party collective et un classement mensuel.",
    image: "https://clovergames.fr/api/uploads/18614fd7-86e6-4864-9d14-fe4f81643dc6",
    url: "https://clovergames.fr/blog/voter-pour-clover-games",
    publishedAt: "2026-09-04",
  },
  {
    title: "Le wiki fait sa refonte",
    excerpt: "L'ancien wiki annonçait beaucoup de pages et contenait peu de réponses.",
    image: "https://clovergames.fr/api/uploads/6de13a3a-2f72-435a-8411-54fe46a9a6dc",
    url: "https://clovergames.fr/blog/wiki",
    publishedAt: "2026-08-27",
  },
];

const mods: ModInfo[] = [
  ["sodium", "Sodium", "performance", "Moteur de rendu optimisé : beaucoup plus d'images par seconde.", "mc26.2-0.9.2-fabric", true],
  ["ferrite-core", "FerriteCore", "performance", "Réduit la mémoire utilisée par le jeu.", "9.0.0-fabric", true],
  ["immediatelyfast", "ImmediatelyFast", "performance", "Accélère l'affichage de l'interface, du texte et des entités.", "1.16.5+26.2-fabric", true],
  ["entityculling", "Entity Culling", "performance", "Ignore les entités cachées derrière des blocs.", "1.11.2", true],
  ["moreculling", "More Culling", "performance", "Ignore les faces de blocs que tu ne peux pas voir.", "1.8.1", true],
  ["dynamic-fps", "Dynamic FPS", "performance", "Réduit les images par seconde quand le jeu est en arrière-plan.", "3.11.9", true],
  ["iris", "Iris Shaders", "visual", "Shaders : éclairage et ombres réalistes.", "1.11.4+26.2-fabric", false],
  ["continuity", "Continuity", "visual", "Textures connectées pour les packs qui les utilisent.", "3.0.1+26.2", false],
  ["sodium-extra", "Sodium Extra", "visual", "Réglages graphiques supplémentaires pour Sodium.", "mc26.2-0.9.4+fabric", false],
  ["reeses-sodium-options", "Reese's Sodium Options", "visual", "Menu des options graphiques plus lisible.", "mc26.2-2.2.4+fabric", false],
  ["modmenu", "Mod Menu", "comfort", "Liste des mods installés et accès à leurs réglages.", "20.0.3", true],
  ["zoomify", "Zoomify", "comfort", "Zoom sur une touche.", "2.16.3+26.2", false],
  ["appleskin", "AppleSkin", "comfort", "Affiche la saturation et la valeur nutritive de la nourriture.", "3.0.10+mc26.2", false],
  ["chat-heads", "Chat Heads", "comfort", "Tête du joueur à côté de ses messages dans le chat.", "1.3.0", false],
  ["mouse-tweaks", "Mouse Tweaks", "comfort", "Range l'inventaire plus vite à la souris.", "26.2-2.31-fabric", false],
  ["shulkerboxtooltip", "Shulker Box Tooltip", "comfort", "Aperçu du contenu des boîtes de Shulker au survol.", "5.4.1+26.2-fabric", false],
  ["controlling", "Controlling", "comfort", "Recherche dans le réglage des touches.", "26.2.4", false],
  ["betterf3", "BetterF3", "comfort", "Écran de débogage (F3) plus lisible.", null, false],
].map(([id, name, category, description, version, enabled]) => ({
  id,
  name,
  category,
  description,
  version,
  available: version !== null,
  enabled,
})) as ModInfo[];

const crashLog = `[22:41:07] [Render thread/INFO]: Connecting to play.clovergames.fr, 25565
[22:41:09] [Render thread/ERROR]: Failed to create window: GLFW error 65543
[22:41:09] [Render thread/FATAL]: Unreported exception thrown!
java.lang.IllegalStateException: GLFW error before init: [0x10008]WGL: Failed to make context current
	at com.mojang.blaze3d.platform.Window.<init>(Window.java:117)
	at net.minecraft.client.Minecraft.<init>(Minecraft.java:512)`;

/** Écran seul (`?screen=`) : la fenêtre remplit le navigateur, pour tester le redimensionnement. */
const single = new URLSearchParams(location.search).has("screen");

function Window({ children, tab }: { children: ReactNode; tab?: Tab }) {
  const [maximized, setMaximized] = useState(false);
  return (
    <div className={single ? "flex h-screen w-screen flex-col overflow-hidden bg-background" : "flex h-[680px] w-[1100px] flex-col overflow-hidden bg-background"}>
      <TitleBar
        session={tab ? { profile, skin, tab, onTab: noop, onAccount: noop } : undefined}
        maximized={maximized}
        onMinimize={noop}
        onToggleMaximize={() => setMaximized((value) => !value)}
        onClose={noop}
      />
      {children}
    </div>
  );
}

function Home({ play }: { play: PlayState }) {
  return (
    <Window tab="home">
      <HomeScreen
        skin={skin}
        enabledMods={mods.filter((mod) => mod.enabled && mod.available).map((mod) => mod.name)}
        onManageMods={noop}
        play={play} onPlay={noop} minecraftVersion="26.2" modes={modes} destination="lobby" news={news} onOpenLink={noop} />
    </Window>
  );
}

function Mods() {
  const [list, setList] = useState(mods);
  return (
    <Window tab="mods">
      <ModsScreen mods={list} minecraftVersion="26.2" onToggle={(id, enabled) => setList((all) => all.map((mod) => (mod.id === id ? { ...mod, enabled } : mod)))} />
    </Window>
  );
}

function SettingsBoard() {
  const [settings, setSettings] = useState<Settings>({
    memoryAuto: true,
    memoryGb: 4,
    gameDir: "C:\\Users\\kaysu\\.cloverlauncher\\game",
    javaArgs: "",
    betaChannel: false,
    crashReports: true,
  });
  return (
    <Window tab="settings">
      <SettingsScreen
        settings={settings}
        onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        system={{ totalMemoryGb: 16, autoMemoryGb: 4 }}
        accounts={[
          { profile, skin, active: true },
          { profile: { uuid: "2", name: "Kaysuto_Alt" }, skin, active: false },
        ]}
        onUseAccount={noop}
        onRemoveAccount={noop}
        onAddAccount={noop}
        onOpenGameDir={noop}
        onChangeGameDir={noop}
        isStaff
        about={{ launcher: "0.1.0", minecraft: "26.2", fabric: "0.19.5" }}
      />
    </Window>
  );
}

const SCREENS: Record<string, { label: string; render: () => ReactNode }> = {
  login: { label: "Connexion", render: () => <Window><LoginScreen state={{ kind: "idle" }} onLogin={noop} onOpenLink={noop} /></Window> },
  "login-error": {
    label: "Connexion — erreur",
    render: () => {
      const state: LoginState = { kind: "error", message: "Ce compte Microsoft ne possède pas Minecraft: Java Edition." };
      return <Window><LoginScreen state={state} onLogin={noop} onOpenLink={noop} /></Window>;
    },
  },
  home: { label: "Accueil", render: () => <Home play={{ kind: "ready" }} /> },
  installing: {
    label: "Accueil — installation",
    render: () => <Home play={{ kind: "installing", progress: { phase: "assets", done: 1612, total: 3902 } }} />,
  },
  mods: { label: "Mods", render: () => <Mods /> },
  settings: { label: "Paramètres", render: () => <SettingsBoard /> },
  crash: {
    label: "Plantage du jeu",
    render: () => (
      <>
        <Home play={{ kind: "ready" }} />
        <CrashDialog open exitCode={1} logTail={crashLog} onCopyLog={noop} onOpenLogs={noop} onRelaunch={noop} onOpenChange={noop} />
      </>
    ),
  },
  consent: {
    label: "Premier lancement — rapports de plantage",
    render: () => (
      <>
        <Home play={{ kind: "ready" }} />
        <CrashReportConsentDialog open onAnswer={noop} />
      </>
    ),
  },
};

function Board() {
  const only = new URLSearchParams(location.search).get("screen");
  if (only && SCREENS[only]) return <>{SCREENS[only].render()}</>;
  return (
    <div className="flex flex-col gap-10 bg-[#0a0907] p-10">
      {Object.entries(SCREENS).map(([id, screen]) => (
        <figure key={id} className="flex flex-col gap-3">
          <figcaption className="text-sm text-muted-foreground">
            <a href={`?screen=${id}`} className="font-semibold text-foreground hover:underline">
              {screen.label}
            </a>
          </figcaption>
          <div className="w-fit ring-1 ring-border">{id === "crash" || id === "consent" ? <a href={`?screen=${id}`}>Ouvrir l'écran</a> : screen.render()}</div>
        </figure>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Board />
  </StrictMode>,
);
