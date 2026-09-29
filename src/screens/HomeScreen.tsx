import { ArrowUpRight } from "lucide-react";

import { ModeHotbar } from "@/components/ModeHotbar";
import { NewsList } from "@/components/NewsList";
import { PlayButton } from "@/components/PlayButton";
import { SkinViewer } from "@/components/SkinViewer";
import { secondaryButton } from "@/lib/buttons";
import type { ModeStatus, NewsItem, PlayState } from "@/types";

type Props = {
  skin: string;
  /** Noms des mods activés, dans l'ordre du catalogue. */
  enabledMods: string[];
  onManageMods: () => void;
  play: PlayState;
  onPlay: () => void;
  minecraftVersion: string;
  modes: ModeStatus[];
  destination: string;
  /** Du plus récent au plus ancien : le premier article passe à la une. */
  news: NewsItem[];
  onOpenLink: (url: string) => void;
};

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function HomeScreen({ skin, enabledMods, onManageMods, play, onPlay, minecraftVersion, modes, destination, news, onOpenLink }: Props) {
  const [featured, ...others] = news;
  const online = modes.filter((mode) => mode.players !== null);
  const players = online.reduce((sum, mode) => sum + (mode.players ?? 0), 0);
  const destinationName = modes.find((mode) => mode.id === destination)?.name ?? "Lobby";

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <section className="relative flex h-[clamp(300px,46vh,440px)] shrink-0 items-end overflow-hidden">
        {featured?.image ? (
          <img src={featured.image} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgb(82_169_108/0.22),transparent_60%),radial-gradient(ellipse_at_30%_80%,rgb(217_164_65/0.14),transparent_55%)]" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-background via-background/75 to-background/20" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background" />

        <div className="relative flex w-full items-end justify-between gap-8 px-12 pb-8">
          {featured ? (
            <article className="flex max-w-[540px] flex-col gap-3">
              <p className="text-[11px] font-bold tracking-[0.14em] text-accent uppercase">
                À la une · <time dateTime={featured.publishedAt}>{date.format(new Date(featured.publishedAt))}</time>
              </p>
              <h1 className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.05] text-balance">{featured.title}</h1>
              <p className="line-clamp-2 text-[13px] leading-relaxed text-[#cfc8b8]">{featured.excerpt}</p>
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
              <SkinViewer skin={skin} width={170} height={270} />
            </div>
            <div className="flex flex-col items-center gap-3 pb-1">
              <PlayButton state={play} onPlay={onPlay} />
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={online.length > 0 ? "size-2 rounded-full bg-primary" : "size-2 rounded-full bg-destructive"} aria-hidden />
                {online.length > 0 ? (
                  <>
                    <span className="font-pixel text-[12px] text-foreground">{players}</span> joueurs en ligne
                  </>
                ) : (
                  "Serveur injoignable"
                )}
                <span aria-hidden>·</span>
                Minecraft <span className="font-pixel text-[12px] text-foreground">{minecraftVersion}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,420px)] gap-10 px-12 pt-5 pb-6">
        <section aria-labelledby="modes-title" className="flex min-h-0 flex-col gap-4">
          <h2 id="modes-title" className="font-display text-xl">
            Modes de jeu
          </h2>
          <ModeHotbar modes={modes} destination={destination} />
          <p className="max-w-[460px] text-xs leading-relaxed text-muted-foreground">
            «&nbsp;Jouer&nbsp;» te connecte au {destinationName}. Tu choisis ensuite ton mode en jeu, avec la boussole.
          </p>

          <div className="mt-2 flex max-w-[560px] items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 text-xs">
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
