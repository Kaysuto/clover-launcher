import { Check, LoaderCircle, Plus, Search, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CapeFront } from "@/components/SkinFront";
import { SkinPose } from "@/components/SkinPose";
import { api } from "@/lib/api";
import { secondaryButton } from "@/lib/buttons";
import { capeAvailability, capeText, shortCount, textureHash } from "@/lib/capes";
import { cn } from "@/lib/utils";
import type { Cape, CapeWearers, CatalogueCape, CommunitySkin, PlayerLook, SkinModel, SkinOrder, SkinTag } from "@/types";

/** Ce que l'aperçu 3D essaie : un skin (avec la cape du joueur montré) ou une cape sur ton skin. */
export type Trial =
  | { kind: "skin"; name: string; texture: string; model: SkinModel; cape: string | null; savedId?: string }
  | { kind: "cape"; cape: CatalogueCape; owned: Cape | null };

type Props = {
  trial: Trial | null;
  onTrial: (trial: Trial) => void;
  /** Met un skin de côté dans Mes skins, sans le porter. */
  onSave: (skin: { texture: string; model: SkinModel; name: string }) => void;
  /** Capes du compte : seules celles-là peuvent être portées. */
  owned: Cape[];
  activeCapeId: string | null;
  /** Vue ouverte, choisie aussi depuis Mes skins (« Voir toutes les capes »). */
  view: "skins" | "capes";
  onView: (view: "skins" | "capes") => void;
};

const ORDERS: { id: SkinOrder; label: string }[] = [
  { id: "trending_24h", label: "Tendances" },
  { id: "trending_7d", label: "Cette semaine" },
  { id: "trending_30d", label: "Ce mois-ci" },
  { id: "most_used", label: "Populaires" },
  { id: "latest", label: "Nouveaux" },
];

/** Une page de laby.net ; moins de 36 skins : plus rien à charger. */
const PAGE_SIZE = 36;

const tablist = "flex gap-1 self-start rounded-lg border border-border bg-[#100e0b] p-1";
const tab = (selected: boolean) =>
  cn("rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors", selected ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground");
const selectedFrame = "outline-[3px] outline-offset-2 outline-[#e9e3d4] [outline-style:solid]";
const isPlayerName = (value: string) => /^[A-Za-z0-9_]{3,16}$/.test(value);

export function Discover({ trial, onTrial, onSave, owned, activeCapeId, view, onView }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Découverte" className={tablist}>
        {(["skins", "capes"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => onView(id)} className={tab(view === id)}>
            {id === "skins" ? "Skins" : "Capes"}
          </button>
        ))}
      </div>
      {view === "skins" ? <SkinsView trial={trial} onTrial={onTrial} onSave={onSave} /> : <CapesView trial={trial} onTrial={onTrial} owned={owned} activeCapeId={activeCapeId} />}
    </div>
  );
}

/** Statut d'obtention d'une cape, lisible d'un coup d'œil avant le texte. */
function AvailabilityBadge({ label, tone }: { label: string; tone: "open" | "event" | "closed" }) {
  return (
    <span
      className={cn(
        "flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
        tone === "open" && "bg-primary/15 text-primary",
        tone === "event" && "bg-[#d9a441]/15 text-[#e8bc5c]",
        tone === "closed" && "bg-white/[0.06] text-muted-foreground",
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone === "open" ? "bg-primary" : tone === "event" ? "bg-[#d9a441]" : "bg-muted-foreground")} />
      {label}
    </span>
  );
}

type Results = { key: string; skins: CommunitySkin[]; more: boolean } | { key: string; error: string };

function SkinsView({ trial, onTrial, onSave }: Pick<Props, "trial" | "onTrial" | "onSave">) {
  const [query, setQuery] = useState("");
  /** Skins mis de côté pendant cette visite. */
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState<SkinTag | null>(null);
  const [order, setOrder] = useState<SkinOrder>("trending_24h");
  const [tags, setTags] = useState<SkinTag[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [player, setPlayer] = useState<PlayerLook | null>(null);
  /** Dernière recherche lancée : une réponse plus ancienne arrivée en retard est ignorée. */
  const latest = useRef("");
  const input = tag?.name ?? query.trim();

  useEffect(() => {
    api.discoverTags().then(setTags).catch(() => {});
  }, []);

  const run = useCallback(async (searched: string, sorted: SkinOrder, offset: number) => {
    const key = `${sorted}:${searched}`;
    latest.current = key;
    setLoading(true);
    try {
      const page = await api.discoverSkins(searched, sorted, offset);
      if (latest.current !== key) return;
      setResults((current) => ({
        key,
        skins: offset > 0 && current && "skins" in current && current.key === key ? [...current.skins, ...page] : page,
        more: page.length === PAGE_SIZE,
      }));
    } catch (reason) {
      if (latest.current === key) setResults({ key, error: String(reason) });
    } finally {
      if (latest.current === key) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void run(input, order, 0), query && !tag ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [input, order, query, tag, run]);

  useEffect(() => {
    const name = query.trim();
    setPlayer(null);
    if (tag || !isPlayerName(name)) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      api.playerLook(name).then((look) => alive && setPlayer(look)).catch(() => {});
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, tag]);

  const skinName = tag?.label ?? (query.trim() || "Skin de la communauté");
  const tried = (texture: string) => trial?.kind === "skin" && trial.texture === texture;

  return (
    <>
      <label className="relative block max-w-[520px]">
        <span className="sr-only">Rechercher un skin ou un pseudo</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          maxLength={64}
          onChange={(event) => {
            setQuery(event.target.value);
            setTag(null);
          }}
          placeholder="Rechercher un skin ou un pseudo…"
          className="h-10 w-full rounded-md border border-border bg-[#100e0b] pr-3 pl-9 text-sm text-foreground outline-none select-text placeholder:text-muted-foreground/70 focus:border-accent"
        />
      </label>

      <div role="tablist" aria-label="Tri" className={cn(tablist, "flex-wrap")}>
        {ORDERS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={order === item.id} onClick={() => setOrder(item.id)} className={tab(order === item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <ul aria-label="Étiquettes" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5">
          {tags.map((item) => {
            const selected = tag?.name === item.name;
            return (
              <li key={item.name} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setTag(selected ? null : item);
                    setQuery("");
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors",
                    selected ? "border-primary bg-primary/15 text-foreground" : "border-border bg-[#100e0b] text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.emoji && <span aria-hidden>{item.emoji}</span>}
                  {item.label}
                  <span className="font-normal opacity-70">{shortCount(item.count)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {player && (
        <section aria-label={`Joueur ${player.name}`} className="flex max-w-[520px] items-center gap-4 rounded-lg border border-border bg-card p-3">
          {player.texture ? <SkinPose texture={player.texture} model={player.model} className="w-16 shrink-0" /> : <span className="w-16 shrink-0" aria-hidden />}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Joueur</p>
            <p className="truncate font-pixel text-[15px]">{player.name}</p>
            {!player.texture && <p className="text-xs text-muted-foreground">Porte un skin par défaut de Minecraft.</p>}
          </div>
          {player.texture && (
            <button
              type="button"
              onClick={() => onTrial({ kind: "skin", name: player.name, texture: player.texture!, model: player.model, cape: player.cape })}
              className={secondaryButton}
            >
              Essayer
            </button>
          )}
        </section>
      )}

      {results && "error" in results ? (
        <p role="alert" className="text-sm text-[#ffb3b0]">
          {results.error}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3" aria-busy={loading}>
            {results?.skins.map((skin) => (
              <li key={skin.hash} className="group relative aspect-[4/5]">
                <button
                  type="button"
                  aria-pressed={tried(skin.texture)}
                  aria-label={`Essayer ce skin, porté par ${shortCount(skin.uses)} joueurs`}
                  onClick={() => onTrial({ kind: "skin", name: skinName, texture: skin.texture, model: skin.model, cape: null })}
                  className={cn(
                    "absolute inset-0 overflow-hidden rounded-lg border border-border bg-card transition-colors hover:bg-[#241f19]",
                    tried(skin.texture) && selectedFrame,
                  )}
                >
                  <SkinPose
                    texture={skin.texture}
                    model={skin.model}
                    className="w-full drop-shadow-[0_6px_6px_rgb(0_0_0/0.45)] transition-transform duration-200 group-hover:scale-105"
                  />
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-[#cfc8b8]">
                    <Users className="size-3.5" aria-hidden />
                    {shortCount(skin.uses)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={kept.has(skin.hash)}
                  onClick={() => {
                    setKept((current) => new Set(current).add(skin.hash));
                    onSave({ texture: skin.texture, model: skin.model, name: skinName });
                  }}
                  aria-label={kept.has(skin.hash) ? "Déjà dans Mes skins" : "Mettre de côté dans Mes skins"}
                  title={kept.has(skin.hash) ? "Dans Mes skins" : "Mettre de côté"}
                  className={cn(
                    "absolute top-2 right-2 grid size-7 place-items-center rounded-md transition-[opacity,background-color]",
                    kept.has(skin.hash)
                      ? "bg-primary text-primary-foreground"
                      : "bg-black/60 text-foreground opacity-0 group-hover:opacity-100 hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100",
                  )}
                >
                  {kept.has(skin.hash) ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Plus className="size-4" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          {results && results.skins.length === 0 && !loading && <p className="text-sm text-muted-foreground">Aucun skin trouvé.</p>}
          {loading && <LoaderCircle className="size-5 animate-spin self-center text-muted-foreground" aria-label="Chargement" />}
          {results?.more && !loading && (
            <button type="button" onClick={() => void run(input, order, results.skins.length)} className={cn(secondaryButton, "self-center")}>
              Voir plus
            </button>
          )}
        </>
      )}
    </>
  );
}

function CapesView({ trial, onTrial, owned, activeCapeId }: Pick<Props, "trial" | "onTrial" | "owned" | "activeCapeId">) {
  const [capes, setCapes] = useState<CatalogueCape[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wearers, setWearers] = useState<{ id: string; data: CapeWearers | null; error?: string } | null>(null);
  const selected = trial?.kind === "cape" ? trial.cape : null;

  useEffect(() => {
    api.discoverCapes().then(setCapes).catch((reason) => setError(String(reason)));
  }, []);

  useEffect(() => {
    if (!selected?.labyId) return setWearers(null);
    const id = selected.id;
    setWearers({ id, data: null });
    let alive = true;
    api
      .capeWearers(selected.labyId)
      .then((data) => alive && setWearers({ id, data }))
      .catch((reason) => alive && setWearers({ id, data: null, error: String(reason) }));
    return () => {
      alive = false;
    };
  }, [selected?.id, selected?.labyId]);

  const ownedCape = (cape: CatalogueCape) => owned.find((mine) => cape.hashes.includes(textureHash(mine.texture))) ?? null;

  const tryPlayer = async (name: string) => {
    const look = await api.playerLook(name).catch(() => null);
    if (look?.texture) onTrial({ kind: "skin", name: look.name, texture: look.texture, model: look.model, cape: look.cape });
  };

  if (error) {
    return (
      <p role="alert" className="text-sm text-[#ffb3b0]">
        {error}
      </p>
    );
  }
  if (!capes) return <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-label="Chargement" />;

  const text = selected && capeText(selected.id, selected.title);
  const availability = text && capeAvailability(text.status);
  return (
    <>
      {selected && text && (
        <section aria-label={text.name} className="flex max-w-[640px] flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-4">
            <CapeFront texture={selected.texture} scale={5} className="mc-slot shrink-0" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="font-display text-xl leading-none">{text.name}</h3>
              {availability && <AvailabilityBadge {...availability} />}
              <p className="text-sm">{text.how}</p>
              <p className="text-xs text-muted-foreground">{shortCount(selected.owners)} propriétaires recensés</p>
              {ownedCape(selected) && (
                <p className="flex items-center gap-1 text-xs font-semibold text-primary">
                  <Check className="size-3.5" aria-hidden />
                  {ownedCape(selected)!.id === activeCapeId ? "Tu la portes" : "Tu la possèdes"}
                </p>
              )}
            </div>
          </div>
          {selected.labyId && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-sm font-bold">
                Qui la porte
                {wearers?.id === selected.id && wearers.data && <span className="ml-1.5 font-normal text-muted-foreground">{shortCount(wearers.data.count)} joueurs</span>}
              </p>
              {wearers?.id === selected.id && wearers.error && <p className="text-xs text-muted-foreground">{wearers.error}</p>}
              {wearers?.id === selected.id && !wearers.data && !wearers.error && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Chargement" />}
              {wearers?.id === selected.id && wearers.data && (
                <ul className="flex flex-wrap gap-1.5">
                  {wearers.data.players.map((player) => (
                    <li key={player.uuid}>
                      <button
                        type="button"
                        title={`Essayer le skin de ${player.name}`}
                        onClick={() => void tryPlayer(player.name)}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-[#100e0b] py-1 pr-2.5 pl-1 text-xs font-semibold transition-colors hover:bg-secondary"
                      >
                        <img src={`https://minotar.net/helm/${encodeURIComponent(player.name)}/32.png`} alt="" width={20} height={20} className="pixelated size-5 rounded-[3px]" />
                        {player.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-primary" />
          Encore disponible
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full bg-[#d9a441]" />
          Seulement sur place
        </span>
        <span>Les autres ne s'obtiennent plus, ou sont réservées.</span>
      </p>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
        {capes.map((cape) => {
          const mine = ownedCape(cape);
          const { name, status } = capeText(cape.id, cape.title);
          const obtainable = capeAvailability(status)?.tone;
          const active = selected?.id === cape.id;
          return (
            <li key={cape.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onTrial({ kind: "cape", cape, owned: mine })}
                className={cn("mc-slot relative flex w-full flex-col items-center gap-1.5 px-1.5 pt-3 pb-2", active && selectedFrame)}
              >
                {mine && (
                  <span title="Tu la possèdes" className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" strokeWidth={3} aria-label="Possédée" />
                  </span>
                )}
                {!mine && (obtainable === "open" || obtainable === "event") && (
                  <span
                    title={obtainable === "open" ? "Encore disponible" : "Seulement sur place"}
                    className={cn("absolute top-2 left-2 size-2 rounded-full", obtainable === "open" ? "bg-primary" : "bg-[#d9a441]")}
                  />
                )}
                <CapeFront texture={cape.texture} scale={4} />
                <span className="w-full truncate text-center text-[11px] font-semibold">{name}</span>
                <span className="text-[10px] text-muted-foreground">{shortCount(cape.owners)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
