import { ArrowUpRight } from "lucide-react";

import monogram from "@/assets/brand/monogram.webp";
import { Backdrop } from "@/components/Backdrop";

export type LoginState = { kind: "idle" } | { kind: "waiting" } | { kind: "error"; message: string };

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-[18px]" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginScreen({ state, onLogin, onOpenLink }: { state: LoginState; onLogin: () => void; onOpenLink: (url: string) => void }) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden pb-10">
      <Backdrop />

      <img src={monogram} alt="Clover Games" width={72} height={72} className="relative drop-shadow-[0_10px_20px_rgb(0_0_0/0.6)]" />

      <div className="relative mt-6 flex w-[440px] flex-col items-center gap-5 text-center">
        <h1 className="font-display text-[30px] leading-none">Connecte-toi pour jouer</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Utilise le compte Microsoft qui possède Minecraft: Java Edition. La connexion se fait dans ton navigateur&nbsp;: le launcher ne voit jamais ton mot de passe.
        </p>

        <button
          type="button"
          onClick={onLogin}
          disabled={state.kind === "waiting"}
          className="mc-bevel flex h-12 w-full items-center justify-center gap-3 bg-foreground text-[15px] font-bold text-background disabled:opacity-70"
        >
          <MicrosoftLogo />
          {state.kind === "waiting" ? "Connexion dans ton navigateur…" : "Se connecter avec Microsoft"}
        </button>

        <div className="min-h-12" aria-live="polite">
          {state.kind === "waiting" && <p className="text-xs text-muted-foreground">Termine la connexion dans l'onglet qui vient de s'ouvrir, puis reviens ici.</p>}
          {state.kind === "error" && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-left text-[13px] leading-snug text-[#f3a19e]">
              {state.message}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpenLink("https://www.minecraft.net/fr-fr/store/minecraft-java-bedrock-edition-pc")}
        className="absolute bottom-6 flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        Pas encore Minecraft&nbsp;? Acheter Minecraft: Java Edition
        <ArrowUpRight className="size-3.5" aria-hidden />
      </button>
    </main>
  );
}
