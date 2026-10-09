import { Check, ChevronRight, PackageOpen, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { groupVersions, versionFamily } from "@/lib/game-versions";
import { KINDS, instanceSummary, ownLoader } from "@/lib/instances";
import { cn } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import type { AvailableVersion, InstanceEntry, InstanceInput, InstanceKind } from "@/types";

export type InstanceDraft = { id: string | null; input: InstanceInput };
type Services = Pick<typeof api, "instanceVersions" | "instanceLoaders" | "downloadSize">;

const megabytes = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
/** « 825 Mo », « 1,2 Go ». */
function formatDownload(bytes: number): string {
  return bytes >= 1e9 ? `${megabytes.format(bytes / 1e9)} Go` : `${Math.max(1, Math.round(bytes / 1e6))} Mo`;
}

const MEMORY = [2, 3, 4, 6, 8, 12, 16];
const KIND_ORDER = Object.keys(KINDS) as InstanceKind[];

export const newInstance = (minecraft: string | null = null): InstanceDraft => ({
  id: null,
  input: { name: "", kind: "vanilla", minecraft, loader: null, separate: false, memoryMb: null },
});

/** Instances déjà là pour la version du brouillon : en choisir une ferme le panneau. */
type Existing = { instances: InstanceEntry[]; selected: string; onSelect: (id: string) => void };

/**
 * Création ou modification d'une instance personnelle, en panneau à droite de l'écran Instances :
 * la liste reste visible et utilisable. Type, version, puis le reste est facultatif. En création,
 * les instances déjà faites pour cette version passent en tête.
 */
export function InstancePanel({
  draft,
  onClose,
  onSave,
  existing,
  serverVersion,
  onImportModpack,
  services = api,
}: {
  draft: InstanceDraft;
  onClose: () => void;
  /** Rejette avec le message à afficher. */
  onSave: (id: string | null, input: InstanceInput) => Promise<void>;
  existing?: Existing;
  /** Version de Minecraft du serveur (manifeste) : le type Clover n'existe que pour elle. */
  serverVersion?: string | null;
  /** En création : partir d'un modpack (recherche Modrinth ou fichier) plutôt que d'une instance vide. */
  onImportModpack?: () => void;
  services?: Services;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && !event.defaultPrevented && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <aside aria-labelledby="instance-panel-title" className="flex w-[380px] shrink-0 flex-col border-l border-border bg-card animate-in slide-in-from-right-8 fade-in duration-200">
      {/* `key` : une autre instance repart d'un formulaire neuf ; une autre version garde les choix faits. */}
      <Form key={draft.id ?? "new"} draft={draft} onClose={onClose} onSave={onSave} existing={draft.id ? undefined : existing} serverVersion={serverVersion ?? null} onImportModpack={draft.id ? undefined : onImportModpack} services={services} />
    </aside>
  );
}

/**
 * Illustration de la version en fondu enchaîné : la nouvelle apparaît par-dessus l'ancienne en se
 * posant (léger zoom), puis l'ancienne est retirée. Sans animation (mouvements réduits), la
 * nouvelle recouvre simplement l'ancienne.
 */
function VersionArt({ version }: { version: string | null }) {
  const src = version ? versionImage(version) : null;
  const [layers, setLayers] = useState<{ key: number; src: string }[]>([]);
  const counter = useRef(0);
  useEffect(() => {
    if (src) setLayers((current) => (current[current.length - 1]?.src === src ? current : [...current.slice(-1), { key: counter.current++, src }]));
  }, [src]);
  return layers.map((layer) => (
    <img
      key={layer.key}
      src={layer.src}
      alt=""
      onAnimationEnd={() => setLayers((current) => current.filter((other) => other.key >= layer.key))}
      className="absolute inset-0 size-full object-cover motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-105 motion-safe:duration-500 motion-safe:ease-out"
    />
  ));
}

function Form({ draft, onClose, onSave, existing, serverVersion, onImportModpack, services }: { draft: InstanceDraft; onClose: () => void; onSave: (id: string | null, input: InstanceInput) => Promise<void>; existing?: Existing; serverVersion: string | null; onImportModpack?: () => void; services: Services }) {
  const [input, setInput] = useState(draft.input);
  // Autre carte cliquée, panneau ouvert : le formulaire passe à cette version sans être recréé.
  useEffect(() => {
    const minecraft = draft.input.minecraft;
    if (minecraft) setInput((current) => ({ ...current, minecraft }));
  }, [draft.input.minecraft]);
  const [versions, setVersions] = useState<AvailableVersion[]>([]);
  const [snapshots, setSnapshots] = useState(false);
  const [loaders, setLoaders] = useState<{ kind: InstanceKind; minecraft: string; list: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Taille à télécharger de la version choisie ; `null` pendant le calcul. */
  const [size, setSize] = useState<{ minecraft: string; bytes: number | null } | null>(null);
  const patch = (next: Partial<InstanceInput>) => setInput((current) => ({ ...current, ...next }));

  useEffect(() => {
    let cancelled = false;
    services
      .instanceVersions()
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        setInput((current) => (current.minecraft ? current : { ...current, minecraft: list.find((entry) => !entry.snapshot)?.id ?? null }));
      })
      .catch((reason) => !cancelled && setError(String(reason)));
    return () => {
      cancelled = true;
    };
  }, [services]);

  // Téléchargement annoncé avant la création : client, bibliothèques, ressources et Java manquants.
  useEffect(() => {
    const minecraft = input.minecraft;
    if (!minecraft || input.kind === "clover") return;
    let cancelled = false;
    setSize({ minecraft, bytes: null });
    services
      .downloadSize(minecraft)
      .then((bytes) => !cancelled && setSize({ minecraft, bytes }))
      .catch(() => !cancelled && setSize(null));
    return () => {
      cancelled = true;
    };
  }, [input.kind, input.minecraft, services]);

  // Loader conseillé (Fabric : le plus récent ; Forge : le recommandé), sauf si celui de l'instance
  // existe encore pour cette version.
  useEffect(() => {
    const { kind, minecraft } = input;
    if (!ownLoader(kind) || !minecraft) return;
    let cancelled = false;
    services
      .instanceLoaders(kind, minecraft)
      .then((list) => {
        if (cancelled) return;
        setLoaders({ kind, minecraft, list });
        setInput((current) => ({ ...current, loader: current.loader && list.includes(current.loader) ? current.loader : (list[0] ?? null) }));
      })
      .catch((reason) => !cancelled && setError(String(reason)));
    return () => {
      cancelled = true;
    };
  }, [input.kind, input.minecraft, services]);

  const loaderList = loaders?.kind === input.kind && loaders.minecraft === input.minecraft ? loaders.list : null;
  const loaderReady = loaderList?.includes(input.loader ?? "") ?? false;
  const personal = input.kind !== "clover";
  const fallbackName = `${KINDS[input.kind].label}${personal && input.minecraft ? ` ${input.minecraft}` : ""}`;
  const choices = versions.filter((entry) => snapshots || !entry.snapshot || entry.id === input.minecraft);
  const memory = [...new Set([...MEMORY, ...(input.memoryMb ? [input.memoryMb / 1024] : [])])].sort((a, b) => a - b);
  const ready = !busy && (!personal || Boolean(input.minecraft)) && (!ownLoader(input.kind) || loaderReady);
  const family = input.minecraft ? versionFamily(input.minecraft) : null;
  const siblings = family ? (existing?.instances ?? []).filter((entry) => entry.minecraft && versionFamily(entry.minecraft) === family) : [];
  // Clover suit la version du serveur, celle de l'instance Clover Games.
  const shown = personal ? input.minecraft : (serverVersion ?? input.minecraft);
  // Clover ne se propose que sur la version du serveur ; ailleurs, on revient à Vanilla.
  const cloverAllowed = Boolean(serverVersion && input.minecraft && versionFamily(input.minecraft) === versionFamily(serverVersion));
  const kinds = KIND_ORDER.filter((kind) => kind !== "clover" || cloverAllowed);
  useEffect(() => {
    if (input.minecraft && !cloverAllowed && input.kind === "clover") setInput((current) => ({ ...current, kind: "vanilla" }));
  }, [input.minecraft, input.kind, cloverAllowed]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(draft.id, { ...input, name: input.name.trim() || fallbackName });
    } catch (reason) {
      setError(String(reason));
      setBusy(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) void submit();
      }}
    >
      {/* Illustration de la version choisie, qui change avec elle. */}
      <header className="relative h-52 shrink-0 overflow-hidden border-b border-border bg-[#100e0b]">
        <VersionArt version={shown} />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-card from-8% via-card/55 via-40% to-transparent to-75%" />
        <button type="button" onClick={onClose} aria-label="Fermer" className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg bg-black/55 text-white/80 transition-colors hover:bg-black/75 hover:text-white">
          <X className="size-4" aria-hidden />
        </button>
        <div className="absolute inset-x-6 bottom-4 flex flex-col items-start gap-2">
          <span key={shown ?? ""} className="mc-frame bg-black/60 px-2 py-0.5 font-pixel text-[12px] text-white [--mc-radius:6px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-300">
            {personal ? (input.minecraft ? `Minecraft ${input.minecraft}` : "Minecraft") : `Clover Games${shown ? ` · ${shown}` : ""}`}
          </span>
          <h2 id="instance-panel-title" className="font-display text-[28px] leading-none text-white mc-text-shadow">{draft.id ? "Modifier l'instance" : "Nouvelle instance"}</h2>
          <p className="text-xs text-white/75">{draft.id ? input.name || fallbackName : "Le jeu se télécharge au premier lancement."}</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
      {existing && siblings.length > 0 && (
        <section key={family} aria-labelledby="instance-panel-existing" className="flex flex-col gap-2 border-b border-border pb-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300">
          <h3 id="instance-panel-existing" className="text-xs font-semibold">
            Tes instances en <span className="font-pixel">{family}</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {siblings.map((entry) => {
              const { Icon } = KINDS[entry.kind];
              const active = entry.id === existing.selected;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      existing.onSelect(entry.id);
                      onClose();
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active ? "border-primary bg-primary/10" : "border-border bg-[#100e0b] hover:border-muted-foreground/50",
                    )}
                  >
                    <span className="relative shrink-0">
                      <img src={versionImage(entry.minecraft ?? "")} alt="" className="size-10 rounded-md object-cover" />
                      <span className={cn("absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-md border-2 border-card", entry.kind === "clover" ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                        <Icon className="size-3" strokeWidth={2.5} aria-hidden />
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-bold">{entry.name}</span>
                      <span className="truncate font-pixel text-[11px] text-muted-foreground">{instanceSummary(entry)}</span>
                    </span>
                    {active && <Check className="size-4 shrink-0 text-primary" strokeWidth={3} aria-label="Choisie" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] leading-snug text-muted-foreground">Choisis-en une pour la lancer, ou crée-en une autre ci-dessous.</p>
        </section>
      )}
      {onImportModpack && (
        <button
          type="button"
          onClick={onImportModpack}
          className="group flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:border-accent/60 hover:bg-accent/5"
        >
          <PackageOpen className="size-5 shrink-0 text-accent" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-bold">Importer un modpack</span>
            <span className="text-[11px] leading-snug text-muted-foreground">Cherche un modpack ou importe un fichier .mrpack / .zip.</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold">Type</span>
        {/* Une barre, un segment par type ; le repère glisse vers le type choisi. */}
        <div role="radiogroup" aria-label="Type d'instance" className="relative grid rounded-lg border border-border bg-[#100e0b] p-1" style={{ gridTemplateColumns: `repeat(${kinds.length}, minmax(0, 1fr))` }}>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-1 rounded-md bg-primary/15 ring-1 ring-primary/45 ring-inset transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `calc((100% - 0.5rem) / ${kinds.length})`, transform: `translateX(${Math.max(0, kinds.indexOf(input.kind)) * 100}%)` }}
          />
          {kinds.map((kind) => {
            const { label, hint, Icon } = KINDS[kind];
            const active = input.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={active}
                title={hint}
                onClick={() => patch({ kind })}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] font-semibold transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-[18px] transition-colors", active && "text-primary")} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
        <p key={input.kind} className="text-[11px] leading-snug text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
          {KINDS[input.kind].hint}
        </p>
      </div>

      {personal && (
        <div className="flex flex-col gap-2">
          <span className="flex items-center justify-between text-xs font-semibold">
            Version de Minecraft
            <label className="flex items-center gap-2 font-normal text-muted-foreground">
              <Switch checked={snapshots} onCheckedChange={setSnapshots} aria-label="Afficher les snapshots" className="scale-90" />
              Snapshots
            </label>
          </span>
          <div className="flex items-center">
            <Select value={input.minecraft ?? ""} onValueChange={(minecraft) => minecraft && patch({ minecraft })} disabled={versions.length === 0}>
              <SelectTrigger aria-label="Version de Minecraft" className="flex-1">
                <SelectValue placeholder={error ? "Versions indisponibles" : "Chargement…"} />
              </SelectTrigger>
              <SelectContent>
                {groupVersions(choices, [], true).map((group) => (
                  <SelectGroup key={group.id}>
                    <SelectLabel>Minecraft {group.id}</SelectLabel>
                    {group.versions.map((id) => (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          {size?.minecraft === input.minecraft && (
            <p className="text-[11px] text-muted-foreground" aria-live="polite">
              {size.bytes === null ? "Calcul du téléchargement…" : size.bytes === 0 ? "Déjà téléchargée : prête à lancer." : `Environ ${formatDownload(size.bytes)} à télécharger au premier lancement.`}
            </p>
          )}
        </div>
      )}

      {ownLoader(input.kind) && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold">Version de {KINDS[input.kind].label}</span>
          <Select value={loaderReady ? (input.loader ?? "") : ""} onValueChange={(loader) => loader && patch({ loader })} disabled={!loaderList?.length}>
            <SelectTrigger aria-label={`Version de ${KINDS[input.kind].label}`} className="w-full">
              <SelectValue placeholder={loaderList ? "Aucune" : "Recherche…"} />
            </SelectTrigger>
            <SelectContent>
              {loaderList?.map((version, index) => (
                <SelectItem key={version} value={version}>
                  {version}
                  {index === 0 && <span className="text-muted-foreground"> · conseillée</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loaderList?.length === 0 && <p className="text-[11px] text-muted-foreground">{KINDS[input.kind].label} n'existe pas pour Minecraft {input.minecraft} : choisis une autre version.</p>}
          {input.loader?.includes("beta") && loaderReady && <p className="text-[11px] text-muted-foreground">Version bêta : aucune version stable n'est encore sortie pour Minecraft {input.minecraft}.</p>}
        </div>
      )}

      <label className="flex flex-col gap-2 text-xs font-semibold">
        Nom
        <input
          value={input.name}
          maxLength={64}
          placeholder={fallbackName}
          onChange={(event) => patch({ name: event.target.value })}
          className="h-10 rounded-md border border-border bg-[#100e0b] px-3 text-sm font-normal text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
        />
      </label>

      <div className="flex items-start justify-between gap-6 border-t border-border pt-4">
        <label htmlFor="instance-separate" className="flex flex-col gap-0.5 text-sm">
          Dossier séparé
          <span className="text-xs leading-snug text-muted-foreground">
            {input.separate ? "Mondes, packs et réglages propres à cette instance." : "Partage mondes et réglages avec le dossier commun : copie un monde avant de l'ouvrir dans une version plus ancienne."}
          </span>
        </label>
        <Switch id="instance-separate" checked={input.separate} onCheckedChange={(separate) => patch({ separate })} className="mt-0.5" />
      </div>

      <div className="flex items-center justify-between gap-6">
        <span className="text-sm">Mémoire</span>
        <Select value={input.memoryMb === null ? "launcher" : String(input.memoryMb)} onValueChange={(value) => patch({ memoryMb: value === "launcher" ? null : Number(value) })}>
          <SelectTrigger aria-label="Mémoire" className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="launcher">Comme le launcher</SelectItem>
            {memory.map((gb) => (
              <SelectItem key={gb} value={String(gb * 1024)}>
                {gb} Go
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>

      <footer className="flex justify-end gap-2 border-t border-border bg-[#17150f] px-6 py-4">
        <button type="button" onClick={onClose} className={secondaryButton}>
          Annuler
        </button>
        <button type="submit" disabled={!ready} className={primaryButton}>
          {busy ? "Enregistrement…" : draft.id ? "Enregistrer" : "Créer"}
        </button>
      </footer>
    </form>
  );
}
