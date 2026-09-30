import { ArrowUpRight, Newspaper } from "lucide-react";

import { HeroBackdrop } from "@/components/Backdrop";
import { ModeGrid } from "@/components/ModeGrid";
import { NewsList } from "@/components/NewsList";
import { PlayButton } from "@/components/PlayButton";
import { SkinViewer } from "@/components/SkinViewer";
import { VersionPicker } from "@/components/VersionPicker";
import { secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { GameVersion, ModeStatus, NewsItem, PlayState, SkinLook } from "@/types";

type Props = {
  look: SkinLook;
  /** Noms des mods activés, dans l'ordre du catalogue. */
  enabledMods: string[];
  onManageMods: () => void;
  play: PlayState;
  onPlay: () => void;
  versions: GameVersion[];
  selectedVersion: string;
  onSelectVersion: (id: string) => void;
  /** Ouvre d'office le choix de version (planche des maquettes). */
  versionOpen?: boolean;
  /** Statut du serveur (Server List Ping) ; `null` pendant la première mesure. */
  server: { online: boolean; players: number | null } | null;
  animateSkin?: boolean;
  modes: ModeStatus[];
  destination: string;
  /** Du plus récent au plus ancien : le premier article passe à la une. */
  news: NewsItem[];
  onOpenLink: (url: string) => void;
};

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function HomeScreen({ look, enabledMods, onManageMods, play, onPlay, versions, selectedVersion, onSelectVersion, versionOpen, server, animateSkin, modes, destination, news, onOpenLink }: Props) {
  const [featured, ...others] = news;
  const current = versions.find((version) => version.id === selectedVersion) ?? versions[0];
  const destinationName = modes.find((mode) => mode.id === destination)?.name ?? "Lobby";

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <section className="relative flex h-[clamp(290px,42vh,440px)] shrink-0 items-end overflow-hidden text-white">
        <HeroBackdrop />

        <div className="relative flex w-full items-end justify-between gap-8 px-12 pb-9">
          {featured ? (
            <article className="flex max-w-[540px] flex-col gap-3">
              <p className="mc-frame flex items-center gap-1.5 self-start bg-black/55 px-2.5 py-1 text-[11px] font-semibold [--mc-radius:6px]">
                <Newspaper className="size-3.5 text-accent" aria-hidden />À la une · <time dateTime={featured.publishedAt}>{date.format(new Date(featured.publishedAt))}</time>
              </p>
              <h1 className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.05] text-balance mc-text-shadow">{featured.title}</h1>
              <p className="line-clamp-2 text-[13px] leading-relaxed text-white/80">{featured.excerpt}</p>
              <button type="button" onClick={() => onOpenLink(featured.url)} className={`${secondaryButton} mt-1 self-start`}>
                Lire l'article
                <ArrowUpRight className="size-4" aria-hidden />
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
                onPlay={onPlay}
                version={`Minecraft ${current.id} · ${current.loader.split(" ")[0]}${current.joinable ? "" : " · solo"}`}
                picker={<VersionPicker versions={versions} selected={selectedVersion} onSelect={onSelectVersion} defaultOpen={versionOpen} />}
              />
              <p className="mc-frame flex h-9 items-center gap-2 bg-card/90 px-3.5 text-xs text-muted-foreground [--mc-radius:6px]">
                <span className={cn("size-2 rounded-full", server === null ? "animate-pulse bg-muted-foreground" : server.online ? "bg-primary" : "bg-destructive")} aria-hidden />
                {server === null ? (
                  <span>Recherche du serveur…</span>
                ) : server.online ? (
                  <>
                    <span className="font-semibold text-foreground">En ligne</span>
                    <span aria-hidden>·</span>
                    {server.players !== null && (
                      <>
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,420px)] gap-10 px-12 pt-4 pb-5">
        <section aria-labelledby="modes-title" className="flex min-h-0 flex-col gap-4">
          <h2 id="modes-title" className="font-display text-xl">
            Modes de jeu
          </h2>
          <ModeGrid modes={modes} destination={destination} />
          <p className="text-xs leading-snug text-muted-foreground">«&nbsp;Jouer&nbsp;» te connecte au {destinationName}, puis tu choisis ton mode avec la boussole.</p>

          <div className="mt-auto flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 text-xs">
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
        </section>

        <NewsList items={others} onOpen={onOpenLink} />
      </div>
    </main>
  );
}
