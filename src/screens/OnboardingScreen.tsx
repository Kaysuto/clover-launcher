import { ArrowRight, Check, Cpu, FolderInput, LoaderCircle, Puzzle, Star, Users } from "lucide-react";
import type { ReactNode } from "react";

import { HeroBackdrop } from "@/components/Backdrop";
import { PlayerHead } from "@/components/PlayerHead";
import { Switch } from "@/components/ui/switch";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { Account } from "@/screens/SettingsScreen";
import type { DetectedInstance, ImportItem, ImportScan } from "@/types";

/** Connexion : un échec s'affiche sous le bouton Microsoft. */
export type LoginState = { kind: "idle" } | { kind: "waiting" } | { kind: "error"; message: string };

/** Premier lancement : trois étapes, dans cet ordre. */
export const ALL_STEPS = ["Comptes", "Importer", "Terminé"] as const;

const number = new Intl.NumberFormat("fr-FR");

/** « 1 autre mod », « 12 autres mods ». */
const plural = (count: number, one: string, many: string) => `${number.format(count)} ${count > 1 ? many : one}`;

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-[18px]" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/**
 * Cadre commun des étapes : fond du site, suivi des étapes, contenu, actions. Sans `step`, le suivi
 * est masqué (écran de connexion seul, quand plus aucun compte n'est enregistré).
 */
export function OnboardingShell({ step, steps = ALL_STEPS, children, footer }: { step?: number; steps?: readonly string[]; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-4">
      <HeroBackdrop />
      <div className="mc-frame relative flex max-h-full w-full max-w-[920px] flex-col bg-card shadow-[0_24px_60px_rgb(0_0_0/0.45)]">
        {step !== undefined && (
        <ol aria-label="Étapes" className="flex items-center gap-3 border-b border-border px-6 py-3">
          {steps.map((label, index) => {
            const done = index < step;
            const current = index === step;
            return (
              <li key={label} aria-current={current ? "step" : undefined} className="flex flex-1 items-center gap-3 last:flex-none">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-[5px] border-2 border-[var(--mc-outline)] text-xs font-bold",
                    done && "bg-primary text-primary-foreground",
                    current && "bg-accent text-accent-foreground",
                    !done && !current && "bg-[var(--mc-slot)] text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : index + 1}
                </span>
                <span className={cn("text-sm font-semibold", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                {index < steps.length - 1 && <span aria-hidden className={cn("h-0.5 flex-1 rounded-full", done ? "bg-primary" : "bg-border")} />}
              </li>
            );
          })}
        </ol>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex items-center justify-between gap-3 rounded-b-[6px] border-t border-border bg-[#17150f] px-6 py-3">{footer}</div>
      </div>
    </main>
  );
}

// ── Étape 1 : comptes ──────────────────────────────────────────────────────────

type AccountsProps = {
  /**
   * Écran de connexion seul, hors premier lancement : quand plus aucun compte n'est enregistré ou
   * que la session a expiré. Pas de suivi d'étapes, « Continuer » ramène à l'accueil.
   */
  standalone?: boolean;
  steps?: readonly string[];
  accounts: Account[];
  login: LoginState;
  onAdd: () => void;
  onMakeMain: (uuid: string) => void;
  onRemove: (uuid: string) => void;
  onContinue: () => void;
};

export function OnboardingAccounts({ standalone = false, steps, accounts, login, onAdd, onMakeMain, onRemove, onContinue }: AccountsProps) {
  const empty = accounts.length === 0;
  return (
    <OnboardingShell
      step={standalone ? undefined : 0}
      steps={steps}
      footer={
        <>
          <p className="text-xs text-muted-foreground">Tu pourras en ajouter ou en retirer plus tard dans les paramètres.</p>
          <button type="button" onClick={onContinue} disabled={empty} className={primaryButton}>
            Continuer
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </>
      }
    >
      <div className="mx-auto flex max-w-[520px] flex-col gap-5">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-display text-[28px] leading-none">{empty ? "Connecte-toi pour jouer" : "Tes comptes Minecraft"}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Ajoute autant de comptes Microsoft que tu veux, chacun doit posséder Minecraft: Java Edition. Tu passeras de l'un à l'autre en un clic. La connexion se fait
            dans ton navigateur&nbsp;: le launcher ne voit jamais ton mot de passe.
          </p>
        </div>

        {!empty && (
          <ul className="flex flex-col gap-2">
            {accounts.map(({ profile, skin, active }) => (
              <li key={profile.uuid} className="flex items-center gap-3 rounded-lg border border-border bg-[#17150f] px-3 py-2.5">
                <PlayerHead skin={skin} size={32} />
                <span className="flex-1 text-sm font-semibold">{profile.name}</span>
                {active ? (
                  <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent">
                    <Star className="size-3" fill="currentColor" aria-hidden />
                    Compte principal
                  </span>
                ) : (
                  <button type="button" onClick={() => onMakeMain(profile.uuid)} className="text-xs font-semibold hover:underline">
                    Définir comme principal
                  </button>
                )}
                <button type="button" onClick={() => onRemove(profile.uuid)} className="text-xs font-semibold text-muted-foreground hover:text-destructive">
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onAdd}
          disabled={login.kind === "waiting"}
          className={cn(
            "mc-bevel flex h-12 w-full items-center justify-center gap-3 text-[15px] font-bold disabled:opacity-70",
            empty ? "bg-foreground text-background" : "bg-secondary text-foreground",
          )}
        >
          <MicrosoftLogo />
          {login.kind === "waiting" ? "Connexion dans ton navigateur…" : empty ? "Se connecter avec Microsoft" : "Ajouter un autre compte"}
        </button>

        <div className="min-h-10" aria-live="polite">
          {login.kind === "waiting" && <p className="text-center text-xs text-muted-foreground">Termine la connexion dans l'onglet qui vient de s'ouvrir, puis reviens ici.</p>}
          {login.kind === "error" && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[13px] leading-snug text-[#f3a19e]">
              {login.message}
            </p>
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}

// ── Étape 2 : importer ─────────────────────────────────────────────────────────

const ITEMS: { id: Exclude<ImportItem, "mods">; label: string; hint: string; count: (instance: DetectedInstance) => number }[] = [
  { id: "options", label: "Réglages et touches", hint: "Commandes, son, affichage, réglages des mods", count: (i) => (i.content.options ? 1 : 0) },
  { id: "servers", label: "Serveurs enregistrés", hint: "Ta liste du menu Multijoueur", count: (i) => i.content.servers },
  { id: "resourcePacks", label: "Packs de ressources", hint: "", count: (i) => i.content.resourcePacks },
  { id: "shaderPacks", label: "Shaders", hint: "Utilisables avec Iris, dans l'onglet Mods", count: (i) => i.content.shaderPacks },
  { id: "screenshots", label: "Captures d'écran", hint: "", count: (i) => i.content.screenshots },
  { id: "worlds", label: "Mondes solo", hint: "Minecraft les convertit à l'ouverture", count: (i) => i.content.worlds },
];

/** Cochés d'office ; les mondes et captures, souvent lourds, sont laissés au choix. */
export const DEFAULT_IMPORT: Record<ImportItem, boolean> = {
  options: true,
  servers: true,
  resourcePacks: true,
  shaderPacks: true,
  mods: true,
  personalMods: true,
  screenshots: false,
  worlds: false,
};

type ImportProps = {
  /** Depuis les paramètres : pas de suivi d'étapes, « Fermer » ramène au launcher. */
  standalone?: boolean;
  /** `null` pendant la recherche. */
  instances: DetectedInstance[] | null;
  /** Avancement de la recherche, animé tant que `instances` est `null`. */
  scan: ImportScan;
  selectedId: string | null;
  onSelect: (id: string) => void;
  choices: Record<ImportItem, boolean>;
  onChoice: (item: ImportItem, value: boolean) => void;
  /** Instance en cours de copie et avancement de 0 à 1. */
  importing: { id: string; ratio: number } | null;
  imported: string[];
  onImport: () => void;
  onBack: () => void;
  onContinue: () => void;
};

export function OnboardingImport(props: ImportProps) {
  const { standalone = false, selectedId, imported, importing } = props;
  const instances = props.instances ?? [];
  const selected = instances.find((instance) => instance.id === selectedId) ?? null;
  const launchers = [...new Set(instances.map((instance) => instance.launcher))];

  return (
    <OnboardingShell
      step={standalone ? undefined : 1}
      footer={
        standalone ? (
          <>
            <p className="text-xs text-muted-foreground">Copié dans l'instance Clover Games.</p>
            <button type="button" onClick={props.onContinue} disabled={importing !== null} className={primaryButton}>
              Fermer
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={props.onBack} disabled={importing !== null} className={secondaryButton}>
              Retour
            </button>
            <button type="button" onClick={props.onContinue} disabled={importing !== null} className={imported.length > 0 ? primaryButton : secondaryButton}>
              {imported.length > 0 ? "Continuer" : "Passer cette étape"}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[26px] leading-none">Reprendre tes réglages</h1>
        <p className="text-sm leading-relaxed text-muted-foreground" aria-live="polite">
          {props.instances === null
            ? "Recherche des autres launchers Minecraft sur cet ordinateur…"
            : instances.length > 0
            ? `${instances.length} installation${instances.length > 1 ? "s" : ""} trouvée${instances.length > 1 ? "s" : ""} sur cet ordinateur. Choisis-en une, puis ce que tu veux reprendre. Tout est copié : les autres launchers ne sont pas modifiés.`
            : `Aucun autre launcher Minecraft trouvé sur cet ordinateur.${standalone ? "" : " Tu peux passer cette étape."}`}
        </p>
      </div>

      {props.instances === null && <ImportSearch scan={props.scan} />}

      {instances.length > 0 && (
        <div className="mt-4 grid grid-cols-[260px_1fr] gap-4">
          <div className="flex flex-col gap-3">
            {launchers.map((launcher, group) => (
              <section
                key={launcher}
                className="flex animate-in flex-col gap-1.5 duration-300 fill-mode-both fade-in-0 slide-in-from-bottom-2"
                style={{ animationDelay: `${group * 70}ms` }}
              >
                <h2 className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{launcher}</h2>
                <ul className="flex flex-col gap-1.5">
                  {instances
                    .filter((instance) => instance.launcher === launcher)
                    .map((instance) => {
                      const active = instance.id === selectedId;
                      const done = imported.includes(instance.id);
                      return (
                        <li key={instance.id}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => props.onSelect(instance.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                              active ? "border-accent bg-accent/10" : "border-border bg-[#17150f] hover:bg-secondary",
                            )}
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-sm font-semibold">{instance.name}</span>
                              <span className="text-[11px] text-muted-foreground">
                                {instance.loader ?? (instance.personalMods.length + instance.otherMods.length > 0 ? "Avec mods" : "Vanilla")}{" "}
                                {instance.minecraft && <span className="font-pixel text-[10px]">{instance.minecraft}</span>}
                              </span>
                            </span>
                            {done && (
                              <span className="flex animate-in items-center gap-1 text-[11px] font-bold text-primary duration-200 zoom-in-50">
                                <Check className="size-3.5" strokeWidth={3} aria-hidden />
                                Importé
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </div>

          <div className="min-w-0 animate-in rounded-lg border border-border bg-[#17150f] p-4 duration-300 fill-mode-both fade-in-0 slide-in-from-bottom-2" style={{ animationDelay: "120ms" }}>
            {selected ? (
              // Changer d'installation remplace le panneau par un fondu.
              <div key={selected.id} className="animate-in duration-200 fade-in-0">
                <ImportDetails {...props} instance={selected} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Choisis une installation à gauche.</p>
            )}
          </div>
        </div>
      )}
    </OnboardingShell>
  );
}

/** Launchers cherchés, dans l'ordre de la recherche ; Prism Launcher et MultiMC partagent une case. */
const SEARCHED: { label: string; launchers: string[] }[] = [
  { label: "Launcher officiel", launchers: ["Launcher officiel"] },
  { label: "Modrinth App", launchers: ["Modrinth App"] },
  { label: "Prism · MultiMC", launchers: ["Prism Launcher", "MultiMC"] },
  { label: "CurseForge", launchers: ["CurseForge"] },
];

/** Barre indéterminée : un bloc avance par crans, comme une barre de chargement du jeu. */
function SweepBar() {
  return (
    <span aria-hidden className="relative block h-2 overflow-hidden rounded-[3px] bg-[var(--mc-slot)] ring-1 ring-[var(--mc-outline)]">
      <span className="absolute inset-y-0 left-0 w-[35%] animate-import-sweep bg-primary shadow-[inset_0_2px_0_rgb(255_255_255/0.25)]" />
    </span>
  );
}

/**
 * Recherche en cours : chaque installation apparaît à gauche dès que le cœur Rust l'annonce, puis la
 * reconnaissance des mods sur Modrinth prend le relais. Tout suit les évènements réels `import-scan`.
 */
function ImportSearch({ scan }: { scan: ImportScan }) {
  const identifying = scan.identifying !== null;
  const launchers = new Set(scan.found.map((entry) => entry.launcher));
  const steps = [
    {
      label: "Lecture des installations",
      detail: scan.found.length > 0 ? plural(scan.found.length, "installation trouvée", "installations trouvées") : "Dossiers des autres launchers",
      state: identifying ? "done" : "active",
    },
    {
      label: "Reconnaissance des mods",
      detail: identifying ? `${plural(scan.identifying!, "mod comparé", "mods comparés")} au catalogue Clover` : "Comparés au catalogue par leur empreinte",
      state: identifying ? "active" : "pending",
    },
  ] as const;

  return (
    <div className="mt-4 grid grid-cols-[260px_1fr] gap-4">
      <ul className="flex flex-col gap-1.5" aria-label="Installations trouvées">
        {scan.found.map((entry, index) => {
          const reading = !identifying && index === scan.found.length - 1;
          return (
            <li
              key={`${entry.launcher}/${entry.name}`}
              className="flex animate-in items-center gap-3 rounded-lg border border-border bg-[#17150f] px-3 py-2 duration-300 fade-in-0 slide-in-from-left-3"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{entry.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {entry.launcher}
                  {entry.mods > 0 && ` · ${plural(entry.mods, "mod", "mods")}`}
                </span>
              </span>
              {reading ? (
                <LoaderCircle className="size-4 shrink-0 animate-spin text-accent" aria-label="Lecture en cours" />
              ) : (
                <Check className="size-4 shrink-0 animate-in text-primary duration-200 zoom-in-50" strokeWidth={3} aria-label="Lu" />
              )}
            </li>
          );
        })}
        {!identifying && (
          <li aria-hidden className="relative h-[50px] overflow-hidden rounded-lg border border-dashed border-border">
            <span className="absolute inset-y-0 left-0 w-[35%] animate-import-sweep bg-linear-to-r from-transparent via-white/6 to-transparent" />
          </li>
        )}
      </ul>

      <div className="relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-lg border border-border bg-[#17150f] p-4">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[30%] animate-import-scanline bg-linear-to-b from-transparent via-primary/8 to-transparent" />

        <ol className="relative grid grid-cols-4 gap-2" aria-label="Launchers cherchés">
          {SEARCHED.map((entry) => {
            const found = entry.launchers.some((launcher) => launchers.has(launcher));
            return (
              <li
                key={entry.label}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-md border-2 px-2 py-2.5 text-center text-[11px] font-semibold transition-[border-color,background-color,opacity] duration-300",
                  found ? "border-primary bg-primary/10 text-foreground" : "border-[var(--mc-outline)] bg-[var(--mc-slot)] text-muted-foreground",
                  identifying && !found && "opacity-45",
                )}
              >
                <span className={cn("grid size-6 place-items-center rounded-[4px]", found ? "bg-primary text-primary-foreground" : "bg-black/30")}>
                  {found ? (
                    <Check className="size-3.5 animate-in duration-200 zoom-in-50" strokeWidth={3} aria-hidden />
                  ) : identifying ? (
                    <span className="text-[10px]" aria-hidden>
                      –
                    </span>
                  ) : (
                    <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" aria-hidden />
                  )}
                </span>
                {entry.label}
                <span className="sr-only">{found ? " : trouvé" : identifying ? " : rien à reprendre" : " : recherche"}</span>
              </li>
            );
          })}
        </ol>

        <ol className="relative flex flex-col gap-3.5">
          {steps.map((step, index) => (
            <li key={step.label} className={cn("flex gap-3 transition-opacity duration-300", step.state === "pending" && "opacity-45")}>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-[5px] border-2 border-[var(--mc-outline)] text-[11px] font-bold transition-colors duration-300",
                  step.state === "done" && "bg-primary text-primary-foreground",
                  step.state === "active" && "bg-accent text-accent-foreground",
                  step.state === "pending" && "bg-[var(--mc-slot)] text-muted-foreground",
                )}
              >
                {step.state === "done" ? <Check className="size-3.5 animate-in duration-200 zoom-in-50" strokeWidth={3} aria-hidden /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-sm font-semibold">{step.label}</span>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  {step.detail}
                </span>
                {step.state === "active" && <SweepBar />}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ImportDetails({ instance, choices, onChoice, importing, imported, onImport }: ImportProps & { instance: DetectedInstance }) {
  const busy = importing?.id === instance.id;
  const done = imported.includes(instance.id);
  const items = ITEMS.filter((item) => item.count(instance) > 0);
  const nothing =
    items.every((item) => !choices[item.id]) &&
    !(instance.catalogueMods.length > 0 && choices.mods) &&
    !(instance.personalMods.length > 0 && choices.personalMods);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-base font-bold">{instance.name}</h2>
          <p className="truncate font-mono text-[11px] text-muted-foreground select-text" title={instance.path}>
            {instance.path}
          </p>
        </div>
        {busy ? (
          <div className="flex w-40 shrink-0 items-center gap-2 pt-1" aria-live="polite">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(importing!.ratio * 100)}%` }} />
            </div>
            <span className="font-pixel text-[12px]">{Math.round(importing!.ratio * 100)} %</span>
          </div>
        ) : done ? (
          <p className="flex shrink-0 items-center gap-1.5 pt-1 text-sm font-semibold text-primary">
            <Check className="size-4" strokeWidth={3} aria-hidden />
            Importé
          </p>
        ) : (
          <button type="button" onClick={onImport} disabled={nothing || importing !== null} className={`${primaryButton} shrink-0`}>
            <FolderInput className="size-4" aria-hidden />
            Importer
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <Switch id={`import-${item.id}`} checked={choices[item.id]} onCheckedChange={(value) => onChoice(item.id, value)} disabled={busy} />
            <label htmlFor={`import-${item.id}`} className="flex flex-1 items-baseline gap-2 text-sm">
              <span className="font-semibold">{item.label}</span>
              {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
            </label>
            {item.id !== "options" && <span className="font-pixel text-[12px] text-muted-foreground">{number.format(item.count(instance))}</span>}
          </li>
        ))}
      </ul>

      {(instance.catalogueMods.length > 0 || instance.personalMods.length > 0 || instance.otherMods.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-border pt-3.5">
          {instance.catalogueMods.length > 0 && (
            <div className="flex items-start gap-3">
              <Switch id="import-mods" checked={choices.mods} onCheckedChange={(value) => onChoice("mods", value)} disabled={busy} className="mt-0.5" />
              <label htmlFor="import-mods" className="flex flex-col gap-0.5 text-sm">
                <span className="font-semibold">
                  Activer {instance.catalogueMods.length} mod{instance.catalogueMods.length > 1 ? "s" : ""} du catalogue Clover
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{instance.catalogueMods.map((mod) => mod.name).join(", ")}</span>
              </label>
            </div>
          )}
          {instance.personalMods.length > 0 && (
            <div className="flex items-start gap-3">
              <Switch id="import-personal" checked={choices.personalMods} onCheckedChange={(value) => onChoice("personalMods", value)} disabled={busy} className="mt-0.5" />
              <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                <label htmlFor="import-personal" className="font-semibold">
                  Copier {plural(instance.personalMods.length, "autre mod", "autres mods")} dans « Mes mods »
                </label>
                <span className="flex items-center gap-1.5 text-xs leading-snug text-muted-foreground">
                  <Puzzle className="size-3.5 shrink-0" aria-hidden />
                  Non vérifiés par Clover Games. Ceux qui ne sont pas faits pour cette version de Minecraft seront signalés.
                </span>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">Voir la liste</summary>
                  <p className="mt-1 max-h-24 overflow-y-auto font-mono text-[11px] leading-relaxed text-muted-foreground select-text">{instance.personalMods.join(", ")}</p>
                </details>
              </div>
            </div>
          )}
          {instance.otherMods.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs leading-snug text-muted-foreground">
                {plural(instance.otherMods.length, "mod non repris", "mods non repris")} : faits pour {instance.loader && instance.loader !== "Fabric" ? instance.loader : "un autre loader que Fabric"}.
              </summary>
              <p className="mt-1.5 max-h-24 overflow-y-auto font-mono text-[11px] leading-relaxed text-muted-foreground select-text">{instance.otherMods.join(", ")}</p>
            </details>
          )}
        </div>
      )}

    </div>
  );
}

// ── Étape 3 : terminé ──────────────────────────────────────────────────────────

type DoneProps = {
  accounts: Account[];
  /** Une ligne par installation importée : « Prism Launcher · PvP 1.21 : réglages, 5 packs… ». */
  imports: string[];
  /** Profil de la machine ; `preset` : réglages recommandés, une fois disponibles (CLO-280). */
  machine: { summary: string; preset?: string; memoryGb: number };
  steps?: readonly string[];
  crashReports: boolean;
  onCrashReports: (value: boolean) => void;
  onBack: () => void;
  onStart: () => void;
};

function SummaryRow({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 border-b border-border py-3 last:border-b-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-accent">{icon}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-sm font-bold">{title}</h2>
        <div className="text-[13px] leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function OnboardingDone({ steps = ALL_STEPS, accounts, imports, machine, crashReports, onCrashReports, onBack, onStart }: DoneProps) {
  const main = accounts.find((account) => account.active) ?? accounts[0];
  return (
    <OnboardingShell
      step={steps.length - 1}
      steps={steps}
      footer={
        <>
          <button type="button" onClick={onBack} className={secondaryButton}>
            Retour
          </button>
          <button type="button" onClick={onStart} className={primaryButton}>
            Commencer
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </>
      }
    >
      <div className="mx-auto flex max-w-[600px] flex-col">
        <h1 className="font-display text-[26px] leading-none">C'est prêt{main ? `, ${main.profile.name}` : ""}&nbsp;!</h1>
        <ul className="mt-2">
          <SummaryRow icon={<Users className="size-[18px]" aria-hidden />} title={`${accounts.length} compte${accounts.length > 1 ? "s" : ""}`}>
            {accounts.map((account) => account.profile.name + (account.active ? " (principal)" : "")).join(", ")}
          </SummaryRow>
          <SummaryRow icon={<FolderInput className="size-[18px]" aria-hidden />} title="Importé">
            {imports.length > 0 ? imports.map((line) => <p key={line}>{line}</p>) : "Rien, tu pars de zéro."}
          </SummaryRow>
          <SummaryRow icon={<Cpu className="size-[18px]" aria-hidden />} title={machine.preset ? `Réglages recommandés : ${machine.preset}` : "Ton ordinateur"}>
            {machine.summary}. <span className="font-pixel text-[12px] text-foreground">{machine.memoryGb}</span> Go de mémoire pour le jeu. Modifiable dans les paramètres.
          </SummaryRow>
        </ul>
        <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-[#17150f] px-4 py-3.5">
          <Switch id="onboarding-crash" checked={crashReports} onCheckedChange={onCrashReports} className="mt-0.5" />
          <label htmlFor="onboarding-crash" className="flex flex-col gap-0.5 text-sm">
            <span className="font-semibold">Envoyer les rapports de plantage à l'équipe Clover Games</span>
            <span className="text-xs leading-snug text-muted-foreground">Version du launcher, système et message d'erreur. Jamais ton mot de passe ni tes jetons de connexion.</span>
          </label>
        </div>
      </div>
    </OnboardingShell>
  );
}
