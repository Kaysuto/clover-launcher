import { Copy, FolderOpen, RotateCcw } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { primaryButton, secondaryButton } from "@/lib/buttons";

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
