import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { groupVersions } from "@/lib/game-versions";
import { KINDS } from "@/lib/instances";
import { cn } from "@/lib/utils";
import { versionImage } from "@/lib/version-art";
import type { AvailableVersion, InstanceInput, InstanceKind } from "@/types";

export type InstanceDraft = { id: string | null; input: InstanceInput };
type Services = Pick<typeof api, "instanceVersions" | "fabricLoaders">;

const MEMORY = [2, 3, 4, 6, 8, 12, 16];

export const newInstance = (minecraft: string | null = null): InstanceDraft => ({
  id: null,
  input: { name: "", kind: "vanilla", minecraft, loader: null, separate: false, memoryMb: null },
});

/**
 * Création ou modification d'une instance personnelle, en panneau à droite de l'écran Instances :
 * la liste reste visible et utilisable. Type, version, puis le reste est facultatif.
 */
export function InstancePanel({
  draft,
  onClose,
  onSave,
  services = api,
}: {
  draft: InstanceDraft;
  onClose: () => void;
  /** Rejette avec le message à afficher. */
  onSave: (id: string | null, input: InstanceInput) => Promise<void>;
  services?: Services;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && !event.defaultPrevented && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <aside aria-labelledby="instance-panel-title" className="flex w-[380px] shrink-0 flex-col border-l border-border bg-card animate-in slide-in-from-right-8 fade-in duration-200">
      {/* `key` : un autre brouillon (autre instance, autre version) repart d'un formulaire neuf. */}
      <Form key={`${draft.id ?? "new"}-${draft.input.minecraft ?? ""}`} draft={draft} onClose={onClose} onSave={onSave} services={services} />
    </aside>
  );
}

function Form({ draft, onClose, onSave, services }: { draft: InstanceDraft; onClose: () => void; onSave: (id: string | null, input: InstanceInput) => Promise<void>; services: Services }) {
  const [input, setInput] = useState(draft.input);
  const [versions, setVersions] = useState<AvailableVersion[]>([]);
  const [snapshots, setSnapshots] = useState(false);
  const [loaders, setLoaders] = useState<{ minecraft: string; list: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  // Fabric : le loader le plus récent compatible, sauf si celui de l'instance l'est encore.
  useEffect(() => {
    const minecraft = input.minecraft;
    if (input.kind !== "fabric" || !minecraft) return;
    let cancelled = false;
    services
      .fabricLoaders(minecraft)
      .then((list) => {
        if (cancelled) return;
        setLoaders({ minecraft, list });
        setInput((current) => ({ ...current, loader: current.loader && list.includes(current.loader) ? current.loader : (list[0] ?? null) }));
      })
      .catch((reason) => !cancelled && setError(String(reason)));
    return () => {
      cancelled = true;
    };
  }, [input.kind, input.minecraft, services]);

  const fabricReady = loaders?.minecraft === input.minecraft && loaders.list.includes(input.loader ?? "");
  const personal = input.kind !== "clover";
  const fallbackName = `${KINDS[input.kind].label}${personal && input.minecraft ? ` ${input.minecraft}` : ""}`;
  const choices = versions.filter((entry) => snapshots || !entry.snapshot || entry.id === input.minecraft);
  const memory = [...new Set([...MEMORY, ...(input.memoryMb ? [input.memoryMb / 1024] : [])])].sort((a, b) => a - b);
  const ready = !busy && (!personal || Boolean(input.minecraft)) && (input.kind !== "fabric" || fabricReady);

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
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="instance-panel-title" className="font-display text-2xl leading-none">{draft.id ? "Modifier l'instance" : "Nouvelle instance"}</h2>
          <p className="text-xs text-muted-foreground">Le jeu se télécharge au premier lancement.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="-mr-1 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
      <div role="radiogroup" aria-label="Type d'instance" className="flex flex-col gap-2">
        {(Object.keys(KINDS) as InstanceKind[]).map((kind) => {
          const { label, hint, Icon } = KINDS[kind];
          const active = input.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => patch({ kind })}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                active ? "border-primary bg-primary/10" : "border-border bg-[#100e0b] hover:border-muted-foreground/50",
              )}
            >
              <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold">{label}</span>
                <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
              </span>
            </button>
          );
        })}
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
          <div className="flex items-center gap-3">
            {input.minecraft && <img src={versionImage(input.minecraft)} alt="" className="size-10 shrink-0 rounded-md object-cover" />}
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
          {input.kind === "fabric" && (
            <p className="text-[11px] text-muted-foreground">
              {loaders?.minecraft !== input.minecraft ? "Recherche de Fabric…" : fabricReady ? <>Fabric <span className="font-pixel">{input.loader}</span>, la dernière version compatible.</> : "Fabric n'existe pas pour cette version."}
            </p>
          )}
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
