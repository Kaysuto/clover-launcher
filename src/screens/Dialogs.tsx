import { Check, Copy, FolderOpen, RotateCcw } from "lucide-react";
import { useRef } from "react";

import { SkinFront } from "@/components/SkinFront";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { primaryButton, secondaryButton } from "@/lib/buttons";
import type { SavedSkin } from "@/types";

const content = "mc-frame gap-5 border-[var(--mc-outline)] bg-card p-6 ring-0 sm:max-w-[560px]";
const footer = "-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4";

export function CrashDialog(props: {
  open: boolean;
  exitCode: number | null;
  logTail: string;
  onCopyLog: () => void;
  onOpenLogs: () => void;
  onRelaunch: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Minecraft s'est arrêté</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Le jeu s'est fermé avec le code {props.exitCode ?? "inconnu"}. Si ça recommence, copie le journal et envoie-le au support sur le Discord.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-44 overflow-auto rounded-md border border-border bg-[#0c0b09] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[#cfc8b8] select-text">
          {props.logTail}
        </pre>
        <DialogFooter className={footer}>
          <button type="button" onClick={props.onCopyLog} className={secondaryButton}>
            <Copy className="size-4" aria-hidden />
            Copier le journal
          </button>
          <button type="button" onClick={props.onOpenLogs} className={secondaryButton}>
            <FolderOpen className="size-4" aria-hidden />
            Ouvrir les journaux
          </button>
          <button type="button" onClick={props.onRelaunch} className={primaryButton}>
            <RotateCcw className="size-4" aria-hidden />
            Relancer
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation avant de porter un skin d'origine : il remplace le skin du compte. */
export function DefaultSkinDialog(props: { skin: SavedSkin | null; onConfirm: (skin: SavedSkin) => void; onCancel: () => void }) {
  // Garde le dernier skin affiché pendant l'animation de fermeture.
  const last = useRef(props.skin);
  if (props.skin) last.current = props.skin;
  const skin = last.current;
  return (
    <Dialog open={props.skin !== null} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent className={content}>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Porter « {skin?.name} » ?</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Ton skin actuel sera remplacé sur ton compte Minecraft, sur Clover Games comme sur tous les serveurs.
          </DialogDescription>
        </DialogHeader>
        {skin && (
          <div className="flex justify-center py-2">
            <SkinFront texture={skin.texture} model={skin.model} scale={5} className="drop-shadow-[0_6px_6px_rgb(0_0_0/0.45)]" />
          </div>
        )}
        <DialogFooter className={footer}>
          <button type="button" onClick={props.onCancel} className={secondaryButton}>
            Annuler
          </button>
          <button type="button" onClick={() => skin && props.onConfirm(skin)} className={primaryButton}>
            <Check className="size-4" aria-hidden />
            Porter ce skin
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
