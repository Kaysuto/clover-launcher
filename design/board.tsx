/**
 * Planche des maquettes (CLO-269) : chaque écran du launcher rendu avec des données d'exemple,
 * sans Tauri. `npm run dev` puis http://localhost:1420/design/board.html ; `?screen=<id>` affiche
 * un seul écran qui remplit le navigateur (captures, essais de redimensionnement).
 *
 * Les icônes des modes sont des textures du jeu extraites en local dans `design/placeholder/`
 * (ignoré par git) ; les vraies viendront du manifeste.
 */
import { StrictMode, type ReactNode, useEffect, useState } from "react";
import { InstancePanel, type InstanceDraft, newInstance } from "@/screens/InstancePanel";
import { InstancesScreen } from "@/screens/InstancesScreen";
import { InstanceDetail } from "@/screens/InstanceDetail";
import type { ContentEntry, ContentFolder, InstanceEntry, ModrinthKind, PlaySession } from "@/types";
import { versionImage } from "@/lib/version-art";
import { createRoot } from "react-dom/client";

import "@/styles.css";
import { AccountMenu } from "@/components/AccountMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { type OtherServer } from "@/components/OtherServers";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SideNav } from "@/components/SideNav";
import { TitleBar } from "@/components/TitleBar";
import { type RecentVote, VoteTicker } from "@/components/VoteTicker";
import { ConsoleScreen } from "@/screens/ConsoleScreen";
import { CrashDialog } from "@/screens/Dialogs";
import { HomeScreen } from "@/screens/HomeScreen";
import { DEFAULT_IMPORT, OnboardingAccounts, OnboardingDone, OnboardingImport } from "@/screens/OnboardingScreen";
import { ModrinthDialog } from "@/screens/ModrinthDialog";
import { ModsScreen, type ModsView, type OpenMod } from "@/screens/ModsScreen";
import { type Account, type Settings, SettingsScreen, type SettingsTab, type SteamState, settingsTabLabel } from "@/screens/SettingsScreen";
import { SkinEditorDialog } from "@/screens/SkinEditorDialog";
import { SkinsScreen } from "@/screens/SkinsScreen";
import { cn } from "@/lib/utils";
import type { Cape, DetectedInstance, ImportItem, LauncherNotification, LogEntry, ModInfo, ModrinthHit, ModrinthPage, ModrinthProject, PersonalMod, ModeStatus, NewsItem, PlayState, Profile, SavedSkin, SkinLook, Tab } from "@/types";

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

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

const notifications: LauncherNotification[] = [
  { id: "n1", kind: "level", source: "game", title: "Niveau 24 atteint", message: "Tu as débloqué le titre « Vétéran » et 500 pièces.", url: null, createdAt: minutesAgo(8), read: false },
  { id: "n2", kind: "purchase", source: "site", title: "Achat confirmé", message: "Grade Émeraude (30 jours) : il est actif sur tous les modes.", url: "https://clovergames.fr/shop", createdAt: minutesAgo(52), read: false },
  { id: "n3", kind: "achievement", source: "game", title: "Succès débloqué", message: "BedWars : « Premier lit détruit ».", url: null, createdAt: minutesAgo(180), read: false },
  { id: "n4", kind: "vote", source: "site", title: "Merci pour ton vote", message: "Récompense du palier 5 envoyée dans ta boîte aux lettres en jeu.", url: "https://clovergames.fr/vote", createdAt: minutesAgo(60 * 20), read: true },
  { id: "n5", kind: "announcement", source: "site", title: "Nouvel article", message: "PvPSoup : le nouveau mode de combat libre.", url: "https://clovergames.fr/blog/pvpsoup-saison-1", createdAt: minutesAgo(60 * 50), read: true },
];

function Notifications({ open }: { open?: boolean }) {
  const [items, setItems] = useState(notifications);
  return (
    <NotificationBell
      items={items}
      defaultOpen={open}
      onOpen={(item) => setItems((all) => all.map((other) => (other.id === item.id ? { ...other, read: true } : other)))}
      onReadAll={() => setItems((all) => all.map((other) => ({ ...other, read: true })))}
    />
  );
}

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

/** Icônes réelles relevées au ping ; la connexion directe n'en a pas (repli sur « lancer »). */
const otherServers: OtherServer[] = [
  { address: "mc.hypixel.net", name: "Hypixel", icon: icon("server-hypixel") },
  { address: "play.pika-network.net", name: "PikaNetwork", icon: icon("server-pika") },
  { address: "92.222.14.8:25570", name: "Serveur Minecraft", icon: null },
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

/** Logos publiés sur Modrinth, comme dans le manifeste (`mods[].icon`). */
const MOD_ICONS: Record<string, string> = {
  sodium: "https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp",
  "ferrite-core": "https://cdn.modrinth.com/data/uXXizFIs/222a126f26f8f9ae1eb339f3b767677f18bff31f_96.webp",
  immediatelyfast: "https://cdn.modrinth.com/data/5ZwdcRci/e57b6b451425692ac17ad322d5e14bea686a383a_96.webp",
  entityculling: "https://cdn.modrinth.com/data/NNAgCjsB/7873452d6cede4daed12da3d7d8c193ab88b4fd6_96.webp",
  moreculling: "https://cdn.modrinth.com/data/51shyZVL/c51b07193b56e952269ef50101d12aecba2b4747_96.webp",
  "dynamic-fps": "https://cdn.modrinth.com/data/LQ3K71Q1/5056368d0d87c1a9f3efead0cb48ab39a4ea87bf_96.webp",
  iris: "https://cdn.modrinth.com/data/YL57xq9U/18d0e7f076d3d6ed5bedd472b853909aac5da202_96.webp",
  continuity: "https://cdn.modrinth.com/data/1IjD5062/icon.png",
  "sodium-extra": "https://cdn.modrinth.com/data/PtjYWJkn/0df4fb22a11e1dcb5e83cb0aadd275b571aca7a9_96.webp",
  "reeses-sodium-options": "https://cdn.modrinth.com/data/Bh37bMuy/icon.png",
  modmenu: "https://cdn.modrinth.com/data/mOgUt4GM/5a20ed1450a0e1e79a1fe04e61bb4e5878bf1d20.png",
  zoomify: "https://cdn.modrinth.com/data/w7ThoJFB/e2de67a0bfb9e8aa2347982ab3ec5463f26cca31_96.webp",
  appleskin: "https://cdn.modrinth.com/data/EsAfCjCV/icon.png",
  "chat-heads": "https://cdn.modrinth.com/data/Wb5oqrBJ/icon.png",
  "mouse-tweaks": "https://cdn.modrinth.com/data/aC3cM3Vq/6c0eaa4e60a9c87f4766f222ff63286f09da32c0_96.webp",
  shulkerboxtooltip: "https://cdn.modrinth.com/data/2M01OLQq/bb490716cf2590cf84100a495931c3d4743bce43_96.webp",
  controlling: "https://cdn.modrinth.com/data/xv94TkTM/bdb6feb3d04ca37da4ed5aa73fef062a39d8b3e5_96.webp",
  "betterf3": "https://cdn.modrinth.com/data/8shC1gFX/icon.png"
};

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
  icon: MOD_ICONS[id as string] ?? null,
  available: version !== null,
  enabled,
})) as ModInfo[];

const crashLog = `[22:41:07] [Render thread/INFO]: Connecting to play.clovergames.fr, 25565
[22:41:09] [Render thread/ERROR]: Failed to create window: GLFW error 65543
[22:41:09] [Render thread/FATAL]: Unreported exception thrown!
java.lang.IllegalStateException: GLFW error before init: [0x10008]WGL: Failed to make context current
	at com.mojang.blaze3d.platform.Window.<init>(Window.java:117)
	at net.minecraft.client.Minecraft.<init>(Minecraft.java:512)`;

/** Sortie d'une partie : quelques milliers de lignes, pour éprouver le défilement et les filtres. */
const consoleSample: LogEntry[] = Array.from({ length: 3000 }, (_, index) => {
  const time = Date.parse("2026-10-03T21:40:00") + index * 120;
  const entry = { id: index + 1, time, thread: "Render thread", throwable: null };
  if (index === 0) return { ...entry, time: null, thread: null, logger: null, level: "warn", message: "WARNING: A restricted method in java.lang.System has been called" };
  if (index % 97 === 0) return { ...entry, level: "error", logger: "net.minecraft.client.Minecraft", message: "Failed to load shader pack", throwable: "java.io.FileNotFoundException: shaderpacks/Complementary.zip\n\tat net.irisshaders.iris.Iris.loadShaderpack(Iris.java:412)" };
  if (index % 11 === 0) return { ...entry, level: "warn", thread: "Worker-Main-8", logger: "net.minecraft.client.resources.model.sprite.MaterialBaker", message: `Missing texture references in model minecraft:default/sword_${index}:\n    particle` };
  return { ...entry, level: "info", logger: "net.minecraft.client.renderer.texture.TextureAtlas", message: `Created: 512x256x0 minecraft:textures/atlas/particles_${index}.png-atlas` };
}) as LogEntry[];

/** Console en direct : une ligne de plus toutes les 400 ms. */
function ConsoleBoard({ live = false }: { live?: boolean }) {
  const [entries, setEntries] = useState(consoleSample);
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(
      () =>
        setEntries((current) => {
          const id = current[current.length - 1].id + 1;
          return [...current, { id, time: Date.now(), level: "info", thread: "Render thread", logger: "net.minecraft.client.gui.components.ChatComponent", message: `[CHAT] Message n°${id}`, throwable: null }];
        }),
      400,
    );
    return () => window.clearInterval(timer);
  }, [live]);
  return (
    <Window tab="console">
      <ConsoleScreen entries={entries} running={live} onClear={() => setEntries([])} onOpenLogs={noop} />
    </Window>
  );
}

/** Écran seul (`?screen=`) : la fenêtre remplit le navigateur, pour tester le redimensionnement. */
const single = new URLSearchParams(location.search).has("screen");

function Accounts({ open }: { open?: boolean }) {
  const [accounts, setAccounts] = useState(twoAccounts);
  const active = accounts.find((account) => account.active) ?? accounts[0];
  const use = (uuid: string) => setAccounts((all) => all.map((account) => ({ ...account, active: account.profile.uuid === uuid })));
  // Plus aucun compte : le vrai launcher repasse sur l'écran de connexion.
  if (!active) return null;
  return (
    <AccountMenu
      profile={active.profile}
      skin={active.skin}
      accounts={accounts}
      defaultOpen={open}
      onUse={use}
      onRemove={(uuid) =>
        setAccounts((all) => {
          const rest = all.filter((account) => account.profile.uuid !== uuid);
          return rest.some((account) => account.active) ? rest : rest.map((account, index) => ({ ...account, active: index === 0 }));
        })
      }
      onAdd={noop}
      onManage={noop}
    />
  );
}

function Window({ children, tab, notificationsOpen, accountsOpen }: { children: ReactNode; tab?: Tab; notificationsOpen?: boolean; accountsOpen?: boolean }) {
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
        session={tab ? { tab, onTab: noop } : undefined}
        account={<Accounts open={accountsOpen} />}
        activity={<VoteTicker votes={votes} onVote={noop} />}
        notifications={<Notifications open={notificationsOpen} />}
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

const sampleInstances: InstanceEntry[] = [
  { id: "clover", name: "Clover Games", kind: "clover", minecraft: "26.2", loader: "0.19.5", separate: false, memoryMb: null, enabledMods: null, disabledMods: [], lastPlayed: 1790700000, gameDir: "~/.cloverlauncher/game", installed: true },
  { id: "instance-00000000000000000000000000000001", name: "Survie entre amis", kind: "fabric", minecraft: "1.21.11", loader: "0.19.5", separate: true, memoryMb: 4096, enabledMods: null, disabledMods: [], lastPlayed: 1790500000, gameDir: "~/.cloverlauncher/instances/survie/game", installed: true },
  { id: "instance-00000000000000000000000000000002", name: "Mon aventure", kind: "vanilla", minecraft: "1.8.9", loader: null, separate: false, memoryMb: null, enabledMods: null, disabledMods: [], lastPlayed: null, gameDir: "~/.cloverlauncher/game", installed: false },
];

function Home({ play, notificationsOpen, accountsOpen, versionOpen, initialInstance = "clover" }: { play: PlayState; notificationsOpen?: boolean; accountsOpen?: boolean; versionOpen?: boolean; initialInstance?: string }) {
  const [selected, setSelected] = useState(initialInstance);
  return (
    <Window tab="home" notificationsOpen={notificationsOpen} accountsOpen={accountsOpen}>
      <HomeScreen
        look={look}
        enabledMods={mods.filter((mod) => mod.enabled && mod.available).map((mod) => mod.name)}
        onManageMods={noop}
        play={play}
        onPlay={noop}
        instances={sampleInstances}
        selectedInstance={selected}
        onSelectInstance={setSelected}
        onCreateInstance={noop}
        onManageInstances={noop}
        versionOpen={versionOpen}
        server={{ online: true, players: 271 }}
        modes={modes}
        destination="lobby"
        otherServers={otherServers}
        onPlayServer={noop}
        news={news}
        onOpenLink={noop}
        onOpenConsole={noop}
      />
    </Window>
  );
}

const personalMods: PersonalMod[] = [
  { id: "litematica", name: "Litematica", icon: null, version: "0.24.1", filename: "litematica-fabric-26.2-0.24.1.jar", source: "Importé de Prism Launcher · PvP 1.21", projectId: "bEpr0Arc", enabled: true, status: { kind: "ok" } },
  { id: "malilib", name: "MaLiLib", icon: null, version: "0.25.2", filename: "malilib-fabric-26.2-0.25.2.jar", source: "Importé de Prism Launcher · PvP 1.21", projectId: "GcWjdA9I", enabled: true, status: { kind: "ok" } },
  { id: "worldedit-cui", name: "WorldEdit CUI", icon: null, version: "1.21.4+01", filename: "WorldEditCUI-1.21.4+01.jar", source: "Importé de Prism Launcher · PvP 1.21", projectId: null, enabled: false, status: { kind: "update", builtFor: "1.21.4", version: "26.2+01" } },
  { id: "replaymod", name: "Replay Mod", icon: null, version: "1.21.4-2.6.20", filename: "replaymod-1.21.4-2.6.20.jar", source: "Importé de Modrinth App · Fabulously Optimized", projectId: "Nv2fQJo5", enabled: false, status: { kind: "outdated", builtFor: "1.21.4" } },
  { id: "jei", name: "Just Enough Items", icon: null, version: "15.20.0", filename: "jei-1.20.1-forge-15.20.0.jar", source: "Importé de CurseForge · Skyblock", projectId: null, enabled: false, status: { kind: "loader", loader: "Forge" } },
  { id: "custom-hud", name: "Custom HUD", icon: null, version: "3.4.2", filename: "customhud-3.4.2+26.2.jar", source: null, projectId: null, enabled: true, status: { kind: "ok" } },
];

const modrinthHits: ModrinthHit[] = [
  { projectId: "1bokaNcj", slug: "xaeros-minimap", title: "Xaero's Minimap", description: "Displays a minimap of the area around you, with waypoints and entity radar.", author: "thexaero", iconUrl: null, downloads: 112807900 },
  { projectId: "NcUtCpym", slug: "xaeros-world-map", title: "Xaero's World Map", description: "Adds a self-writing world map that you can open with a key.", author: "thexaero", iconUrl: null, downloads: 87452000 },
  { projectId: "bEpr0Arc", slug: "litematica", title: "Litematica", description: "A modern client-side schematic mod for Minecraft.", author: "masa", iconUrl: null, downloads: 9800000 },
  { projectId: "w7ThoJFB", slug: "zoomify", title: "Zoomify", description: "A zoom mod with infinite customizability.", author: "isxander", iconUrl: null, downloads: 6200000 },
];

const contentHits: Record<Exclude<ModrinthKind, "mod">, ModrinthHit[]> = {
  resourcepack: [
    { projectId: "rp1", slug: "fresh-animations", title: "Fresh Animations", description: "Des animations plus vivantes pour les créatures, sans changer leur style.", author: "FreshLX", iconUrl: null, downloads: 9100000 },
    { projectId: "rp2", slug: "faithful-32x", title: "Faithful 32x", description: "Les textures de Minecraft, deux fois plus fines.", author: "Faithful", iconUrl: null, downloads: 4200000 },
  ],
  shader: [
    { projectId: "sh1", slug: "complementary-reimagined", title: "Complementary Shaders - Reimagined", description: "Des shaders fidèles au style de Minecraft.", author: "EminGT", iconUrl: null, downloads: 6800000 },
    { projectId: "sh2", slug: "bsl-shaders", title: "BSL Shaders", description: "Éclairage doux et eau réaliste.", author: "capttatsu", iconUrl: null, downloads: 3900000 },
  ],
  datapack: [{ projectId: "dp1", slug: "terralith", title: "Terralith", description: "Une centaine de nouveaux biomes, sans nouveau bloc.", author: "Stardust Labs", iconUrl: null, downloads: 8700000 }],
  modpack: [
    { projectId: "mp1", slug: "fabulously-optimized", title: "Fabulously Optimized", description: "Des performances bien meilleures et de jolis graphismes, prêt à jouer.", author: "robotkoer", iconUrl: null, downloads: 14200000 },
    { projectId: "mp2", slug: "cobblemon", title: "Cobblemon Official Modpack [Fabric]", description: "Le modpack officiel de Cobblemon.", author: "Cobblemon", iconUrl: null, downloads: 2100000 },
  ],
};

async function searchModrinth(kind: ModrinthKind, query: string): Promise<ModrinthPage> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const hits = (kind === "mod" ? modrinthHits : contentHits[kind]).filter((hit) => hit.title.toLowerCase().includes(query.toLowerCase()));
  return { hits, totalHits: hits.length };
}

function ModrinthBoard({ initial = "mod" }: { initial?: ModrinthKind }) {
  const [kind, setKind] = useState<ModrinthKind>(initial);
  return (
    <ModrinthDialog
      open
      onOpenChange={noop}
      minecraftVersion="26.2"
      kinds={["mod", "resourcepack", "shader", "datapack", "modpack"]}
      kind={kind}
      onKind={setKind}
      installed={new Set(["bEpr0Arc"])}
      search={searchModrinth}
      onInstall={() => new Promise(noop)}
      worlds={async () => ["Base de printemps", "Skyblock"]}
    />
  );
}

const sodiumImages = ["d84313e6f57dc9e7896961dbd2dfc2689d482758", "6b0e58705156ba67a6d97a74b9f9ac05da69f502", "b681a9e87daa53a0e85336a894db70427007149b"];
const sodiumTitles = ["Underwater Lighting Improvements", "Biome Blending Improvements", "Fluid Rendering Improvements"];

async function modrinthProject(project: string): Promise<ModrinthProject> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const hit = modrinthHits.find((other) => other.projectId === project || other.slug === project);
  return {
    id: hit?.projectId ?? "AANobbMI",
    slug: hit?.slug ?? project,
    title: hit?.title ?? "Sodium",
    description: hit?.description ?? "A high-performance rendering engine replacement for Minecraft.",
    // Rendu de manifest/descriptions/sodium.md, tel que le launcher l'affiche.
    descriptionHtml: [
      "<p>Sodium remplace le moteur de rendu de Minecraft par un moteur bien plus rapide. Le jeu affiche nettement plus d'images par seconde, et les saccades sont beaucoup plus rares, surtout quand tu te déplaces vite ou que de nouveaux chunks se chargent.</p>",
      "<p>L'apparence du jeu ne change pas. Sodium corrige même plusieurs défauts graphiques du jeu de base, comme l'éclairage sous l'eau, le mélange des couleurs entre biomes ou l'affichage des fluides.</p>",
      "<h3>Bon à savoir</h3>",
      "<ul><li>C'est la base des mods de rendu du catalogue : Iris, Sodium Extra et Reese's Sodium Options en ont besoin.</li><li>Ses réglages remplacent l'écran des options graphiques du jeu.</li><li>Il ne touche pas au gameplay et fonctionne sur tous les modes de Clover Games.</li></ul>",
    ].join(""),
    iconUrl: null,
    author: hit?.author ?? "jellysquid3",
    downloads: hit?.downloads ?? 235228968,
    license: { id: "LicenseRef-Polyform-Shield-1.0.0", name: "" },
    updated: "2026-09-20T21:27:09Z",
    sourceUrl: "https://github.com/CaffeineMC/sodium",
    issuesUrl: "https://github.com/CaffeineMC/sodium/issues",
    wikiUrl: null,
    discordUrl: "https://caffeinemc.net/discord",
    gallery: hit
      ? []
      : sodiumImages.map((image, index) => ({
          url: `https://cdn.modrinth.com/data/AANobbMI/images/${image}_350.webp`,
          rawUrl: `https://cdn.modrinth.com/data/AANobbMI/images/${image}.webp`,
          title: sodiumTitles[index],
        })),
  };
}

function Mods({ view, open }: { view?: ModsView; open?: OpenMod }) {
  return (
    <Window tab="mods">
      <ModsBoard view={view} open={open} />
    </Window>
  );
}

function ModsBoard({ view: initial = "catalogue", open, embedded }: { view?: ModsView; open?: OpenMod; embedded?: boolean }) {
  const [view, setView] = useState<ModsView>(initial);
  const [list, setList] = useState(mods);
  const [personal, setPersonal] = useState(personalMods);
  return (
      <ModsScreen
        embedded={embedded}
        view={view}
        onView={setView}
        mods={list}
        personal={personal}
        minecraftVersion="26.2"
        onToggle={(id, enabled) => setList((all) => all.map((mod) => (mod.id === id ? { ...mod, enabled } : mod)))}
        onTogglePersonal={(id, enabled) => setPersonal((all) => all.map((mod) => (mod.id === id ? { ...mod, enabled } : mod)))}
        onUpdatePersonal={(id) => setPersonal((all) => all.map((mod) => (mod.id === id ? { ...mod, status: { kind: "ok" } } : mod)))}
        onRemovePersonal={(id) => setPersonal((all) => all.filter((mod) => mod.id !== id))}
        onAddFiles={noop}
        onOpenLink={noop}
        defaultOpen={open}
        modrinth={{ project: modrinthProject }}
        onSearch={noop}
      />
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
        onRename={noop}
        onRemove={noop}
        onEdit={() => setOpen(true)}
      />
      <SkinEditorDialog open={open} draft={draft} capes={capes} saving={false} onChange={setDraft} onReplaceTexture={noop} onSave={() => setOpen(false)} onOpenChange={setOpen} />
    </Window>
  );
}

const instances: DetectedInstance[] = [
  {
    id: "official",
    launcher: "Launcher officiel",
    name: "Dernière version",
    minecraft: "26.2",
    loader: null,
    path: "C:\\Users\\kaysu\\AppData\\Roaming\\.minecraft",
    content: { options: true, servers: 12, resourcePacks: 2, shaderPacks: 0, screenshots: 58, worlds: 6 },
    catalogueMods: [],
    personalMods: [],
    otherMods: [],
  },
  {
    id: "modrinth-fo",
    launcher: "Modrinth App",
    name: "Fabulously Optimized",
    minecraft: "26.2",
    loader: "Fabric",
    path: "C:\\Users\\kaysu\\AppData\\Roaming\\ModrinthApp\\profiles\\Fabulously Optimized",
    content: { options: true, servers: 3, resourcePacks: 1, shaderPacks: 4, screenshots: 12, worlds: 1 },
    catalogueMods: [{ id: "sodium", name: "Sodium" }, { id: "ferritecore", name: "FerriteCore" }, { id: "immediatelyfast", name: "ImmediatelyFast" }, { id: "entity-culling", name: "Entity Culling" }, { id: "dynamic-fps", name: "Dynamic FPS" }, { id: "continuity", name: "Continuity" }, { id: "zoomify", name: "Zoomify" }],
    personalMods: Array.from({ length: 38 }, (_, i) => `mod-${i + 1}`),
    otherMods: [],
  },
  {
    id: "prism-pvp",
    launcher: "Prism Launcher",
    name: "PvP 1.21",
    minecraft: "1.21.4",
    loader: "Fabric",
    path: "C:\\Users\\kaysu\\AppData\\Roaming\\PrismLauncher\\instances\\PvP 1.21",
    content: { options: true, servers: 8, resourcePacks: 5, shaderPacks: 2, screenshots: 143, worlds: 3 },
    catalogueMods: [{ id: "sodium", name: "Sodium" }, { id: "iris-shaders", name: "Iris Shaders" }, { id: "mod-menu", name: "Mod Menu" }, { id: "appleskin", name: "AppleSkin" }],
    personalMods: Array.from({ length: 11 }, (_, i) => `mod-${i + 1}`),
    otherMods: [],
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
    personalMods: [],
    otherMods: Array.from({ length: 96 }, (_, i) => `mod-${i + 1}`),
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
        scan={{ found: [], identifying: null }}
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

/** Recherche animée : les installations arrivent une à une, puis la reconnaissance des mods. */
function OnboardingSearchBoard() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % (instances.length + 3)), 1100);
    return () => window.clearInterval(timer);
  }, []);
  const found = instances.slice(0, Math.min(step, instances.length)).map((entry) => ({ launcher: entry.launcher, name: entry.name, mods: entry.personalMods.length + entry.otherMods.length }));
  const identifying = step > instances.length ? found.reduce((sum, entry) => sum + entry.mods, 0) : null;
  return (
    <Window>
      <OnboardingImport
        instances={null}
        scan={{ found, identifying }}
        selectedId={null}
        onSelect={noop}
        choices={DEFAULT_IMPORT}
        onChoice={noop}
        importing={null}
        imported={[]}
        onImport={noop}
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

const GB = 1024 ** 3;

function SettingsBoard({ initial = "general", steam = "ready", from }: { initial?: SettingsTab; steam?: SteamState; from?: string }) {
  const [tab, setTab] = useState<SettingsTab>(initial);
  const [settings, setSettings] = useState<Settings>({
    startWithSystem: false,
    keepInTray: true,
    autoUpdate: true,
    betaChannel: false,
    systemNotifications: true,
    scale: 100,
    animations: "system",
    animatedSkin: true,
    showVotes: true,
    memoryAuto: true,
    memoryGb: 4,
    fullscreen: false,
    onLaunch: "minimize",
    javaArgs: "",
    discordPresence: true,
    crashReports: false,
  });
  const [steamState, setSteamState] = useState<SteamState>(steam);
  return (
    <Window tab="settings">
      {from && <Breadcrumb trail={[from, "Paramètres", settingsTabLabel(tab)]} onBack={noop} />}
      <SettingsScreen
        tab={tab}
        onTab={setTab}
        settings={settings}
        onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        system={{ totalMemoryGb: 16, autoMemoryGb: 4, java: "25.0.1", tray: true }}
        accounts={[
          { profile, skin, active: true },
          { profile: { uuid: "2", name: "Kaysuto_Alt" }, skin, active: false },
        ]}
        onUseAccount={noop}
        onRemoveAccount={noop}
        onAddAccount={noop}
        onResetRecommended={noop}
        storage={{
          parts: [
            { id: "assets", label: "Ressources du jeu", bytes: 0.46 * GB, color: "#52a96c" },
            { id: "java", label: "Java", bytes: 0.1 * GB, color: "#d9a441" },
            { id: "libs", label: "Bibliothèques et Minecraft", bytes: 0.13 * GB, color: "#5aafd6" },
            { id: "mods", label: "Mods", bytes: 0.03 * GB, color: "#a57bc9" },
            { id: "worlds", label: "Mondes solo", bytes: 1.2 * GB, color: "#e08a4d" },
            { id: "shots", label: "Captures d'écran", bytes: 0.35 * GB, color: "#8a8477" },
          ],
          reclaimable: 0.18 * GB,
          gameDir: "C:\\Users\\kaysu\\.cloverlauncher\\game",
        }}
        onOpenGameDir={noop}
        onImport={noop}
        onChangeGameDir={noop}
        onCleanStorage={noop}
        steam={{ state: steamState, onAdd: () => setSteamState("added"), onRemove: () => setSteamState("ready") }}
        isStaff
        about={{ launcher: "0.1.0", minecraft: "26.2", fabric: "0.19.5" }}
        onOpenLink={noop}
      />
    </Window>
  );
}

const boardServices = {
  downloadSize: async (minecraft: string) => (minecraft === "26.2" ? 0 : 825_000_000),
  setContentEnabled: async () => {},
  trashContent: async () => {},
  instanceVersions: async () => ["26.3", "26.2", "26.1.2", "26.1.1", "26.1", "1.21.11", "1.21.10", "1.21.4", "1.21.1", "1.20.6", "1.20.1", "1.19.4", "1.18.2", "1.17.1", "1.16.5", "1.12.2", "1.8.9", "26.4-snapshot-1"].map((id) => ({ id, snapshot: id.includes("snapshot"), released: "" })),
  fabricLoaders: async () => ["0.19.5", "0.19.4"],
  // Une partie un jour sur trois environ, sur quatre mois, plus longue le week-end.
  playHistory: async (instance: string): Promise<PlaySession[]> =>
    Array.from({ length: 120 }, (_, day) => day)
      .filter((day) => (day * 7) % 5 < 2)
      .map((day) => {
        const started = Math.floor(Date.now() / 1000) - day * 86_400 - 3 * 3600;
        const seconds = 1200 + ((day * 2311) % 9000);
        return { instance, started, seconds, code: day % 11 === 3 ? 1 : 0, servers: day % 4 === 0 ? ["play.clovergames.fr", "hypixel.net"] : ["play.clovergames.fr"] };
      })
      .reverse(),
  instanceContent: async (_id: string, folder: ContentFolder): Promise<ContentEntry[]> => {
    const entry = (name: string, size: number, modified: number, more: Partial<ContentEntry> = {}): ContentEntry => ({ name, title: null, icon: null, world: null, enabled: true, size, modified, image: null, ...more });
    return {
      saves: [
        entry("Nouveau monde", 23_600_000, Math.floor(Date.now() / 1000) - 3600, {
          image: versionImage("26.2"),
          level: { name: "Base de printemps", mode: "survival", hardcore: false, difficulty: "normal", commands: false, version: "26.2", lastPlayed: null, datapacks: 2 },
        }),
        entry("Hardcore", 412_000_000, Math.floor(Date.now() / 1000) - 3 * 86_400, {
          image: versionImage("1.21"),
          level: { name: "Hardcore saison 2", mode: "survival", hardcore: true, difficulty: "hard", commands: false, version: "1.21.11", lastPlayed: null, datapacks: 0 },
        }),
        entry("Skyblock", 12_400_000, 1789000000, { level: { name: null, mode: "creative", hardcore: false, difficulty: "peaceful", commands: true, version: "26.2", lastPlayed: null, datapacks: 0 } }),
      ],
      datapacks: [
        entry("Terralith_1.21.5_v2.5.8.zip", 1_200_000, 1790500000, { title: "Terralith", icon: "https://cdn.modrinth.com/data/8oi3bsk5/icon.png", world: "Base de printemps" }),
        entry("mon-datapack", 24_000, 1789500000, { world: "Skyblock", enabled: false }),
      ],
      resourcepacks: [
        entry("Faithful 32x - 1.21.zip", 9_800_000, 1789900000, { title: "Faithful 32x", icon: "https://cdn.modrinth.com/data/7HmAwGJ0/icon.png" }),
        entry("MonPack.zip", 300_000, 1789800000, { enabled: false }),
      ],
      shaderpacks: [entry("ComplementaryReimagined_r5.5.zip", 1_400_000, 1789700000, { title: "Complementary Shaders - Reimagined" })],
      screenshots: ["26.2", "1.21", "1.20", "1.16"].map((id, index) => entry(`2026-10-0${index + 1}_21.14.0${index}.png`, 2_100_000, 1790600000 - index * 86_400, { image: versionImage(id) })),
    }[folder];
  },
};

function InstancesBoard({ creating, expert: initialExpert = false, running = null }: { creating?: boolean; expert?: boolean; running?: string | null }) {
  const [expert, setExpert] = useState(initialExpert);
  const [entries, setEntries] = useState(sampleInstances);
  const [selected, setSelected] = useState("clover");
  const [draft, setDraft] = useState<InstanceDraft | null>(creating ? newInstance() : null);
  return (
    <Window tab="instances">
      <div className="flex min-h-0 flex-1">
      <InstancesScreen
        instances={entries}
        selected={selected}
        expert={expert}
        play={running ? { kind: "running" } : { kind: "ready" }}
        running={running}
        services={boardServices}
        onSelect={setSelected}
        onView={setExpert}
        onPlay={noop}
        onCreate={(minecraft) => setDraft(newInstance(minecraft))}
        onEdit={(entry) => setDraft({ id: entry.id, input: entry })}
        onOpenFolder={noop}
        onRemove={(id) => setEntries((current) => current.filter((entry) => entry.id !== id))}
        mods={<ModsBoard embedded />}
        onSearch={noop}
      />
      {draft && <InstancePanel
        draft={draft}
        services={boardServices}
        onClose={() => setDraft(null)}
        onSave={async (id, input) => {
          const key = id ?? `instance-${crypto.randomUUID().replace(/-/g, "")}`;
          const entry: InstanceEntry = { ...input, id: key, loader: input.kind === "vanilla" ? null : input.loader, enabledMods: null, disabledMods: [], lastPlayed: null, installed: false, gameDir: `~/.cloverlauncher/instances/${key}/game` };
          setEntries((current) => [...current.filter((other) => other.id !== key), entry]);
          setSelected(key);
          setDraft(null);
        }}
      />}
      </div>
    </Window>
  );
}

function InstanceDetailBoard({ running = false, section }: { running?: boolean; section?: "mods" | "resourcepacks" | "datapacks" | "saves" }) {
  return (
    <Window tab="instances">
      <InstanceDetail
        entry={sampleInstances[0]}
        play={running ? { kind: "running" } : { kind: "ready" }}
        running={running}
        services={boardServices}
        onBack={noop}
        onPlay={noop}
        onEdit={noop}
        onOpenFolder={noop}
        mods={<ModsBoard embedded />}
        onSearch={noop}
        defaultSection={section}
      />
    </Window>
  );
}

const SCREENS: Record<string, { label: string; render: () => ReactNode }> = {
  "instance-detail": { label: "Instance — page détaillée", render: () => <InstanceDetailBoard /> },
  "instance-mods": { label: "Instance — onglet Mods", render: () => <InstanceDetailBoard section="mods" /> },
  "instance-worlds": { label: "Instance — onglet Mondes", render: () => <InstanceDetailBoard section="saves" /> },
  "instance-packs": { label: "Instance — packs de ressources", render: () => <InstanceDetailBoard section="resourcepacks" /> },
  "instance-datapacks": { label: "Instance — datapacks", render: () => <InstanceDetailBoard section="datapacks" /> },
  instances: { label: "Instances — Simple", render: () => <InstancesBoard /> },
  "instances-expert": { label: "Instances — Expert", render: () => <InstancesBoard expert /> },
  "instances-running": { label: "Instances — en jeu", render: () => <InstancesBoard expert running="instance-00000000000000000000000000000001" /> },
  "instance-new": { label: "Instances — nouvelle instance", render: () => <InstancesBoard creating /> },
  "onboarding-first": { label: "Premier lancement 1/3 — aucun compte", render: () => <OnboardingAccountsBoard empty /> },
  "onboarding-accounts": { label: "Premier lancement 1/3 — comptes", render: () => <OnboardingAccountsBoard /> },
  "onboarding-error": { label: "Premier lancement 1/3 — compte sans Minecraft", render: () => <OnboardingAccountsBoard error /> },
  signin: { label: "Reconnexion (plus aucun compte)", render: () => <OnboardingAccountsBoard empty standalone /> },
  "onboarding-search": { label: "Premier lancement 2/3 — recherche", render: () => <OnboardingSearchBoard /> },
  "onboarding-import": { label: "Premier lancement 2/3 — importer", render: () => <OnboardingImportBoard /> },
  "onboarding-done": { label: "Premier lancement 3/3 — terminé", render: () => <OnboardingDoneBoard /> },
  home: { label: "Accueil", render: () => <Home play={{ kind: "ready" }} /> },
  notifications: { label: "Accueil — notifications", render: () => <Home play={{ kind: "ready" }} notificationsOpen /> },
  accounts: { label: "Accueil — comptes", render: () => <Home play={{ kind: "ready" }} accountsOpen /> },
  versions: { label: "Accueil — choix de la version", render: () => <Home play={{ kind: "ready" }} versionOpen initialInstance="instance-00000000000000000000000000000001" /> },
  installing: {
    label: "Accueil — installation",
    render: () => <Home play={{ kind: "installing", progress: { phase: "assets", done: 1612, total: 3902 } }} />,
  },
  playing: { label: "Accueil — en jeu", render: () => <Home play={{ kind: "running" }} /> },
  mods: { label: "Mods — catalogue", render: () => <Mods /> },
  "mods-personal": { label: "Mods — mes mods", render: () => <Mods view="personal" /> },
  "mods-page": { label: "Mods — page d'un mod", render: () => <Mods open={{ list: "catalogue", id: "sodium" }} /> },
  "mods-page-personal": { label: "Mods — page d'un mod personnel", render: () => <Mods view="personal" open={{ list: "personal", id: "litematica" }} /> },
  "search-shaders": {
    label: "Recherche — shaders",
    render: () => (
      <>
        <InstanceDetailBoard />
        <ModrinthBoard initial="shader" />
      </>
    ),
  },
  "search-datapacks": {
    label: "Recherche — datapacks",
    render: () => (
      <>
        <InstanceDetailBoard />
        <ModrinthBoard initial="datapack" />
      </>
    ),
  },
  "mods-modrinth": {
    label: "Mods — rechercher un mod",
    render: () => (
      <>
        <Mods view="personal" />
        <ModrinthBoard />
      </>
    ),
  },
  settings: { label: "Paramètres — générales", render: () => <SettingsBoard /> },
  "settings-appearance": { label: "Paramètres — apparence", render: () => <SettingsBoard initial="appearance" /> },
  "settings-game": { label: "Paramètres — jeu", render: () => <SettingsBoard initial="game" /> },
  "settings-from-instances": { label: "Paramètres — depuis les instances", render: () => <SettingsBoard initial="game" from="Instances" /> },
  "settings-storage": { label: "Paramètres — stockage", render: () => <SettingsBoard initial="storage" /> },
  "settings-integrations": { label: "Paramètres — intégrations", render: () => <SettingsBoard initial="integrations" /> },
  "settings-about": { label: "Paramètres — à propos", render: () => <SettingsBoard initial="about" /> },
  skins: { label: "Skins", render: () => <Skins /> },
  "skin-editor": { label: "Skins — modifier", render: () => <Skins editing /> },
  console: { label: "Console — dernière partie", render: () => <ConsoleBoard /> },
  "console-live": { label: "Console — partie en cours", render: () => <ConsoleBoard live /> },
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
          <div className="w-fit">{id === "crash" || id === "skin-editor" || id === "notifications" || id === "versions" ? <a href={`?screen=${id}`}>Ouvrir l'écran</a> : screen.render()}</div>
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
