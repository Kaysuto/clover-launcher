import { FolderInput, FolderOpen, Gamepad2, HardDrive, Info, Palette, Plug, Plus, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { RemoveAccountButton } from "@/components/AccountMenu";
import { DiscordLogo } from "@/components/DiscordLogo";
import { PlayerHead } from "@/components/PlayerHead";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
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
  // Jeu
  memoryAuto: boolean;
  /** Mémoire allouée au jeu, en Go. */
  memoryGb: number;
  fullscreen: boolean;
  /** Ce que devient le launcher quand Minecraft démarre. */
  onLaunch: "keep" | "minimize" | "quit";
  javaArgs: string;
  // Intégrations
  discordPresence: boolean;
  crashReports: boolean;
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
export type SteamState = "absent" | "running" | "ready" | "added";

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

  return (
    <main className="flex min-h-0 flex-1">
      <aside className="flex w-[220px] shrink-0 flex-col gap-4 border-r border-border px-4 pt-8">
        <h1 className="px-2 font-display text-[30px] leading-none">Paramètres</h1>
        <nav aria-label="Paramètres" className="flex flex-col gap-0.5">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => props.onTab(id)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] font-semibold transition-colors",
                tab === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", tab === id && "text-accent")} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-10 pt-8 pb-10">
        <h2 className="mb-2 font-display text-2xl leading-none">{TABS.find((item) => item.id === tab)?.label}</h2>
        <div className="max-w-[780px]">
          {tab === "general" && <General {...props} />}
          {tab === "appearance" && <Appearance settings={settings} onChange={onChange} />}
          {tab === "game" && <Game {...props} />}
          {tab === "storage" && <Storage {...props} />}
          {tab === "integrations" && <Integrations {...props} />}
          {tab === "about" && <About {...props} />}
        </div>
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
        <Toggle id="animated-skin" checked={settings.animatedSkin} onChange={(animatedSkin) => onChange({ animatedSkin })} hint="Ton skin respire et bouge légèrement à côté du bouton Jouer.">
          Skin animé
        </Toggle>
        <Toggle id="show-votes" checked={settings.showVotes} onChange={(showVotes) => onChange({ showVotes })} hint="La pastille « Pseudo a voté pour le serveur » dans la barre du haut.">
          Afficher les derniers votes
        </Toggle>
      </Row>
    </>
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

      <Row title="Au lancement du jeu">
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
        <Toggle id="fullscreen" checked={settings.fullscreen} onChange={(fullscreen) => onChange({ fullscreen })} hint="Minecraft démarre en plein écran. Touche F11 en jeu.">
          Lancer en plein écran
        </Toggle>
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

function Storage({ storage, onOpenGameDir, onImport, onChangeGameDir, onCleanStorage, hidden = [] }: Props) {
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

      <Row title="Libérer de l'espace" hint="Journaux anciens, versions de Minecraft et de Java qui ne servent plus. Tes mondes et tes captures ne sont jamais touchés.">
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
            <button type="button" onClick={onChangeGameDir} className={secondaryButton}>
              Changer…
            </button>
          )}
        </div>
        {!hidden.includes("changeGameDir") && (
          <p className="text-xs text-muted-foreground">Changer de dossier déplace les fichiers : l'opération peut durer plusieurs minutes.</p>
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
  added: "Ajouté. Redémarre Steam pour le voir dans ta bibliothèque.",
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
        <p className={cn("text-sm", steam.state === "added" ? "text-primary" : "text-muted-foreground")} aria-live="polite">
          {STEAM_TEXT[steam.state]}
        </p>
        <div className="flex gap-2">
          {steam.state === "added" ? (
            <button type="button" onClick={steam.onRemove} className={secondaryButton}>
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

      <Row title="Rapports de plantage" hint="Version du launcher, système et message d'erreur. Jamais ton mot de passe ni tes jetons de connexion.">
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
