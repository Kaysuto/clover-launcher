import { MoveHorizontal, Save, Upload, X } from "lucide-react";
import { useRef } from "react";

import { CapeFront } from "@/components/SkinFront";
import { SkinViewer } from "@/components/SkinViewer";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { Cape, SkinLook, SkinModel } from "@/types";

type Props = {
  open: boolean;
  /** Apparence en cours de modification, pas encore enregistrée sur le compte. */
  draft: SkinLook;
  /** Capes possédées par le compte : Minecraft ne permet de porter que celles-là. */
  capes: Cape[];
  saving: boolean;
  onChange: (draft: SkinLook) => void;
  onReplaceTexture: (file: File) => void;
  onSave: () => void;
  onOpenChange: (open: boolean) => void;
};

const MODELS: { id: SkinModel; label: string; hint: string }[] = [
  { id: "classic", label: "Classiques", hint: "4 pixels" },
  { id: "slim", label: "Fins", hint: "3 pixels" },
];

const label = "text-sm font-bold";
const selectedFrame = "outline-[3px] outline-offset-2 outline-[#e9e3d4] [outline-style:solid]";

export function SkinEditorDialog({ open, draft, capes, saving, onChange, onReplaceTexture, onSave, onOpenChange }: Props) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mc-frame gap-0 border-[var(--mc-outline)] bg-card p-0 ring-0 sm:max-w-[680px]">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-display text-2xl font-normal">Modifier le skin</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[250px_1fr] gap-6 px-6 py-5">
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg bg-[radial-gradient(ellipse_at_50%_45%,rgb(82_169_108/0.14),transparent_70%)]">
            <SkinViewer look={draft} width={210} height={320} />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MoveHorizontal className="size-3.5" aria-hidden />
              Fais-le tourner ou attrape-le
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className={label}>Texture</p>
              <button type="button" onClick={() => input.current?.click()} className={`${secondaryButton} self-start`}>
                <Upload className="size-4" aria-hidden />
                Remplacer la texture
              </button>
              <input
                ref={input}
                type="file"
                accept="image/png"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onReplaceTexture(file);
                  event.target.value = "";
                }}
              />
              <p className="text-[11px] text-muted-foreground">Fichier .png de 64×64 pixels.</p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className={cn(label, "mb-2")}>Bras</legend>
              <div className="flex gap-2">
                {MODELS.map((model) => (
                  <label
                    key={model.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      draft.model === model.id ? "border-primary bg-primary/10" : "border-border hover:bg-secondary",
                    )}
                  >
                    <input
                      type="radio"
                      name="skin-model"
                      value={model.id}
                      checked={draft.model === model.id}
                      onChange={() => onChange({ ...draft, model: model.id })}
                      className="accent-[var(--primary)]"
                    />
                    <span className="font-semibold">{model.label}</span>
                    <span className="text-xs text-muted-foreground">{model.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex min-h-0 flex-col gap-2">
              <legend className={cn(label, "mb-2")}>Cape</legend>
              <ul className="grid max-h-[208px] grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-2 overflow-y-auto p-1">
                <li>
                  <button
                    type="button"
                    aria-pressed={draft.cape === null}
                    onClick={() => onChange({ ...draft, cape: null })}
                    className={cn("mc-slot flex h-[88px] w-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground", draft.cape === null && selectedFrame)}
                  >
                    <X className="size-4" aria-hidden />
                    Aucune
                  </button>
                </li>
                {capes.map((cape) => (
                  <li key={cape.id}>
                    <button
                      type="button"
                      aria-pressed={draft.cape?.id === cape.id}
                      title={cape.name}
                      aria-label={cape.name}
                      onClick={() => onChange({ ...draft, cape })}
                      className={cn("mc-slot grid h-[88px] w-full place-items-center", draft.cape?.id === cape.id && selectedFrame)}
                    >
                      <CapeFront texture={cape.texture} scale={4.5} />
                    </button>
                  </li>
                ))}
              </ul>
              {capes.length === 0 && <p className="text-[11px] text-muted-foreground">Ce compte ne possède aucune cape.</p>}
            </fieldset>
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4">
          <button type="button" onClick={() => onOpenChange(false)} className={secondaryButton}>
            Annuler
          </button>
          <button type="button" onClick={onSave} disabled={saving} className={primaryButton}>
            <Save className="size-4" aria-hidden />
            {saving ? "Enregistrement…" : "Enregistrer le skin"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
