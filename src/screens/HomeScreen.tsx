import logo from "@/assets/brand/logo.webp";
import { ModeHotbar } from "@/components/ModeHotbar";
import { NewsList } from "@/components/NewsList";
import { PlayButton } from "@/components/PlayButton";
import { SkinViewer } from "@/components/SkinViewer";
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
  news: NewsItem[];
  onOpenLink: (url: string) => void;
};

export function HomeScreen({ skin, enabledMods, onManageMods, play, onPlay, minecraftVersion, modes, destination, news, onOpenLink }: Props) {
  const online = modes.filter((mode) => mode.players !== null);
  const players = online.reduce((sum, mode) => sum + (mode.players ?? 0), 0);
  const destinationName = modes.find((mode) => mode.id === destination)?.name ?? "Lobby";

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <section className="relative h-[300px] shrink-0 overflow-hidden">
        {/* Halo : le logo lui-même, flouté, sert de lumière d'ambiance. */}
        <img src={logo} alt="" aria-hidden className="absolute top-1/2 left-1/2 w-[760px] -translate-x-1/2 -translate-y-1/2 opacity-45 blur-[70px] saturate-150" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />

        <img src={logo} alt="Clover Games" className="absolute top-7 left-1/2 w-[420px] -translate-x-1/2 drop-shadow-[0_18px_30px_rgb(0_0_0/0.6)]" />

        <div className="absolute bottom-0 left-12">
          <div className="absolute bottom-7 left-1/2 h-4 w-28 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[6px]" aria-hidden />
          <SkinViewer skin={skin} width={190} height={290} />
        </div>

        <div className="absolute top-[74px] right-12 flex flex-col items-center gap-4">
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
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_390px] gap-10 px-12 pt-3 pb-6">
        <section aria-labelledby="modes-title" className="flex flex-col gap-4">
          <h2 id="modes-title" className="font-display text-xl">
            Modes de jeu
          </h2>
          <ModeHotbar modes={modes} destination={destination} />
          <p className="max-w-[460px] text-xs leading-relaxed text-muted-foreground">
            «&nbsp;Jouer&nbsp;» te connecte au {destinationName}. Tu choisis ensuite ton mode en jeu, avec la boussole.
          </p>

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

        <NewsList items={news} onOpen={onOpenLink} />
      </div>
    </main>
  );
}
