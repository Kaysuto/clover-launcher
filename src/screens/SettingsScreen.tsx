import { Check, FolderInput, FolderOpen, Gamepad2, HardDrive, Info, Palette, Plug, Plus, RotateCcw, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { RemoveAccountButton } from "@/components/AccountMenu";
import { DiscordLogo } from "@/components/DiscordLogo";
import { PlayerHead } from "@/components/PlayerHead";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ACCENTS, type Accent, accent, HERO_TONES, type HeroTone, heroTone } from "@/lib/appearance";
import { navItem, secondaryButton } from "@/lib/buttons";
import { cn, fold } from "@/lib/utils";
import type { Profile } from "@/types";

export type SettingsTab = "general" | "appearance" | "game" | "storage" | "integrations" | "about";

export type Settings = {
  // Générales
  startWithSystem: boolean;
  /** Fermer la fenêtre la range dans la zone de notification au lieu de quitter. */
  keepInTray: boolean;
  autoUpdate: boolean;
  betaChannel: boolean;
  systemNotifications: boolean;
  // Apparence
  /** Échelle de l'interface, en pourcentage. */
  scale: 90 | 100 | 110 | 125;
  animations: "system" | "reduced";
  animatedSkin: boolean;
  showVotes: boolean;
  /** Clé de `ACCENTS` : boutons, sélections et barres. */
  accent: string;
  /** Clé de `HERO_TONES` : bandeau de l'accueil. */
  hero: string;
  corners: "rounded" | "square";
  // Jeu
  memoryAuto: boolean;
  /** Mémoire allouée au jeu, en Go. */
  memoryGb: number;
  fullscreen: boolean;
  /** Taille de la fenêtre du jeu au lancement, en pixels ; `null` : celle du jeu (854 × 480). */
  resolution: { width: number; height: number } | null;
  /** API graphique de Minecraft 26.2 et plus récent ; `default` laisse le choix fait en jeu. */
  graphicsBackend: "default" | "opengl" | "vulkan";
  /** Ce que devient le launcher quand Minecraft démarre. */
  onLaunch: "keep" | "minimize" | "quit";
  javaArgs: string;
  // Intégrations
  discordPresence: boolean;
  crashReports: boolean;
  // Stockage
  /** Journaux de toutes les instances supprimés au démarrage passé ce nombre de jours ; 0 : jamais. */
  logRetentionDays: number;
  /** Mods du catalogue choisis ; `null` = mods activés par défaut. */
  enabledMods?: string[] | null;
};

/** Réglages dont la fonction n'est pas encore branchée : leur ligne est masquée. */
/** Réglages masqués : fonctions pas encore branchées, ou sans effet dans le paquet du Microsoft Store. */
export type HiddenSetting = "desktopNotifications" | "autoUpdate" | "startWithSystem" | "recommended" | "steam" | "changeGameDir";

export type Account = { profile: Profile; skin: string | null; active: boolean };

/** Une part du dossier du jeu, en octets. */
export type StoragePart = { id: string; label: string; bytes: number; color: string };

/** Steam : `running` = Steam est ouvert, il faut le fermer pour ajouter le raccourci sans le corrompre. */
/** `added` : raccourci écrit, Steam fermé ; `listed` : Steam ouvert, raccourci chargé dans la bibliothèque. */
export type SteamState = "absent" | "running" | "ready" | "added" | "listed";

type Props = {
  hidden?: HiddenSetting[];
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  /** Mémoire totale du poste et valeur automatique, en Go. */
  system: { totalMemoryGb: number; autoMemoryGb: number; java: string | null; tray: boolean };
  accounts: Account[];
  onUseAccount: (uuid: string) => void;
  onRemoveAccount: (uuid: string) => void;
  onAddAccount: () => void;
  onResetRecommended: () => void;
  storage: { parts: StoragePart[]; reclaimable: number; gameDir: string };
  onOpenGameDir: () => void;
  /** Import depuis les autres launchers (mêmes écrans qu'au premier lancement). */
  onImport: () => void;
  onChangeGameDir: () => void;
  /** Déplacement du dossier en cours (0 à 1). */
  moving?: number | null;
  onCleanStorage: () => void;
  steam: { state: SteamState; onAdd: () => void; onRemove: () => void };
  isStaff: boolean;
  about: { launcher: string; minecraft: string; fabric: string };
  onOpenLink: (url: string) => void;
};

const TABS: { id: SettingsTab; label: string; Icon: LucideIcon }[] = [
  { id: "general", label: "Générales", Icon: SlidersHorizontal },
  { id: "appearance", label: "Apparence", Icon: Palette },
  { id: "game", label: "Jeu", Icon: Gamepad2 },
  { id: "storage", label: "Stockage", Icon: HardDrive },
  { id: "integrations", label: "Intégrations", Icon: Plug },
  { id: "about", label: "À propos", Icon: Info },
];

export const settingsTabLabel = (id: SettingsTab) => TABS.find((item) => item.id === id)?.label ?? "";

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const built = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(__BUILD_TIME__));

/** 1 610 612 736 → « 1,5 Go ». */
export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${number.format(bytes / 1024 ** 3)} Go`;
  if (bytes >= 1024 ** 2) return `${number.format(bytes / 1024 ** 2)} Mo`;
  return `${number.format(bytes / 1024)} Ko`;
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[210px_1fr] gap-8 border-b border-border py-6 first:pt-2 last:border-b-0">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-bold">{title}</h2>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  );
}

function Toggle({ id, checked, onChange, children, hint }: { id: string; checked: boolean; onChange: (value: boolean) => void; children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <label htmlFor={id} className="flex flex-col gap-0.5 text-sm">
        <span>{children}</span>
        {hint && <span className="text-xs leading-snug text-muted-foreground">{hint}</span>}
      </label>
    </div>
  );
}

/** Choix exclusif à quelques valeurs, en boutons collés comme un sélecteur de mode du jeu. */
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 self-start rounded-lg border border-border bg-[#100e0b] p-1">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors", value === option.value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen(props: Props) {
  const { tab, settings, onChange } = props;
  const [query, setQuery] = useState("");
  const needle = fold(query.trim());
  const results = useRef<HTMLDivElement>(null);
  const pages: Record<SettingsTab, ReactNode> = {
    general: <General {...props} />,
    appearance: <Appearance settings={settings} onChange={onChange} />,
    game: <Game {...props} />,
    storage: <Storage {...props} />,
    integrations: <Integrations {...props} />,
    about: <About {...props} />,
  };

  // Recherche : tous les onglets sont rendus, puis chaque ligne dont aucun texte (titre, aide, options)
  // ne contient la recherche est masquée, sauf si le nom de l'onglet correspond. Sans dépendances :
  // les textes changent avec les props (stockage, comptes, Steam).
  useLayoutEffect(() => {
    const root = results.current;
    if (!root) return;
    let found = 0;
    for (const group of root.querySelectorAll<HTMLElement>("[data-label]")) {
      const whole = fold(group.dataset.label ?? "").includes(needle);
      let rows = 0;
      for (const row of group.querySelectorAll<HTMLElement>("section")) {
        row.hidden = !whole && !fold(row.textContent ?? "").includes(needle);
        if (!row.hidden) rows += 1;
      }
      group.hidden = rows === 0;
      found += rows;
    }
    const empty = root.querySelector<HTMLElement>("[data-empty]");
    if (empty) empty.hidden = found > 0;
  });

  return (
    <main className="flex min-h-0 flex-1">
      <aside className="flex w-[220px] shrink-0 flex-col gap-4 border-r border-border px-4 pt-8">
        <h1 className="px-2 font-display text-[30px] leading-none">Paramètres</h1>
        <label className="relative block">
          <span className="sr-only">Rechercher un réglage</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher…"
            className="h-9 w-full rounded-md border border-border bg-[#100e0b] pr-2 pl-8 text-[13px] text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
          />
        </label>
        <nav aria-label="Paramètres" className="flex flex-col gap-0.5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={!needle && tab === id ? "page" : undefined}
              onClick={() => {
                setQuery("");
                props.onTab(id);
              }}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors", navItem(!needle && tab === id))}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-10 pt-8 pb-10">
        {needle ? (
          <div key="search" ref={results} className="flex max-w-[780px] flex-col gap-8">
            {TABS.map(({ id, label }) => (
              <div key={id} data-label={label}>
                <h2 className="mb-2 font-display text-2xl leading-none">{label}</h2>
                {/* Les lignes masquées comptent pour `first:` et `last:` : on vise la première et la dernière visibles. */}
                <div className="[&>section:not(:has(~section:not([hidden])))]:border-b-0 [&>section:not(section:not([hidden])~section)]:pt-2">{pages[id]}</div>
              </div>
            ))}
            <p data-empty className="text-sm text-muted-foreground">
              Aucun réglage ne correspond à « {query.trim()} ».
            </p>
          </div>
        ) : (
          <>
            <h2 className="mb-2 font-display text-2xl leading-none">{TABS.find((item) => item.id === tab)?.label}</h2>
            <div className="max-w-[780px]">{pages[tab]}</div>
          </>
        )}
      </div>
    </main>
  );
}

function General({ settings, onChange, system, accounts, onUseAccount, onRemoveAccount, onAddAccount, isStaff, hidden = [] }: Props) {
  return (
    <>
      <Row title="Comptes" hint="Chaque compte Microsoft doit posséder Minecraft: Java Edition.">
        <ul className="flex flex-col gap-2">
          {accounts.map(({ profile, skin, active }) => (
            <li key={profile.uuid} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <PlayerHead skin={skin} size={28} />
              <span className="flex-1 text-sm font-semibold">{profile.name}</span>
              {active ? (
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">Compte actif</span>
              ) : (
                <button type="button" onClick={() => onUseAccount(profile.uuid)} className="text-xs font-semibold text-foreground hover:underline">
                  Utiliser
                </button>
              )}
              <RemoveAccountButton name={profile.name} onClick={() => onRemoveAccount(profile.uuid)} />
            </li>
          ))}
        </ul>
        <button type="button" onClick={onAddAccount} className={`${secondaryButton} self-start`}>
          <Plus className="size-4" aria-hidden />
          Ajouter un compte
        </button>
      </Row>

      <Row title="Démarrage et fermeture" hint="Le launcher reste disponible pour les notifications et les mises à jour, sans fenêtre ouverte.">
        {!hidden.includes("startWithSystem") && (
          <Toggle id="start-with-system" checked={settings.startWithSystem} onChange={(startWithSystem) => onChange({ startWithSystem })} hint="Réduit dans la zone de notification.">
            Démarrer avec l'ordinateur
          </Toggle>
        )}
        {system.tray ? (
          <Toggle id="keep-in-tray" checked={settings.keepInTray} onChange={(keepInTray) => onChange({ keepInTray })} hint="« Quitter » se trouve dans le menu de l'icône.">
            Rester dans la zone de notification à la fermeture
          </Toggle>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Ton bureau n'affiche pas d'icône de zone de notification (GNOME sans l'extension AppIndicator) : fermer la fenêtre quitte le launcher.
          </p>
        )}
      </Row>

      {!hidden.includes("desktopNotifications") && (
      <Row title="Notifications" hint="Achats, niveau gagné, succès, annonces.">
        <Toggle id="system-notifications" checked={settings.systemNotifications} onChange={(systemNotifications) => onChange({ systemNotifications })} hint="Une bulle du système apparaît quand la fenêtre est fermée ou réduite.">
          Afficher les notifications sur le bureau
        </Toggle>
      </Row>
      )}

      <Row title="Mises à jour" hint="Le launcher, Minecraft, Fabric et les mods suivent le serveur.">
        {hidden.includes("autoUpdate") ? (
          <p className="text-sm text-muted-foreground">Le Microsoft Store met à jour le launcher. Minecraft, Fabric et les mods se mettent à jour à chaque lancement.</p>
        ) : (
        <Toggle id="auto-update" checked={settings.autoUpdate} onChange={(autoUpdate) => onChange({ autoUpdate })} hint="Vérifiées et installées au démarrage du launcher. Sinon, la mise à jour t'est proposée.">
          Mettre à jour le launcher automatiquement
        </Toggle>
        )}
        {isStaff && (
          <Toggle id="beta" checked={settings.betaChannel} onChange={(betaChannel) => onChange({ betaChannel })} hint="Versions de test du launcher et du jeu, avant les joueurs. De retour sur le canal normal, la version de test reste jusqu'à la prochaine version publique.">
            Canal bêta
          </Toggle>
        )}
      </Row>
    </>
  );
}

function Appearance({ settings, onChange }: Pick<Props, "settings" | "onChange">) {
  return (
    <>
      <Row title="Taille de l'interface" hint="Agrandit ou réduit les textes et les boutons du launcher.">
        <Segmented
          label="Taille de l'interface"
          value={settings.scale}
          options={[
            { value: 90, label: "90 %" },
            { value: 100, label: "100 %" },
            { value: 110, label: "110 %" },
            { value: 125, label: "125 %" },
          ]}
          onChange={(scale) => onChange({ scale })}
        />
      </Row>

      <Row title="Couleur principale" hint="Boutons, sélections, barres de progression et cases d'activité.">
        <div role="radiogroup" aria-label="Couleur principale" className="flex flex-wrap gap-2">
          {(Object.keys(ACCENTS) as Accent[]).map((id) => {
            const checked = accent(settings.accent) === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onChange({ accent: id })}
                className={cn(
                  "flex items-center gap-2 rounded-lg border bg-[#100e0b] py-1.5 pr-3 pl-1.5 text-[13px] font-semibold transition-colors",
                  checked ? "border-[#e9e3d4]/60 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="grid size-6 place-items-center rounded-md" style={{ background: ACCENTS[id].color }}>
                  {checked && <Check className="size-3.5 text-[#14120f]" aria-hidden />}
                </span>
                {ACCENTS[id].label}
              </button>
            );
          })}
        </div>
      </Row>

      <Row title="Bandeau de l'accueil" hint="Teinte du bandeau derrière ton skin, comme sur le site.">
        <div role="radiogroup" aria-label="Bandeau de l'accueil" className="grid grid-cols-4 gap-2">
          {(Object.keys(HERO_TONES) as HeroTone[]).map((id) => {
            const checked = heroTone(settings.hero) === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onChange({ hero: id })}
                className={cn("group flex flex-col gap-1.5 rounded-lg border p-1.5 text-left transition-colors", checked ? "border-[#e9e3d4]/60" : "border-border hover:border-[#4a4237]")}
              >
                <span className={cn("relative h-12 overflow-hidden rounded-md bg-linear-to-br", HERO_TONES[id].bg)}>
                  <span className={cn("absolute -top-4 left-1/2 size-12 -translate-x-1/2 rounded-full blur-xl", HERO_TONES[id].glow)} />
                  {checked && <Check className="absolute top-1.5 right-1.5 size-3.5 text-white" aria-hidden />}
                </span>
                <span className={cn("px-0.5 text-xs font-semibold", checked ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{HERO_TONES[id].label}</span>
              </button>
            );
          })}
        </div>
      </Row>

      <Row title="Coins" hint="« Carrés » donne aux cartes et aux boutons des angles plus francs, façon Minecraft.">
        <Segmented
          label="Coins"
          value={settings.corners}
          options={[
            { value: "rounded", label: "Arrondis" },
            { value: "square", label: "Carrés" },
          ]}
          onChange={(corners) => onChange({ corners })}
        />
      </Row>

      <Row title="Animations" hint="« Réduites » fige les effets de défilement, de fondu et le skin animé.">
        <Segmented
          label="Animations"
          value={settings.animations}
          options={[
            { value: "system", label: "Comme le système" },
            { value: "reduced", label: "Réduites" },
          ]}
          onChange={(animations) => onChange({ animations })}
        />
      </Row>

      <Row title="Accueil">
        <Toggle id="animated-skin" checked={settings.animatedSkin} onChange={(animatedSkin) => onChange({ animatedSkin })} hint="Ton personnage respire, s'impatiente puis se fatigue quand tu ne touches plus au launcher.">
          Skin animé
        </Toggle>
        <Toggle id="show-votes" checked={settings.showVotes} onChange={(showVotes) => onChange({ showVotes })} hint="La pastille « Pseudo a voté pour le serveur » dans la barre du haut.">
          Afficher les derniers votes
        </Toggle>
      </Row>
    </>
  );
}

/** Taille du jeu sans réglage, et bornes acceptées par le launcher (`lib.rs`). */
const GAME_WINDOW = { width: 854, height: 480 };
const WINDOW_MIN = { width: 320, height: 240 };
const WINDOW_MAX = 16384;

/** Largeur × hauteur de la fenêtre du jeu ; champs vides = taille du jeu. */
function WindowSize({ value, onChange }: { value: Settings["resolution"]; onChange: (value: Settings["resolution"]) => void }) {
  const type = (key: "width" | "height", text: string) => onChange({ ...(value ?? GAME_WINDOW), [key]: Number(text.replace(/\D/g, "").slice(0, 5)) });
  // Valeur hors bornes ramenée à la plus proche en quittant le champ ; champ vidé : taille du jeu.
  const settle = () => {
    if (!value) return;
    if (!value.width && !value.height) return onChange(null);
    const fit = (key: "width" | "height") => (value[key] ? Math.min(WINDOW_MAX, Math.max(WINDOW_MIN[key], value[key])) : GAME_WINDOW[key]);
    onChange({ width: fit("width"), height: fit("height") });
  };
  // Pixels réels de l'écran, quelle que soit la mise à l'échelle de Windows.
  const screenSize = () => onChange({ width: Math.round(window.screen.width * window.devicePixelRatio), height: Math.round(window.screen.height * window.devicePixelRatio) });
  const field = "h-9 w-20 rounded-md border border-border bg-[#100e0b] px-2 text-center font-pixel text-[13px] text-foreground outline-none select-text placeholder:text-muted-foreground/60 focus:border-accent";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input inputMode="numeric" aria-label="Largeur de la fenêtre" value={value?.width || ""} placeholder={String(GAME_WINDOW.width)} onChange={(event) => type("width", event.target.value)} onBlur={settle} className={field} />
      <span aria-hidden className="text-sm text-muted-foreground">
        ×
      </span>
      <input inputMode="numeric" aria-label="Hauteur de la fenêtre" value={value?.height || ""} placeholder={String(GAME_WINDOW.height)} onChange={(event) => type("height", event.target.value)} onBlur={settle} className={field} />
      <button type="button" onClick={screenSize} className={cn(secondaryButton, "ml-1")}>
        Taille de l'écran
      </button>
      <button type="button" onClick={() => onChange(null)} disabled={!value} aria-label="Taille du jeu" title="Taille du jeu (854 × 480)" className={cn(secondaryButton, "w-9 px-0")}>
        <RotateCcw className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function Game({ settings, onChange, system, onResetRecommended, hidden = [] }: Props) {
  const memory = settings.memoryAuto ? system.autoMemoryGb : settings.memoryGb;
  return (
    <>
      <Row title="Mémoire allouée" hint={`Ton ordinateur a ${system.totalMemoryGb} Go de mémoire. Trop en donner au jeu ralentit le reste du système.`}>
        <div className="flex items-center gap-3">
          <Switch id="memory-auto" checked={settings.memoryAuto} onCheckedChange={(memoryAuto) => onChange({ memoryAuto })} />
          <label htmlFor="memory-auto" className="text-sm">
            Automatique
          </label>
          <span className="ml-auto font-pixel text-[15px]">{memory} Go</span>
        </div>
        <Slider
          aria-label="Mémoire allouée"
          min={2}
          max={Math.max(4, system.totalMemoryGb - 2)}
          step={1}
          value={[memory]}
          disabled={settings.memoryAuto}
          onValueChange={([memoryGb]) => onChange({ memoryGb })}
        />
      </Row>

      <Row title="Au lancement du jeu" hint="Ce que devient le launcher quand Minecraft démarre.">
        <Segmented
          label="Au lancement du jeu"
          value={settings.onLaunch}
          options={[
            { value: "keep", label: "Laisser ouvert" },
            { value: "minimize", label: "Réduire" },
            { value: "quit", label: "Fermer" },
          ]}
          onChange={(onLaunch) => onChange({ onLaunch })}
        />
      </Row>

      <Row title="Fenêtre du jeu" hint="Taille en pixels à l'ouverture de Minecraft. Vide : celle du jeu, 854 × 480.">
        <WindowSize value={settings.resolution} onChange={(resolution) => onChange({ resolution })} />
        <Toggle id="fullscreen" checked={settings.fullscreen} onChange={(fullscreen) => onChange({ fullscreen })} hint="Remplace le réglage du jeu. Désactivé, ton choix en jeu est gardé. Touche F11 en jeu.">
          Lancer en plein écran
        </Toggle>
      </Row>

      <Row title="API graphique" hint="Minecraft 26.2 et plus récent ; les versions plus anciennes restent sur OpenGL. « Choix du jeu » garde le réglage fait dans Minecraft.">
        <Segmented
          label="API graphique"
          value={settings.graphicsBackend}
          options={[
            { value: "default", label: "Choix du jeu" },
            { value: "opengl", label: "OpenGL" },
            { value: "vulkan", label: "Vulkan" },
          ]}
          onChange={(graphicsBackend) => onChange({ graphicsBackend })}
        />
        <p className="text-xs text-muted-foreground">Vulkan est expérimental : si le jeu plante au démarrage, choisis OpenGL.</p>
      </Row>

      {!hidden.includes("recommended") && (
      <Row title="Réglages recommandés" hint="Distance d'affichage, graphismes et mods de performance choisis pour ta machine.">
        <button type="button" onClick={onResetRecommended} className={`${secondaryButton} self-start`}>
          <RotateCcw className="size-4" aria-hidden />
          Rétablir les réglages recommandés
        </button>
        <p className="text-xs text-muted-foreground">Tes réglages actuels sont remplacés. Ton skin, tes serveurs et tes mondes ne changent pas.</p>
      </Row>
      )}

      <Row title="Avancé" hint="À ne modifier que si l'équipe te le demande.">
        <p className="text-sm text-muted-foreground">
          {system.java ? (
            <>
              Java <span className="font-pixel text-[12px] text-foreground">{system.java}</span>, installé et mis à jour par le launcher.
            </>
          ) : (
            "Java sera installé par le launcher au premier lancement du jeu."
          )}
        </p>
        <label className="flex flex-col gap-2 text-xs font-semibold text-muted-foreground">
          Arguments Java
          <input
            value={settings.javaArgs}
            onChange={(event) => onChange({ javaArgs: event.target.value })}
            placeholder="Aucun"
            spellCheck={false}
            className="h-9 rounded-md border border-border bg-[#100e0b] px-3 font-mono text-xs text-foreground select-text"
          />
        </label>
      </Row>
    </>
  );
}

const RETENTION = [
  { value: 7, label: "7 jours" },
  { value: 14, label: "14 jours" },
  { value: 30, label: "30 jours" },
  { value: 90, label: "90 jours" },
  { value: 0, label: "Toujours" },
];

function Storage({ settings, onChange, storage, onOpenGameDir, onImport, onChangeGameDir, onCleanStorage, moving = null, hidden = [] }: Props) {
  const total = storage.parts.reduce((sum, part) => sum + part.bytes, 0);
  return (
    <>
      <Row title="Espace utilisé" hint="Tout ce que le launcher garde sur ton disque.">
        <p className="font-display text-3xl leading-none">{formatBytes(total)}</p>
        <div role="img" aria-label={storage.parts.map((part) => `${part.label} ${formatBytes(part.bytes)}`).join(", ")} className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {storage.parts.map((part) => (
            <span key={part.id} style={{ width: `${(part.bytes / total) * 100}%`, background: part.color }} className="min-w-1" />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {storage.parts.map((part) => (
            <li key={part.id} className="flex items-center gap-2 text-sm">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: part.color }} />
              <span className="flex-1">{part.label}</span>
              <span className="font-pixel text-[12px] text-muted-foreground">{formatBytes(part.bytes)}</span>
            </li>
          ))}
        </ul>
      </Row>

      <Row title="Garder les journaux" hint="Journaux et rapports de plantage de toutes les instances. Passé ce délai, ils sont supprimés au démarrage du launcher. Chaque instance peut aussi vider les siens dans ses paramètres.">
        <Segmented label="Durée de conservation des journaux" value={settings.logRetentionDays} options={RETENTION} onChange={(logRetentionDays) => onChange({ logRetentionDays })} />
      </Row>

      <Row title="Libérer de l'espace" hint="Journaux plus anciens que le délai choisi, versions de Minecraft et de Java qui ne servent plus. Tes mondes et tes captures ne sont jamais touchés.">
        <button type="button" onClick={onCleanStorage} disabled={storage.reclaimable === 0} className={`${secondaryButton} self-start`}>
          <Trash2 className="size-4" aria-hidden />
          {storage.reclaimable > 0 ? `Nettoyer (${formatBytes(storage.reclaimable)})` : "Rien à nettoyer"}
        </button>
      </Row>

      <Row title="Dossier du jeu" hint="Mondes, captures d'écran, options et journaux. Séparé de ton dossier .minecraft.">
        <p className="truncate rounded-md border border-border bg-[#100e0b] px-3 py-2 font-mono text-xs select-text">{storage.gameDir}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onOpenGameDir} className={secondaryButton}>
            <FolderOpen className="size-4" aria-hidden />
            Ouvrir le dossier
          </button>
          {!hidden.includes("changeGameDir") && (
            <button type="button" onClick={onChangeGameDir} disabled={moving !== null} className={secondaryButton}>
              Changer…
            </button>
          )}
        </div>
        {!hidden.includes("changeGameDir") && (
          moving !== null ? (
            <div className="flex items-center gap-3" aria-live="polite">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(moving * 100)}%` }} />
              </div>
              <span className="font-pixel text-[12px]">{Math.round(moving * 100)} %</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Tout le dossier est déplacé (jeu, mondes, instances, réglages), puis le launcher redémarre. Pas dans un dossier synchronisé (OneDrive…). En cas d'échec, rien ne change.
            </p>
          )
        )}
      </Row>
      <Row title="Autres launchers" hint="Launcher officiel, Modrinth App, Prism Launcher, MultiMC, CurseForge. Leurs fichiers sont copiés, jamais déplacés.">
        <button type="button" onClick={onImport} className={`${secondaryButton} self-start`}>
          <FolderInput className="size-4" aria-hidden />
          Importer des réglages, serveurs ou mondes…
        </button>
      </Row>
    </>
  );
}

const STEAM_TEXT: Record<SteamState, string> = {
  absent: "Steam n'est pas installé sur cet ordinateur.",
  running: "Steam est ouvert. Ferme-le pour ajouter le raccourci sans risque, puis reviens ici.",
  ready: "Steam est prêt. Le Clover Launcher apparaîtra dans ta bibliothèque, avec son logo.",
  added: "Ajouté : Clover Games apparaîtra dans ta bibliothèque à la prochaine ouverture de Steam.",
  listed: "Clover Games est dans ta bibliothèque Steam. Pour le retirer, ferme d'abord Steam.",
};

function Integrations({ settings, onChange, steam, hidden = [] }: Props) {
  return (
    <>
      <Row title="Discord" hint="Tes amis Discord voient que tu joues à Clover Games, depuis quand, et peuvent rejoindre le serveur Discord.">
        <Toggle id="discord-presence" checked={settings.discordPresence} onChange={(discordPresence) => onChange({ discordPresence })} hint="Statut « Joue à Clover Games » avec la durée de la partie.">
          Afficher mon activité sur Discord
        </Toggle>
      </Row>

      {!hidden.includes("steam") && (
      <Row title="Steam" hint="Lance Clover Games depuis ta bibliothèque Steam, ou depuis le mode Big Picture et la Steam Deck.">
        <p className={cn("text-sm", steam.state === "added" || steam.state === "listed" ? "text-primary" : "text-muted-foreground")} aria-live="polite">
          {STEAM_TEXT[steam.state]}
        </p>
        <div className="flex gap-2">
          {steam.state === "added" || steam.state === "listed" ? (
            <button type="button" onClick={steam.onRemove} disabled={steam.state === "listed"} className={secondaryButton}>
              Retirer de Steam
            </button>
          ) : (
            <button type="button" onClick={steam.onAdd} disabled={steam.state !== "ready"} className={secondaryButton}>
              <Gamepad2 className="size-4" aria-hidden />
              Ajouter à Steam
            </button>
          )}
        </div>
      </Row>
      )}

      <Row title="Rapports de plantage" hint="Version du launcher, système, message d'erreur et dernières actions dans le launcher. Jamais ton mot de passe, tes jetons de connexion ni ton nom d'utilisateur.">
        <Toggle id="crash-reports" checked={settings.crashReports} onChange={(crashReports) => onChange({ crashReports })}>
          Envoyer les rapports à l'équipe Clover Games
        </Toggle>
      </Row>
    </>
  );
}

function About({ about, onOpenLink }: Pick<Props, "about" | "onOpenLink">) {
  return (
    <>
      <Row title="Versions">
        <p className="text-sm text-muted-foreground">
          Clover Launcher <span className="font-pixel text-[12px] text-foreground">{about.launcher}</span> · Minecraft{" "}
          <span className="font-pixel text-[12px] text-foreground">{about.minecraft}</span> · Fabric <span className="font-pixel text-[12px] text-foreground">{about.fabric}</span>
        </p>
        <p className="text-xs text-muted-foreground">Compilé le {built}</p>
      </Row>
      <Row title="Aide" hint="Une question, un plantage, une suggestion.">
        <div className="flex flex-wrap gap-2">
          {/* Bleu Discord, comme sur le site (`DISCORD_BLOCK_CLASSES`). */}
          <button type="button" onClick={() => onOpenLink("https://discord.gg/theclovergames")} className="mc-bevel flex h-9 items-center justify-center gap-2 whitespace-nowrap bg-[#5865F2] px-4 text-[13px] font-bold text-white">
            <DiscordLogo className="size-4" />
            Rejoindre le Discord
          </button>
          <button type="button" onClick={() => onOpenLink("https://clovergames.fr")} className={secondaryButton}>
            clovergames.fr
          </button>
        </div>
      </Row>
    </>
  );
}
