import type { ReactNode } from "react";

import type { InstallPhase, PlayState } from "@/types";

const PHASES: Record<InstallPhase, string> = {
  java: "Installation de Java",
  libraries: "Téléchargement de Minecraft",
  loader: "Préparation du loader",
  assets: "Téléchargement des ressources",
  mods: "Installation des mods",
};

const number = new Intl.NumberFormat("fr-FR");

type Props = {
  state: PlayState;
  onPlay: () => void;
  onOpenConsole: () => void;
  /** « Fermer le jeu », puis « Forcer la fermeture » s'il ne répond pas. */
  onStop?: (force: boolean) => void;
  /** Sous « Jouer » : la version qui sera lancée, par exemple « Minecraft 26.2 · Fabric ». */
  version: string;
  /** Petite dalle à droite : changement de version. */
  picker?: ReactNode;
  compact?: boolean;
};

export function PlayButton({ state, onPlay, onOpenConsole, onStop, version, picker, compact }: Props) {
  const progress = state.kind === "installing" ? state.progress : undefined;
  const ratio = progress && progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <div className={`flex shrink-0 ${picker ? "w-[330px]" : "w-full"} flex-col items-stretch gap-3`}>
      <div className="flex gap-3">
        <button type="button" className={`play-slab ${compact ? "h-16" : "h-[86px]"} min-w-0 flex-1 overflow-hidden`} disabled={state.kind !== "ready" || state.busy} onClick={onPlay}>
          {state.kind === "installing" && <span className="play-slab-fill" style={{ transform: `scaleX(${ratio})` }} aria-hidden />}
          <span className="relative flex flex-col items-center gap-1.5">
            <span className={`font-display ${compact ? "text-[30px]" : "text-[38px]"} leading-none tracking-wide uppercase [text-shadow:0_2px_0_rgb(255_255_255/0.35)]`}>
              {state.kind === "ready" && "Jouer"}
              {state.kind === "installing" && (progress ? `${Math.floor(ratio * 100)} %` : "Préparation")}
              {state.kind === "running" && "En jeu"}
            </span>
            <span className="max-w-full truncate text-[11px] leading-none font-bold opacity-75">{version}</span>
          </span>
        </button>
        {picker}
      </div>

      {(!compact || state.kind !== "ready" || state.error) && <p className="relative min-h-4 text-center text-xs font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]" aria-live="polite">
        {state.kind === "installing" && progress && (
          <>
            {PHASES[progress.phase]} · <span className="font-pixel text-[11px]">{number.format(progress.done)}/{number.format(progress.total)}</span>
          </>
        )}
        {state.kind === "running" && state.closing === "asked" && "Fermeture de Minecraft…"}
        {state.kind === "running" && state.closing === "slow" && (
          <>
            Minecraft ne répond pas.{" "}
            <button
              type="button"
              onClick={() => onStop?.(true)}
              title="Un monde solo ouvert peut perdre ses dernières minutes."
              className="font-bold text-[#ffb3b0] underline-offset-2 hover:underline"
            >
              Forcer la fermeture
            </button>
          </>
        )}
        {state.kind === "running" && !state.closing && (
          <>
            Minecraft est ouvert.{" "}
            <button type="button" onClick={onOpenConsole} className="font-bold text-accent underline-offset-2 hover:underline">
              Voir la console
            </button>
            {onStop && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => onStop(false)}
                  title="Ferme Minecraft comme par la croix de sa fenêtre : le monde ouvert est sauvegardé."
                  className="font-bold text-accent underline-offset-2 hover:underline"
                >
                  Fermer le jeu
                </button>
              </>
            )}
          </>
        )}
        {state.kind === "ready" && state.error && <span className="text-[#ffb3b0]">{state.error}</span>}
      </p>}
    </div>
  );
}
