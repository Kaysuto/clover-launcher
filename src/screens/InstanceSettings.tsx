import { Check, Lock, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { instanceSummary } from "@/lib/instances";
import { cn } from "@/lib/utils";
import type { InstanceEntry } from "@/types";

type Services = Pick<typeof api, "updateInstance" | "resetRecommended">;

/** Mémoire proposée, en Go ; « Réglage du launcher » suit les paramètres du launcher. */
const MEMORY = [2, 3, 4, 6, 8, 12, 16];
const LAUNCHER = "launcher";
const card = "rounded-lg border border-border bg-card";

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[220px_1fr] gap-8 border-b border-border py-5 first:pt-1 last:border-b-0">
      <div className="flex flex-col gap-1">
        <h3 className="text-[13px] font-bold">{title}</h3>
        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </section>
  );
}

/**
 * Réglages propres à une instance, distincts de ceux du launcher : nom (l'instance du serveur
 * s'appelle toujours « Clover Games »), mémoire et arguments Java en plus de ceux du launcher.
 */
export function InstanceSettings({
  entry,
  locked,
  launcherMemoryGb,
  onSaved,
  onChangeVersion,
  onNotice,
  services = api,
}: {
  entry: InstanceEntry;
  /** Une partie ou une installation est en cours : rien ne change avant la fin. */
  locked: boolean;
  /** Mémoire du réglage du launcher, pour l'option « Réglage du launcher ». */
  launcherMemoryGb: number;
  onSaved: () => void;
  /** Instance personnelle : ouvre le panneau de version et de type. */
  onChangeVersion?: () => void;
  onNotice: (message: string) => void;
  services?: Services;
}) {
  const clover = entry.kind === "clover";
  const [name, setName] = useState(entry.name);
  const [memory, setMemory] = useState(entry.memoryMb ? String(entry.memoryMb / 1024) : LAUNCHER);
  const [javaArgs, setJavaArgs] = useState(entry.javaArgs ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const changed = (!clover && name.trim() !== entry.name) || memory !== (entry.memoryMb ? String(entry.memoryMb / 1024) : LAUNCHER) || javaArgs.trim() !== (entry.javaArgs ?? "");
  const memoryChoices = [...new Set([...MEMORY, ...(entry.memoryMb ? [entry.memoryMb / 1024] : [])])].sort((a, b) => a - b);

  const save = async () => {
    setState("saving");
    setError(null);
    try {
      await services.updateInstance(entry.id, clover ? entry.name : name, memory === LAUNCHER ? null : Number(memory) * 1024, javaArgs);
      setState("saved");
      onSaved();
      window.setTimeout(() => setState("idle"), 1500);
    } catch (reason) {
      setError(String(reason));
      setState("idle");
    }
  };

  return (
    <div className={cn(card, "flex flex-col px-5 py-4")}>
      <Row title="Nom" hint={clover ? "Instance du serveur : elle garde le nom Clover Games." : "Affiché dans la liste des instances et sur l'accueil."}>
        <label className="relative block max-w-md">
          <span className="sr-only">Nom de l'instance</span>
          <input
            value={clover ? entry.name : name}
            onChange={(event) => setName(event.target.value)}
            disabled={clover || locked}
            maxLength={64}
            className="h-9 w-full rounded-md border border-border bg-[#100e0b] px-3 pr-9 text-sm text-foreground outline-none select-text focus:border-accent disabled:opacity-70"
          />
          {clover && <Lock className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />}
        </label>
      </Row>

      <Row title="Version" hint={clover ? "Suit le serveur : Minecraft, Fabric et les mods du catalogue se mettent à jour d'eux-mêmes." : undefined}>
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-border bg-[#100e0b] px-2.5 py-1.5 font-pixel text-[11px]">{instanceSummary(entry)}</span>
          {onChangeVersion && (
            <button type="button" onClick={onChangeVersion} disabled={locked} className={secondaryButton}>
              <SlidersHorizontal className="size-4" aria-hidden />
              Changer la version…
            </button>
          )}
        </div>
      </Row>

      <Row title="Mémoire" hint="Mémoire donnée à Minecraft pour cette instance.">
        <Select value={memory} onValueChange={setMemory} disabled={locked}>
          <SelectTrigger aria-label="Mémoire de l'instance" className="h-9 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LAUNCHER}>Réglage du launcher ({launcherMemoryGb} Go)</SelectItem>
            {memoryChoices.map((gb) => (
              <SelectItem key={gb} value={String(gb)}>
                {gb} Go
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row title="Arguments Java" hint="Ajoutés à ceux des paramètres du launcher, pour cette instance seulement.">
        <input
          value={javaArgs}
          onChange={(event) => setJavaArgs(event.target.value)}
          disabled={locked}
          placeholder="-XX:+UseZGC"
          spellCheck={false}
          className="h-9 w-full max-w-md rounded-md border border-border bg-[#100e0b] px-3 font-mono text-xs text-foreground outline-none select-text placeholder:text-muted-foreground/60 focus:border-accent"
        />
      </Row>

      {clover && (
        <Row title="Réglages recommandés" hint="Distance d'affichage, graphismes et touches choisis pour ton ordinateur. Les anciens fichiers sont gardés en .bak.">
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              services
                .resetRecommended()
                .then((written) => onNotice(written.length > 0 ? "Réglages recommandés rétablis : les anciens fichiers sont gardés en .bak." : "Réglages déjà à jour."))
                .catch((reason) => onNotice(String(reason)))
            }
            className={cn(secondaryButton, "self-start")}
          >
            <RotateCcw className="size-4" aria-hidden />
            Rétablir les réglages recommandés
          </button>
        </Row>
      )}

      <div className="flex items-center justify-end gap-3 pt-4">
        {error && <p className="mr-auto text-[13px] text-[#f3a19e]">{error}</p>}
        {locked && <p className="mr-auto text-xs text-muted-foreground">Ferme Minecraft pour modifier l'instance.</p>}
        <button type="button" onClick={() => void save()} disabled={!changed || locked || state === "saving"} className={primaryButton}>
          {state === "saved" ? <Check className="size-4" aria-hidden /> : null}
          {state === "saving" ? "Enregistrement…" : state === "saved" ? "Enregistré" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
