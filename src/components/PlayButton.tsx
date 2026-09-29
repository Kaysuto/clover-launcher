import type { InstallPhase, PlayState } from "@/types";

const PHASES: Record<InstallPhase, string> = {
  java: "Installation de Java",
  libraries: "Téléchargement de Minecraft",
  assets: "Téléchargement des ressources",
  mods: "Installation des mods",
};

const number = new Intl.NumberFormat("fr-FR");

export function PlayButton({ state, onPlay }: { state: PlayState; onPlay: () => void }) {
  const progress = state.kind === "installing" ? state.progress : undefined;
  const ratio = progress && progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <div className="flex w-[300px] flex-col items-stretch gap-3">
      <button type="button" className="play-slab h-[86px] overflow-hidden" disabled={state.kind !== "ready"} onClick={onPlay}>
        {state.kind === "installing" && <span className="play-slab-fill" style={{ transform: `scaleX(${ratio})` }} aria-hidden />}
        <span className="relative font-display text-[42px] leading-none tracking-wide uppercase [text-shadow:0_2px_0_rgb(255_255_255/0.35)]">
          {state.kind === "ready" && "Jouer"}
          {state.kind === "installing" && (progress ? `${Math.floor(ratio * 100)} %` : "Préparation")}
          {state.kind === "running" && "En jeu"}
        </span>
      </button>

      <p className="relative h-4 text-center text-xs font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]" aria-live="polite">
        {state.kind === "installing" && progress && (
          <>
            {PHASES[progress.phase]} · <span className="font-pixel text-[11px]">{number.format(progress.done)}/{number.format(progress.total)}</span>
          </>
        )}
        {state.kind === "running" && "Minecraft est ouvert. Ferme le jeu pour relancer."}
      </p>
    </div>
  );
}
