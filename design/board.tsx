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
import { SideNav } from "@/components/SideNav";
import { TitleBar } from "@/components/TitleBar";
import { type RecentVote, VoteTicker } from "@/components/VoteTicker";
import { CrashDialog } from "@/screens/Dialogs";
import { HomeScreen } from "@/screens/HomeScreen";
import { DEFAULT_IMPORT, OnboardingAccounts, OnboardingDone, OnboardingImport } from "@/screens/OnboardingScreen";
import { ModsScreen } from "@/screens/ModsScreen";
import { type Account, type Settings, SettingsScreen } from "@/screens/SettingsScreen";
import { SkinEditorDialog } from "@/screens/SkinEditorDialog";
import { SkinsScreen } from "@/screens/SkinsScreen";
import { cn } from "@/lib/utils";
import type { Cape, DetectedInstance, ImportItem, ModInfo, ModeStatus, NewsItem, PlayState, Profile, SavedSkin, SkinLook, Tab } from "@/types";

const icon = (name: string) => new URL(`./placeholder/${name}.png`, import.meta.url).href;
const skin = new URL("./placeholder/skin.png", import.meta.url).href;
/** Seule cape du compte de démonstration : la liste de l'éditeur vient de `minecraft/profile`. */
const capes: Cape[] = [{ id: "own", name: "Cape du compte", texture: new URL("./placeholder/cape.png", import.meta.url).href }];
const look: SkinLook = { texture: skin, model: "slim", cape: capes[0] };

const DEFAULT_NAMES = ["steve", "alex", "ari", "efe", "kai", "makena", "noor", "sunny", "zuri"];
const defaultSkins: SavedSkin[] = DEFAULT_NAMES.map((name, index) => ({
  id: `default-${name}`,
  name: name[0].toUpperCase() + name.slice(1),
  texture: new URL(`./placeholder/defaults/${name}-${index % 2 === 0 ? "wide" : "slim"}.png`, import.meta.url).href,
  model: index % 2 === 0 ? "classic" : "slim",
}));
const savedSkins: SavedSkin[] = [{ id: "mine", name: "Kaysuto", texture: skin, model: "slim" }];

const noop = () => {};

const votes: RecentVote[] = [
  { player: "TournePain6", votedAt: "2026-09-29T21:10:00Z" },
  { player: "Zarma78", votedAt: "2026-09-29T21:04:00Z" },
  { player: "Tarakiwi", votedAt: "2026-09-29T20:58:00Z" },
];

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
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-background",
        single ? "h-full w-full" : "h-[680px] w-[1100px]",
        !maximized && "rounded-[14px] ring-1 ring-white/10",
      )}
    >
      <TitleBar
        session={tab ? { profile, skin, tab, onTab: noop, onAccount: noop } : undefined}
        activity={<VoteTicker votes={votes} onVote={noop} />}
        maximized={maximized}
        onMinimize={noop}
        onToggleMaximize={() => setMaximized((value) => !value)}
        onClose={noop}
      />
      {tab ? (
        <div className="flex min-h-0 flex-1">
          <SideNav tab={tab} onTab={noop} />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Home({ play }: { play: PlayState }) {
  return (
    <Window tab="home">
      <HomeScreen
        look={look}
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

function Skins({ editing = false }: { editing?: boolean }) {
  const [activeId, setActiveId] = useState<string | null>("mine");
  const [draft, setDraft] = useState<SkinLook>(look);
  const [open, setOpen] = useState(editing);
  const current = [...savedSkins, ...defaultSkins].find((item) => item.id === activeId);
  return (
    <Window tab="skins">
      <SkinsScreen
        playerName={profile.name}
        look={current ? { texture: current.texture, model: current.model, cape: look.cape } : look}
        saved={savedSkins}
        defaults={defaultSkins}
        activeId={activeId}
        onSelect={(item) => setActiveId(item.id)}
        onAddFile={noop}
        onEdit={() => setOpen(true)}
      />
      <SkinEditorDialog open={open} draft={draft} capes={capes} saving={false} onChange={setDraft} onReplaceTexture={noop} onSave={() => setOpen(false)} onOpenChange={setOpen} />
    </Window>
  );
}

const instances: DetectedInstance[] = [
  {
    id: "official",
    launcher: "Launcher Minecraft officiel",
    name: "Dernière version",
    minecraft: "26.2",
    loader: null,
    path: "C:\\Users\\kaysu\\AppData\\Roaming\\.minecraft",
    content: { options: true, servers: 12, resourcePacks: 2, shaderPacks: 0, screenshots: 58, worlds: 6 },
    catalogueMods: [],
    otherMods: 0,
  },
  {
    id: "modrinth-fo",
    launcher: "Modrinth App",
    name: "Fabulously Optimized",
    minecraft: "26.2",
    loader: "Fabric",
    path: "C:\\Users\\kaysu\\AppData\\Roaming\\ModrinthApp\\profiles\\Fabulously Optimized",
    content: { options: true, servers: 3, resourcePacks: 1, shaderPacks: 4, screenshots: 12, worlds: 1 },
    catalogueMods: ["Sodium", "FerriteCore", "ImmediatelyFast", "Entity Culling", "Dynamic FPS", "Continuity", "Zoomify"],
    otherMods: 38,
  },
  {
    id: "prism-pvp",
    launcher: "Prism Launcher",
    name: "PvP 1.21",
    minecraft: "1.21.4",
    loader: "Fabric",
    path: "C:\\Users\\kaysu\\AppData\\Roaming\\PrismLauncher\\instances\\PvP 1.21",
    content: { options: true, servers: 8, resourcePacks: 5, shaderPacks: 2, screenshots: 143, worlds: 3 },
    catalogueMods: ["Sodium", "Iris Shaders", "Mod Menu", "AppleSkin"],
    otherMods: 11,
  },
  {
    id: "curseforge-sky",
    launcher: "CurseForge",
    name: "Skyblock",
    minecraft: "1.20.1",
    loader: "Forge",
    path: "C:\\Users\\kaysu\\curseforge\\minecraft\\Instances\\Skyblock",
    content: { options: true, servers: 2, resourcePacks: 0, shaderPacks: 0, screenshots: 4, worlds: 2 },
    catalogueMods: [],
    otherMods: 96,
  },
];

const twoAccounts: Account[] = [
  { profile, skin, active: true },
  { profile: { uuid: "2", name: "Kaysuto_Alt" }, skin: new URL("./placeholder/defaults/alex-slim.png", import.meta.url).href, active: false },
];

function OnboardingAccountsBoard({ empty, error, standalone }: { empty?: boolean; error?: boolean; standalone?: boolean }) {
  return (
    <Window>
      <OnboardingAccounts
        standalone={standalone}
        accounts={empty ? [] : twoAccounts}
        login={error ? { kind: "error", message: "Ce compte Microsoft ne possède pas Minecraft: Java Edition." } : { kind: "idle" }}
        onAdd={noop}
        onMakeMain={noop}
        onRemove={noop}
        onContinue={noop}
      />
    </Window>
  );
}

function OnboardingImportBoard() {
  const [selectedId, setSelectedId] = useState<string | null>("prism-pvp");
  const [choices, setChoices] = useState<Record<ImportItem, boolean>>(DEFAULT_IMPORT);
  const [imported, setImported] = useState<string[]>(["official"]);
  return (
    <Window>
      <OnboardingImport
        instances={instances}
        selectedId={selectedId}
        onSelect={setSelectedId}
        choices={choices}
        onChoice={(item, value) => setChoices((current) => ({ ...current, [item]: value }))}
        importing={null}
        imported={imported}
        onImport={() => selectedId && setImported((current) => [...current, selectedId])}
        onBack={noop}
        onContinue={noop}
      />
    </Window>
  );
}

function OnboardingDoneBoard() {
  const [crashReports, setCrashReports] = useState(false);
  return (
    <Window>
      <OnboardingDone
        accounts={twoAccounts}
        imports={[
          "Launcher Minecraft officiel · Dernière version : réglages et touches, 12 serveurs, 2 packs de ressources.",
          "Prism Launcher · PvP 1.21 : réglages et touches, 8 serveurs, 5 packs de ressources, 2 shaders, 4 mods activés.",
        ]}
        machine={{ summary: "16 Go de mémoire, NVIDIA GeForce RTX 3060", preset: "Élevés", memoryGb: 4 }}
        crashReports={crashReports}
        onCrashReports={setCrashReports}
        onBack={noop}
        onStart={noop}
      />
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
  "onboarding-first": { label: "Premier lancement 1/3 — aucun compte", render: () => <OnboardingAccountsBoard empty /> },
  "onboarding-accounts": { label: "Premier lancement 1/3 — comptes", render: () => <OnboardingAccountsBoard /> },
  "onboarding-error": { label: "Premier lancement 1/3 — compte sans Minecraft", render: () => <OnboardingAccountsBoard error /> },
  signin: { label: "Reconnexion (plus aucun compte)", render: () => <OnboardingAccountsBoard empty standalone /> },
  "onboarding-import": { label: "Premier lancement 2/3 — importer", render: () => <OnboardingImportBoard /> },
  "onboarding-done": { label: "Premier lancement 3/3 — terminé", render: () => <OnboardingDoneBoard /> },
  home: { label: "Accueil", render: () => <Home play={{ kind: "ready" }} /> },
  installing: {
    label: "Accueil — installation",
    render: () => <Home play={{ kind: "installing", progress: { phase: "assets", done: 1612, total: 3902 } }} />,
  },
  mods: { label: "Mods", render: () => <Mods /> },
  settings: { label: "Paramètres", render: () => <SettingsBoard /> },
  skins: { label: "Skins", render: () => <Skins /> },
  "skin-editor": { label: "Skins — modifier", render: () => <Skins editing /> },
  crash: {
    label: "Plantage du jeu",
    render: () => (
      <>
        <Home play={{ kind: "ready" }} />
        <CrashDialog open exitCode={1} logTail={crashLog} onCopyLog={noop} onOpenLogs={noop} onRelaunch={noop} onOpenChange={noop} />
      </>
    ),
  },
};

function Board() {
  const only = new URLSearchParams(location.search).get("screen");
  // Écran seul : posé sur un « bureau » gris, pour voir les coins arrondis de la fenêtre.
  if (only && SCREENS[only]) return <div className="h-screen w-screen bg-[#3a3d42] p-3">{SCREENS[only].render()}</div>;
  return (
    <div className="flex flex-col gap-10 bg-[#0a0907] p-10">
      {Object.entries(SCREENS).map(([id, screen]) => (
        <figure key={id} className="flex flex-col gap-3">
          <figcaption className="text-sm text-muted-foreground">
            <a href={`?screen=${id}`} className="font-semibold text-foreground hover:underline">
              {screen.label}
            </a>
          </figcaption>
          <div className="w-fit">{id === "crash" || id === "skin-editor" ? <a href={`?screen=${id}`}>Ouvrir l'écran</a> : screen.render()}</div>
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
