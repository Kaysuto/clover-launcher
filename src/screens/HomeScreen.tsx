import { ArrowRight, Newspaper, Wrench } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { HeroBackdrop } from "@/components/Backdrop";
import { QuickLinks, WeekActivity } from "@/components/HomeExtras";
import type { HeroTone } from "@/lib/appearance";
import { ModeGrid } from "@/components/ModeGrid";
import { NewsList } from "@/components/NewsList";
import { type OtherServer, OtherServers } from "@/components/OtherServers";
import { PlayButton } from "@/components/PlayButton";
import { SkinViewer } from "@/components/SkinViewer";
import { VersionPicker } from "@/components/VersionPicker";
import { secondaryButton } from "@/lib/buttons";
import { forClover } from "@/lib/instances";
import { cn } from "@/lib/utils";
import type { InstanceEntry, ModeStatus, NewsItem, PlaySession, PlayState, SkinLook } from "@/types";

type Props = {
  look: SkinLook;
  /** Teinte du bandeau, choisie dans Paramètres → Apparence. */
  heroTone?: HeroTone;
  /** Noms des mods activés, dans l'ordre du catalogue. */
  enabledMods: string[];
  onManageMods: () => void;
  /** Pendant la partie : lien vers la console sous « Jouer ». */
  onOpenConsole: () => void;
  play: PlayState;
  /** Clover Games déjà ouvert ou un lancement en cours : les modes ne lancent rien. */
  modesBusy?: boolean;
  onStop?: (force: boolean) => void;
  /** Sans argument : « Jouer », menu du jeu. Avec un mode : Quick Play sur ce mode. */
  onPlay: (mode?: string) => void;
  instances: InstanceEntry[];
  selectedInstance: string;
  onSelectInstance: (id: string) => void;
  onCreateInstance: () => void;
  onManageInstances: () => void;
  /** Ouvre d'office le choix d'instance (planche des maquettes). */
  versionOpen?: boolean;
  /** Disponibilité par ping, total des joueurs par mode ; `null` pendant la première mesure. */
  server: { online: boolean; players: number | null } | null;
  animateSkin?: boolean;
  modes: ModeStatus[];
  /** Serveurs hors Clover Games déjà rejoints, du plus récent au plus ancien. */
  otherServers: OtherServer[];
  onPlayServer: (address: string) => void;
  onRenameServer?: (address: string, name: string) => Promise<void>;
  onRenameError?: (message: string) => void;
  /** Du plus récent au plus ancien : le premier article passe à la une. */
  news: NewsItem[];
  /** Maintenance annoncée sur le site : bandeau au-dessus de l'accueil. */
  maintenance?: boolean;
  onOpenLink: (url: string) => void;
  /** « Tout lire » : page Actualités. */
  onOpenNews: () => void;
  /** Article du blog : lu dans le launcher (ou sur le site s'il n'a pas de slug). */
  onReadNews: (item: NewsItem) => void;
  /** Parties de toutes les instances, pour « Ta semaine » ; `null` pendant la lecture. */
  sessions: PlaySession[] | null;
};



const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

/** Blocs complets (183 px mesurés sur la planche) et sans lignes de détail, écart compris. */
const FULL_HEIGHT = 192;
const MEDIUM_HEIGHT = 136;
/** Remplissage vertical du bloc des modes (`pt-4 pb-5`) et écart entre les blocs (`gap-2`). */
const MODES_PADDING = 36;
const GAP = 8;

/**
 * « Ta semaine » et les raccourcis restent toujours là : complets s'il reste la place sous les modes
 * à leur taille naturelle (ils passent sur plusieurs lignes dans une fenêtre étroite), sans leurs
 * lignes de détail sinon ; et si même ainsi ils ne tiennent pas, la colonne défile.
 */
function useExtrasLayout() {
  const column = useRef<HTMLDivElement>(null);
  const modes = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<"full" | "medium" | "scroll">("medium");
  useLayoutEffect(() => {
    const nodes = [column.current, modes.current, bar.current];
    if (nodes.some((node) => !node)) return;
    const measure = () => {
      const free = column.current!.clientHeight - (modes.current!.offsetHeight + MODES_PADDING) - bar.current!.offsetHeight - GAP;
      setLayout(free >= FULL_HEIGHT ? "full" : free >= MEDIUM_HEIGHT ? "medium" : "scroll");
    };
    const observer = new ResizeObserver(measure);
    for (const node of nodes) observer.observe(node!);
    measure();
    return () => observer.disconnect();
  }, []);
  return { column, modes, bar, layout };
}

export function HomeScreen({ look, heroTone, enabledMods, onManageMods, onOpenConsole, play, modesBusy, onStop, onPlay, instances, selectedInstance, onSelectInstance, onCreateInstance, onManageInstances, versionOpen, server, animateSkin, modes, otherServers, onPlayServer, onRenameServer, onRenameError, news, maintenance = false, onOpenLink, onOpenNews, onReadNews, sessions }: Props) {
  const [featured, ...others] = news;
  const current = instances.find((entry) => entry.id === selectedInstance) ?? instances[0];
  const extras = useExtrasLayout();

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-2">
      {maintenance && (
        <p role="status" className="flex shrink-0 items-center gap-2.5 rounded-[calc(var(--radius)+4px)] border border-[var(--mc-outline)] bg-accent px-6 py-2 text-[13px] font-semibold text-accent-foreground">
          <Wrench className="size-4 shrink-0" aria-hidden />
          Maintenance en cours : les serveurs peuvent être indisponibles ou redémarrer. Suis les annonces sur le Discord.
        </p>
      )}
      <section className="tile relative flex h-[clamp(270px,36vh,430px)] shrink-0 items-end overflow-hidden text-white">
        <HeroBackdrop tone={heroTone} />

        <div className="relative flex w-full items-end justify-between gap-8 px-10 pb-8">
          {featured ? (
            <article className="flex max-w-[540px] flex-col gap-3">
              <p className="mc-frame flex items-center gap-1.5 self-start bg-black/55 px-2.5 py-1 text-[11px] font-semibold [--mc-radius:6px]">
                <Newspaper className="size-3.5 text-accent" aria-hidden />À la une · <time dateTime={featured.publishedAt}>{date.format(new Date(featured.publishedAt))}</time>
              </p>
              <h1 className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.05] text-balance mc-text-shadow">{featured.title}</h1>
              <p className="line-clamp-2 text-[13px] leading-relaxed text-white/80">{featured.excerpt}</p>
              <button type="button" onClick={() => onReadNews(featured)} className={`${secondaryButton} mt-1 self-start`}>
                Lire l'article
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </article>
          ) : (
            <h1 className="font-display text-[34px]">Bienvenue sur Clover Games</h1>
          )}

          <div className="flex shrink-0 items-end gap-2">
            <div className="relative -mb-8">
              <div aria-hidden className="absolute bottom-7 left-1/2 h-4 w-28 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[6px]" />
              <SkinViewer look={look} width={170} height={270} animate={animateSkin} />
            </div>
            <div className="flex flex-col items-center gap-3 pb-1">
              <PlayButton
                state={play}
                onPlay={() => onPlay()}
                onOpenConsole={onOpenConsole}
                onStop={onStop}
                version={current ? `${current.name} · ${current.minecraft ?? "…"}${forClover(current) ? "" : " · solo"}` : "Chargement…"}
                picker={<VersionPicker instances={instances} selected={selectedInstance} onSelect={onSelectInstance} onCreate={onCreateInstance} onManage={onManageInstances} defaultOpen={versionOpen} />}
              />
              <p className="mc-frame flex h-9 items-center gap-2 bg-card/90 px-3.5 text-xs text-muted-foreground [--mc-radius:6px]">
                <span className={cn("size-2 rounded-full", server === null ? "animate-pulse bg-muted-foreground" : server.online ? "bg-primary" : "bg-destructive")} aria-hidden />
                {server === null ? (
                  <span>Recherche du serveur…</span>
                ) : server.online ? (
                  <>
                    <span className="font-semibold text-foreground">En ligne</span>
                    {server.players !== null && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-pixel text-[12px] text-foreground">{server.players}</span> joueurs
                      </>
                    )}
                  </>
                ) : (
                  <span className="font-semibold text-destructive">Hors ligne</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,420px)] gap-2">
        <div ref={extras.column} className={cn("flex min-h-0 min-w-0 flex-col gap-2", extras.layout === "scroll" && "-mr-2 overflow-y-auto pr-2")}>
          <section aria-labelledby="modes-title" className={cn("tile flex flex-col px-5 pt-4 pb-5", extras.layout === "medium" ? "min-h-0 flex-1" : "flex-none")}>
            {/* Hauteur naturelle des modes, mesurée pour décider de la place restante. */}
            <div ref={extras.modes} className="flex flex-col gap-3.5">
            <h2 id="modes-title" className="font-display text-xl">
              Modes de jeu
            </h2>
            <ModeGrid modes={modes} onPlay={onPlay} busy={modesBusy ?? play.kind !== "ready"} />
            {/* Pas la place pour les deux à 1100×680 : un joueur qui a déjà des serveurs récents a déjà joué. */}
            {otherServers.length > 0 ? (
              <OtherServers servers={otherServers} onPlay={onPlayServer} busy={modesBusy ?? play.kind !== "ready"} onRename={onRenameServer} onError={onRenameError} />
            ) : (
              <p className="text-xs leading-snug text-muted-foreground">
                Clique sur un mode pour t'y connecter directement. «&nbsp;Jouer&nbsp;» ouvre le menu du jeu.
              </p>
            )}
            </div>
          </section>

          {extras.layout === "full" ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 items-start gap-2">
              <WeekActivity sessions={sessions} className="h-full" />
              <QuickLinks onOpenLink={onOpenLink} className="h-full" />
            </div>
          ) : (
            <div className="grid shrink-0 grid-cols-2 items-stretch gap-2">
              <WeekActivity sessions={sessions} size="medium" />
              <QuickLinks onOpenLink={onOpenLink} size="medium" />
            </div>
          )}

          <div ref={extras.bar} className="tile flex shrink-0 items-center gap-4 px-5 py-3 text-xs">
            <span className="shrink-0 text-muted-foreground">
              <span className="font-pixel text-[13px] text-foreground">{enabledMods.length}</span> mod{enabledMods.length > 1 ? "s" : ""} activé{enabledMods.length > 1 ? "s" : ""}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {enabledMods.length === 0 ? "Minecraft sans mods" : enabledMods.slice(0, 3).join(", ") + (enabledMods.length > 3 ? ` et ${enabledMods.length - 3} autres` : "")}
            </span>
            <button type="button" onClick={onManageMods} className="shrink-0 font-semibold text-accent hover:underline">
              Gérer les mods
            </button>
          </div>
        </div>

        <NewsList items={others} onOpen={onReadNews} onAll={onOpenNews} className="tile px-4 pt-4 pb-2" />
      </div>
    </main>
  );
}
