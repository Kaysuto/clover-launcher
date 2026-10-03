import { Play } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RecentServer } from "@/types";

/** `icon` : icône renvoyée par le serveur au ping, `null` s'il n'en a pas ou n'a pas encore répondu. */
export type OtherServer = RecentServer & { icon: string | null };

type Props = {
  servers: OtherServer[];
  onPlay: (address: string) => void;
  /** Jeu en préparation ou déjà lancé : les raccourcis ne lancent rien. */
  busy?: boolean;
};

/**
 * Serveurs hors Clover Games déjà rejoints en jeu, en une ligne de raccourcis Quick Play plus
 * discrets que les cartes des modes. Le nom vient de la liste des serveurs du jeu, l'adresse
 * s'affiche au survol. Comme sur les cartes des modes, l'icône laisse place à « lancer » au survol.
 */
export function OtherServers({ servers, onPlay, busy = false }: Props) {
  return (
    // Colonne étroite (fenêtre à 1100 px) : deux serveurs lisibles plutôt que trois noms tronqués.
    <section aria-labelledby="other-servers-title" className="@container flex min-w-0 items-center gap-2">
      <h3 id="other-servers-title" className="shrink-0 text-xs text-muted-foreground">
        Tes autres serveurs
      </h3>
      <ul className="flex min-w-0 gap-1.5">
        {servers.map((server, index) => (
          <li key={server.address} className={cn("flex min-w-0", index >= 2 && "@max-2xl:hidden")}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPlay(server.address)}
              title={server.address}
              aria-label={`Jouer sur ${server.name} (${server.address})`}
              className="group flex h-7 max-w-40 min-w-0 items-center gap-1.5 rounded-md border border-border bg-card pr-2 pl-1 text-xs font-semibold transition-colors enabled:hover:border-[#e9e3d4]/50 enabled:hover:bg-[#262119] disabled:cursor-default disabled:opacity-60"
            >
              {server.icon ? (
                <span className="relative size-5 shrink-0">
                  <img src={server.icon} alt="" className="size-5 rounded-[3px]" />
                  <span
                    aria-hidden
                    className="absolute inset-0 grid place-items-center rounded-[3px] bg-black/65 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:opacity-0"
                  >
                    <Play className="size-3 fill-current text-accent" />
                  </span>
                </span>
              ) : (
                <span className="grid size-5 shrink-0 place-items-center">
                  <Play aria-hidden className="size-3 fill-current text-muted-foreground transition-colors group-enabled:group-hover:text-accent" />
                </span>
              )}
              <span className="truncate">{server.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
