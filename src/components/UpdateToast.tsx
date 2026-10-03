import { primaryButton } from "@/lib/buttons";
import type { LauncherUpdate } from "@/types";

export type UpdateState = { info: LauncherUpdate; installing: boolean; ratio: number | null; error?: string };

/**
 * Nouvelle version du launcher : proposée ici quand la mise à jour automatique est coupée ou a
 * échoué, sinon simple avancement du téléchargement avant le redémarrage.
 */
export function UpdateToast({ update, onInstall, onDismiss }: { update: UpdateState; onInstall: () => void; onDismiss: () => void }) {
  const percent = update.ratio === null ? null : Math.round(update.ratio * 100);
  return (
    <div role="status" className="mc-frame flex w-[340px] flex-col gap-2.5 bg-card px-4 py-3 text-[13px] shadow-[0_12px_32px_rgb(0_0_0/0.5)]">
      <p className="font-semibold">
        Clover Launcher <span className="font-pixel text-[12px] text-accent">{update.info.version}</span> est disponible
      </p>
      {update.installing ? (
        <>
          <div
            role="progressbar"
            aria-label="Téléchargement de la mise à jour"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            className="h-2 overflow-hidden rounded-full bg-secondary"
          >
            <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${percent ?? 8}%` }} />
          </div>
          <p className="text-muted-foreground">Téléchargement{percent === null ? "…" : ` · ${percent} %`} Le launcher redémarre tout seul.</p>
        </>
      ) : (
        <>
          {update.error && <p className="leading-snug text-[#f3a19e]">{update.error}</p>}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onDismiss} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              Plus tard
            </button>
            <button type="button" onClick={onInstall} className={primaryButton}>
              Installer et redémarrer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
