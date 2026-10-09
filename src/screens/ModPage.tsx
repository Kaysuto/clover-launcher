import { ArrowLeft, Download, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { ModIcon } from "@/components/ModIcon";
import { secondaryButton } from "@/lib/buttons";
import { cn } from "@/lib/utils";
import type { ModrinthProject } from "@/types";

const number = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/** Mise en forme des textes longs, reprise de la fiche produit du site. */
const prose = cn(
  "prose prose-sm prose-invert max-w-none",
  "prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
  "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
  "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none",
  "prose-pre:border prose-pre:border-border prose-pre:bg-muted",
  "prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground",
  "prose-img:inline-block prose-img:rounded-xl prose-hr:border-border prose-li:my-1.5",
);

type Props = {
  /** Identifiant ou slug Modrinth. */
  project: string;
  name: string;
  icon: string | null;
  version: string | null;
  /** Résumé du catalogue, rédigé en français ; celui de Modrinth sinon. */
  summary?: string;
  /** Avertissement propre au mod : pas disponible, mauvaise version… */
  notice?: ReactNode;
  /** Interrupteur et boutons du mod, fournis par l'écran Mods. */
  actions: ReactNode;
  load: (project: string) => Promise<ModrinthProject>;
  onBack: () => void;
  onOpenLink: (url: string) => void;
};

type State = { kind: "loading" } | { kind: "ready"; page: ModrinthProject } | { kind: "error"; message: string };

/** Page d'un mod : ce que le launcher sait déjà, complété par sa page Modrinth (galerie, liens). */
export function ModPage({ project, name, icon, version, summary, notice, actions, load, onBack, onOpenLink }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState({ kind: "loading" });
    load(project).then(
      (page) => current && setState({ kind: "ready", page }),
      (reason) => current && setState({ kind: "error", message: String(reason) }),
    );
    return () => {
      current = false;
    };
  }, [project, load, attempt]);

  const page = state.kind === "ready" ? state.page : null;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Mods
      </button>

      <header className="mt-4 flex items-center gap-5">
        <ModIcon src={page?.iconUrl ?? icon} className="size-16 [--mc-radius:8px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="truncate font-display text-[30px] leading-none">{name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {page?.author && <span>par {page.author}</span>}
            {page && (
              <span className="flex items-center gap-1">
                <Download className="size-3" aria-hidden />
                {number.format(page.downloads)} téléchargements
              </span>
            )}
            {version && <span className="font-pixel text-[10px] text-muted-foreground/70">{version}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </header>

      {notice}

      {(summary ?? page?.description) && <p className="mt-5 max-w-[70ch] text-sm leading-relaxed">{summary ?? page?.description}</p>}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_220px] items-start gap-8">
        <div className="flex min-w-0 flex-col gap-8">
        <section aria-label="Images" aria-busy={state.kind === "loading"}>
          {state.kind === "loading" && (
            <p className="flex aspect-video items-center justify-center gap-2 rounded-lg border border-border bg-[#100e0b] text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Chargement de la page Modrinth…
            </p>
          )}
          {state.kind === "error" && (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg border border-border bg-[#100e0b] px-6 text-center">
              <p className="text-sm text-[#f3a19e]">Impossible de charger la page Modrinth de ce mod : {state.message}</p>
              <button type="button" onClick={() => setAttempt((count) => count + 1)} className={secondaryButton}>
                <RotateCcw className="size-4" aria-hidden />
                Réessayer
              </button>
            </div>
          )}
          {page && page.gallery.length > 0 && <Gallery images={page.gallery} />}
        </section>

        {page?.descriptionHtml && (
          <section aria-labelledby="mod-description" className="flex flex-col gap-3">
            <h2 id="mod-description" className="font-display text-xl">
              Description
            </h2>
            <div
              className={cn(prose, "select-text")}
              // HTML nettoyé côté Rust (`modrinth::description_html`). Les liens s'ouvrent dans le
              // navigateur : suivis ici, ils remplaceraient le launcher dans sa propre fenêtre.
              dangerouslySetInnerHTML={{ __html: page.descriptionHtml }}
              onClick={(event) => openLink(event, onOpenLink)}
              onAuxClick={(event) => openLink(event, onOpenLink)}
            />
          </section>
        )}
        </div>

        {page && <Details page={page} version={version} onOpenLink={onOpenLink} />}
      </div>
    </div>
  );
}

function openLink(event: React.MouseEvent, onOpenLink: (url: string) => void) {
  const link = (event.target as Element).closest("a");
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute("href") ?? "";
  if (/^https?:\/\//.test(href) && event.type === "click") onOpenLink(href);
}

function Gallery({ images }: { images: ModrinthProject["gallery"] }) {
  const [index, setIndex] = useState(0);
  const image = images[Math.min(index, images.length - 1)];
  return (
    <div className="flex flex-col gap-2.5">
      <figure className="overflow-hidden rounded-lg border border-border bg-[#100e0b]">
        <img src={image.rawUrl ?? image.url} alt={image.title ?? ""} className="aspect-video w-full object-contain" />
        {image.title && <figcaption className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{image.title}</figcaption>}
      </figure>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto p-1">
          {images.map((other, position) => (
            <li key={other.url} className="shrink-0">
              <button
                type="button"
                aria-label={other.title ?? `Image ${position + 1}`}
                aria-pressed={other === image}
                onClick={() => setIndex(position)}
                className={cn(
                  "block overflow-hidden rounded-md border border-border opacity-60 transition-opacity hover:opacity-100",
                  other === image && "opacity-100 outline-2 outline-offset-2 outline-[#e9e3d4] outline-solid",
                )}
              >
                <img src={other.url} alt="" loading="lazy" className="h-14 w-24 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Details({ page, version, onOpenLink }: { page: ModrinthProject; version: string | null; onOpenLink: (url: string) => void }) {
  // Licence maison (« LicenseRef-Polyform-Shield-1.0.0 ») : Modrinth ne donne pas de nom.
  const license = page.license && (page.license.name || page.license.id.replace(/^LicenseRef-/, "").replace(/-/g, " "));
  const links: [string, string | null][] = [
    ["Page Modrinth", `https://modrinth.com/mod/${page.slug}`],
    ["Code source", page.sourceUrl],
    ["Signaler un bug", page.issuesUrl],
    ["Wiki", page.wikiUrl],
    ["Discord", page.discordUrl],
  ];

  return (
    <aside className="flex flex-col gap-5">
      <dl className="flex flex-col gap-3 text-[13px]">
        {version && <Info label="Version installée">{version}</Info>}
        {license && <Info label="Licence">{license}</Info>}
        <Info label="Mis à jour">{day.format(new Date(page.updated))}</Info>
      </dl>
      <ul className="flex flex-col gap-1.5">
        {links.map(([label, url]) => url && (
          <li key={label}>
            <button type="button" onClick={() => onOpenLink(url)} className={cn(secondaryButton, "w-full justify-start")}>
              <ExternalLink className="size-4" aria-hidden />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-semibold">{children}</dd>
    </div>
  );
}
