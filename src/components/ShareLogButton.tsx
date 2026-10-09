import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, LoaderCircle, Share2 } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { primaryButton, secondaryButton } from "@/lib/buttons";

type Step = { kind: "confirm" } | { kind: "sending" } | { kind: "error"; message: string } | { kind: "done"; url: string; copied: boolean };

/**
 * « Partager » : publie le journal sur mclo.gs après confirmation (toute personne qui a le lien
 * peut le lire), puis copie l'adresse de sa page, à envoyer au support. `log` est lu à l'envoi.
 */
export function ShareLogButton({ log, disabled, services = api }: { log: () => string; disabled?: boolean; services?: Pick<typeof api, "shareLog"> }) {
  const [step, setStep] = useState<Step | null>(null);

  const send = async () => {
    setStep({ kind: "sending" });
    try {
      const url = await services.shareLog(log());
      const copied = await navigator.clipboard.writeText(url).then(
        () => true,
        () => false,
      );
      setStep({ kind: "done", url, copied });
    } catch (reason) {
      setStep({ kind: "error", message: String(reason) });
    }
  };

  return (
    <>
      <button type="button" onClick={() => setStep({ kind: "confirm" })} disabled={disabled} className={secondaryButton}>
        <Share2 className="size-4" aria-hidden />
        Partager
      </button>
      <Dialog open={step !== null} onOpenChange={(open) => !open && step?.kind !== "sending" && setStep(null)}>
        <DialogContent className="mc-frame gap-5 border-[var(--mc-outline)] bg-card p-6 ring-0 sm:max-w-[480px]">
          {step?.kind === "done" ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl font-normal">Journal partagé</DialogTitle>
                <DialogDescription className="text-[13px] leading-relaxed">
                  {step.copied ? "Lien copié : colle-le dans ton message au support sur le Discord." : "Copie ce lien et envoie-le au support sur le Discord."}
                </DialogDescription>
              </DialogHeader>
              <p className="truncate rounded-md border border-border bg-[#100e0b] px-3 py-2 font-mono text-xs select-text">{step.url}</p>
              <DialogFooter className="-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4">
                <button type="button" onClick={() => void openUrl(step.url)} className={secondaryButton}>
                  <ExternalLink className="size-4" aria-hidden />
                  Ouvrir
                </button>
                <button type="button" onClick={() => setStep(null)} className={primaryButton}>
                  Fermer
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl font-normal">Partager le journal ?</DialogTitle>
                <DialogDescription className="text-[13px] leading-relaxed">
                  Le journal est publié sur mclo.gs, un service de partage de journaux Minecraft : toute personne qui a le lien peut le lire. Ton pseudo Minecraft y
                  figure ; ton jeton de connexion en est retiré.
                </DialogDescription>
              </DialogHeader>
              {step?.kind === "error" && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{step.message}</p>}
              <DialogFooter className="-mx-6 -mb-6 rounded-b-[6px] border-border bg-[#17150f] px-6 py-4">
                <button type="button" onClick={() => setStep(null)} disabled={step?.kind === "sending"} className={secondaryButton}>
                  Annuler
                </button>
                <button type="button" onClick={() => void send()} disabled={step?.kind === "sending"} className={primaryButton}>
                  {step?.kind === "sending" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
                  {step?.kind === "sending" ? "Publication…" : "Publier le journal"}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
