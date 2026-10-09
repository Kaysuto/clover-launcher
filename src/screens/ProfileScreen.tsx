import { ArrowRight, ArrowUpRight, Check, CircleAlert, Clock, Coins, Copy, Flame, Medal, PenLine, Play, RotateCcw, Share2, Shirt, Star, Swords, Trophy, Users, Vote } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { type CardData, cardFacts, ProfileCardDialog } from "@/components/ProfileCard";
import { CapeFront } from "@/components/SkinFront";
import { SkinViewer } from "@/components/SkinViewer";
import { api } from "@/lib/api";
import { secondaryButton } from "@/lib/buttons";
import { ownedCapeText, textureHash } from "@/lib/capes";
import { locatorBarColor } from "@/lib/locator";
import { modeArt } from "@/lib/mode-art";
import { formatDuration } from "@/lib/play-history";
import { cn, fold } from "@/lib/utils";
import type { CatalogueCape, Friend, ModeStats, PlaySession, PlayerStats, Profile, SkinLook } from "@/types";

const SITE_URL = "https://clovergames.fr";
/** Une cape que moins de joueurs recensés possèdent est marquée rare. */
const RARE_BELOW = 10_000;

const number = new Intl.NumberFormat("fr-FR");
const ratio = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });

type Mode = { id: string; name: string; icon: string | null; quickPlay: boolean };

type Props = {
  profile: Profile;
  look: SkinLook;
  animateSkin?: boolean;
  /** Parties de toutes les instances ; `null` pendant la lecture. */
  sessions: PlaySession[] | null;
  skinCount: number;
  /** Modes du manifeste : nom, icône et Quick Play. */
  modes: Mode[];
  /** Jeu en préparation ou déjà lancé : « Jouer » ne lance rien. */
  playBusy: boolean;
  onPlay: (mode?: string) => void;
  onRename: () => void;
  onOpenSkins: () => void;
  onOpenLink: (url: string) => void;
  /** Sources de données, remplacées par des exemples sur la planche. */
  services?: Pick<typeof api, "playerStats" | "nameChangeInfo" | "discoverCapes" | "savePng">;
};

/** « il y a 2 heures », « hier », « il y a 3 jours ». */
function ago(milliseconds: number) {
  const minutes = Math.round((Date.now() - milliseconds) / 60_000);
  if (minutes < 60) return relative.format(-Math.max(1, minutes), "minute");
  if (minutes < 24 * 60) return relative.format(-Math.round(minutes / 60), "hour");
  return relative.format(-Math.round(minutes / (24 * 60)), "day");
}

const place = (rank: number) => (rank === 1 ? "1er" : `${rank}e`);
const kd = (kills: number, deaths: number) => ratio.format(deaths ? kills / deaths : kills);

function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const id = `profile-${fold(title).replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-xl">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-lg bg-white/[0.04]", className)} />;
}

/**
 * Barre d'expérience du jeu : niveau en chiffres verts cernés de noir au-dessus d'une barre verte
 * à crans, remplie selon l'XP gagnée dans le niveau.
 */
function XpBar({ level, into, needed }: { level: number; into: number; needed: number }) {
  const progress = Math.min(1, into / needed);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="font-pixel text-[30px] leading-none text-[#80ff20] [text-shadow:2px_0_0_#000,-2px_0_0_#000,0_2px_0_#000,0_-2px_0_#000,2px_2px_0_#000]">{level}</span>
      <div
        role="progressbar"
        aria-label={`Niveau ${level}`}
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={into}
        className="relative h-3.5 w-full overflow-hidden rounded-[3px] border-2 border-black bg-[#1d1b17]"
      >
        <div
          className="absolute inset-y-0 left-0 bg-linear-to-b from-[#a6ff5c] via-[#80ff20] to-[#4f9d14] transition-[width] duration-700 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Les crans de la barre du jeu. */}
        <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(100%/18-2px),rgb(0_0_0/0.55)_calc(100%/18-2px),rgb(0_0_0/0.55)_calc(100%/18))]" />
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/25" />
      </div>
    </div>
  );
}

/** Chiffre clé dans une case d'inventaire. */
function Slot({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: ReactNode; detail?: ReactNode; tone?: string }) {
  return (
    <div className="mc-slot flex min-w-0 flex-col gap-2 px-3.5 pt-3 pb-3">
      <span className={cn("flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground [&>svg]:size-3.5", tone)}>
        {icon}
        {label}
      </span>
      <span className="truncate font-display text-[22px] leading-none">{value}</span>
      {detail && <span className="truncate text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate font-display text-xl leading-none tabular-nums">{value}</span>
      <span className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function modeNumbers(mode: ModeStats): { badge: ReactNode; stats: { label: string; value: ReactNode }[]; season: boolean } {
  if (mode.id === "bedwars") {
    const s = mode.stats;
    return {
      season: true,
      badge: (
        <span title={`${s.stars} étoiles BedWars`} className="flex shrink-0 items-center gap-0.5 rounded bg-[#d9a441]/12 px-1.5 py-px text-[11px] font-bold text-[#e8bc5c]">
          <Star className="size-3 fill-current" aria-hidden />
          {s.stars}
        </span>
      ),
      stats: [
        { label: "Victoires", value: number.format(s.wins) },
        { label: "Lits détruits", value: number.format(s.beds) },
        { label: "Kills finaux", value: number.format(s.finalKills) },
        { label: "Ratio V / D", value: kd(s.wins, s.losses) },
      ],
    };
  }
  if (mode.id === "practice") {
    const s = mode.stats;
    return {
      season: true,
      badge: null,
      stats: [
        { label: "ELO (saison)", value: s.rating === null ? "—" : number.format(s.rating) },
        { label: "Record", value: s.peakRating === null ? "—" : number.format(s.peakRating) },
        { label: "Victoires", value: number.format(s.wins) },
        { label: "Ratio K / M", value: kd(s.kills, s.deaths) },
      ],
    };
  }
  const s = mode.stats;
  return {
    season: false,
    badge: null,
    stats: [
      { label: "Kills", value: number.format(s.kills) },
      { label: "Morts", value: number.format(s.deaths) },
      { label: "Ratio K / M", value: kd(s.kills, s.deaths) },
      { label: "Meilleure série", value: number.format(s.bestStreak) },
    ],
  };
}

function ModeRow({ mode, info }: { mode: ModeStats; info: Mode | undefined }) {
  const { badge, stats, season } = modeNumbers(mode);
  const name = info?.name ?? mode.id;
  return (
    <li className="grid grid-cols-[minmax(140px,190px)_minmax(0,1fr)] items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="mc-slot grid size-11 shrink-0 place-items-center [--mc-radius:6px]">
          {info?.icon ? <img src={info.icon} alt="" className="pixelated size-7" /> : <Swords className="size-5 text-muted-foreground" aria-hidden />}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold">{name}</span>
            {badge}
          </span>
          {mode.rank !== null ? (
            <span
              title={season ? "Classement de la saison en cours" : "Classement général"}
              className={cn(
                "flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold",
                mode.rank <= 10 ? "bg-[#d9a441]/15 text-[#e8bc5c]" : "bg-white/[0.06] text-muted-foreground",
              )}
            >
              <Medal className="size-3" aria-hidden />
              {place(mode.rank)}
              {season ? " de la saison" : " du classement"}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Hors classement</span>
          )}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>
    </li>
  );
}

const STAT_MODES = ["bedwars", "practice", "skypvp", "pvpsoup"];

/** Ami : tête, pseudo, où il est ; « Rejoindre » s'il l'accepte et que son serveur a une adresse directe. */
function FriendRow({ friend, mode, playBusy, onJoin }: { friend: Friend; mode: Mode | undefined; playBusy: boolean; onJoin: (mode: string) => void }) {
  const where = friend.online
    ? friend.server
      ? `En ligne · ${mode?.name ?? friend.server}`
      : "En ligne"
    : friend.lastSeen
      ? `Vu ${ago(friend.lastSeen)}`
      : "Hors ligne";
  const joinable = friend.canJoin && mode?.quickPlay === true;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <span className="relative shrink-0">
        <img src={`https://minotar.net/helm/${encodeURIComponent(friend.name)}/48.png`} alt="" width={36} height={36} className={cn("pixelated size-9 rounded-[4px]", !friend.online && "opacity-60 grayscale-[35%]")} />
        {friend.online && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card bg-primary" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-bold">{friend.name}</span>
          {friend.favorite && <Star className="size-3 shrink-0 fill-[#e8bc5c] text-[#e8bc5c]" aria-label="Favori" />}
        </span>
        <span className={cn("truncate text-[11px]", friend.online ? "text-primary" : "text-muted-foreground")}>
          {where}
          {friend.status && <span className="text-muted-foreground italic"> · {friend.status}</span>}
        </span>
      </span>
      {joinable && mode && (
        <button
          type="button"
          disabled={playBusy}
          onClick={() => onJoin(mode.id)}
          title={`Rejoindre ${friend.name} sur ${mode.name}`}
          className="flex shrink-0 items-center gap-1 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary transition-colors enabled:hover:bg-primary/20 disabled:opacity-60"
        >
          <Play className="size-3 fill-current" aria-hidden />
          Rejoindre
        </button>
      )}
    </li>
  );
}

export function ProfileScreen({ profile, look, animateSkin, sessions, skinCount, modes, playBusy, onPlay, onRename, onOpenSkins, onOpenLink, services = api }: Props) {
  const [stats, setStats] = useState<{ uuid: string; data: PlayerStats } | { uuid: string; error: string } | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueCape[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [card, setCard] = useState<CardData | null>(null);
  const uuid = profile.uuid;

  const load = useCallback(() => {
    setStats(null);
    services
      .playerStats()
      .then((data) => setStats({ uuid, data }))
      .catch((reason) => setStats({ uuid, error: String(reason) }));
  }, [services, uuid]);

  useEffect(() => {
    load();
    setCreatedAt(null);
    services
      .nameChangeInfo()
      .then((info) => setCreatedAt(info.createdAt ?? null))
      .catch(() => {});
  }, [load, services]);

  useEffect(() => {
    services.discoverCapes().then(setCatalogue).catch(() => {});
  }, [services]);

  const current = stats?.uuid === uuid ? stats : null;
  const data = current && "data" in current ? current.data : null;
  const error = current && "error" in current ? current.error : null;
  const loading = current === null;
  const color = locatorBarColor(uuid);
  const modeInfo = (id: string) => modes.find((mode) => fold(mode.id) === fold(id) || fold(mode.name) === fold(id));
  const played = data?.modes ?? [];
  const untried = modes.filter((mode) => STAT_MODES.includes(mode.id) && !played.some((entry) => entry.id === mode.id));
  const newcomer = data !== null && !data.presence && !data.level && !data.playtime && played.length === 0;
  const capes = profile.capes ?? [];
  const owners = (url: string) => catalogue?.find((cape) => cape.hashes.includes(textureHash(url)))?.owners ?? null;
  const topServer = data?.playtime?.servers[0]?.seconds ?? 1;

  const friends = data?.friends ?? null;
  const onlineFriends = friends?.filter((friend) => friend.online).length ?? 0;

  /** Meilleur classement parmi les modes, pour la carte. */
  const bestRank = played
    .filter((mode) => mode.rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((mode) => ({ rank: mode.rank!, mode: modeInfo(mode.id)?.name ?? mode.id }))[0] ?? null;
  /** Mode le plus joué qui a une illustration (le Lobby n'en est pas un), pour la carte. */
  const favoriteMode =
    [...(data?.playtime?.servers ?? [])]
      .sort((a, b) => b.seconds - a.seconds)
      .map((server) => modeInfo(server.id))
      .find((mode) => mode && fold(mode.id) !== "lobby" && modeArt(mode.id, mode.icon)) ?? null;
  const share = () =>
    setCard({
      name: profile.name,
      texture: look.texture,
      model: look.model,
      cape: look.cape?.texture ?? null,
      grade: data?.grade ?? null,
      level: data?.level ?? null,
      since: data?.presence?.firstSeen ?? null,
      favorite: favoriteMode && {
        name: favoriteMode.name,
        art: [...new Set([modeArt(favoriteMode.id, favoriteMode.icon), modeArt(favoriteMode.id, null)])].filter((url): url is string => url !== null),
      },
      facts: cardFacts({
        playtime: data?.playtime?.total ?? null,
        bestRank,
        votes: data?.votes?.total ?? null,
        streak: data?.streak?.current ?? null,
        achievements: data?.achievements ?? null,
      }),
    });

  const copyUuid = () => {
    void navigator.clipboard.writeText(uuid).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <main className="flex min-h-0 flex-1">
      <aside className="relative flex w-[clamp(280px,30vw,380px)] shrink-0 flex-col items-center justify-center gap-3 border-r border-border bg-[radial-gradient(ellipse_at_50%_45%,rgb(82_169_108/0.12),transparent_65%)] px-4">
        <span className="rounded-[3px] bg-black/50 px-2 py-0.5 font-pixel text-[15px] text-white">{profile.name}</span>
        <div className="relative">
          <div aria-hidden className="absolute bottom-9 left-1/2 h-5 w-32 -translate-x-1/2 rounded-[50%] bg-black/60 blur-[7px]" />
          <SkinViewer look={look} width={230} height={360} animate={animateSkin} />
        </div>
        {data?.presence?.online ? (
          <span className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
              <span className="relative size-2 rounded-full bg-primary" />
            </span>
            En ligne sur {modeInfo(data.presence.online)?.name ?? data.presence.online}
          </span>
        ) : data?.presence?.lastSeen ? (
          <span className="text-xs text-muted-foreground">
            Vu {ago(data.presence.lastSeen)}
            {data.presence.lastServer && ` sur ${modeInfo(data.presence.lastServer)?.name ?? data.presence.lastServer}`}
          </span>
        ) : null}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-10 pt-8 pb-10">
        {/* Identité */}
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[34px] leading-none">{profile.name}</h1>
            {data?.grade && (
              <span
                className="rounded-md border px-2 py-0.5 text-xs font-bold"
                style={{ color: data.grade.color, borderColor: `${data.grade.color}55`, backgroundColor: `${data.grade.color}1f` }}
              >
                {data.grade.label}
              </span>
            )}
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
            {data?.presence?.firstSeen && (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Sur Clover Games depuis le</dt>
                <dd className="font-semibold">{longDate.format(new Date(data.presence.firstSeen))}</dd>
              </div>
            )}
            {createdAt && (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">Compte Minecraft créé le</dt>
                <dd className="font-semibold">{longDate.format(new Date(createdAt))}</dd>
              </div>
            )}
            {color && (
              <div className="flex items-center gap-1.5" title="Couleur de ton point sur la barre de localisation, en jeu">
                <dt className="text-muted-foreground">Barre de localisation</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  <span aria-hidden className="size-3 rounded-full border border-black/60" style={{ backgroundColor: color }} />
                  {color}
                </dd>
              </div>
            )}
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onRename} className={secondaryButton}>
              <PenLine className="size-4" aria-hidden />
              Changer de pseudo
            </button>
            <button type="button" onClick={onOpenSkins} className={secondaryButton}>
              <Shirt className="size-4" aria-hidden />
              Modifier le skin
            </button>
            <button type="button" onClick={share} disabled={!look.texture} className={secondaryButton}>
              <Share2 className="size-4" aria-hidden />
              Partager ma carte
            </button>
            <button type="button" onClick={() => onOpenLink(`${SITE_URL}/player/${encodeURIComponent(profile.name)}`)} className={secondaryButton}>
              Voir sur le site
              <ArrowUpRight className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={copyUuid}
              title="Copier l'UUID"
              className="ml-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors select-text hover:bg-white/[0.04] hover:text-foreground"
            >
              {copied ? <Check className="size-3.5 text-primary" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
              {copied ? "UUID copié" : uuid}
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mt-6 flex items-center gap-2.5 rounded-lg border border-[#ffb3b0]/25 bg-[#ffb3b0]/[0.07] px-3 py-2 text-sm text-[#ffb3b0]">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">Statistiques Clover Games indisponibles. {error}</span>
            <button type="button" onClick={load} className="flex shrink-0 items-center gap-1 font-semibold underline-offset-2 hover:underline">
              <RotateCcw className="size-3.5" aria-hidden />
              Réessayer
            </button>
          </div>
        )}

        {newcomer && (
          <div className="mt-6 flex items-center gap-4 rounded-lg border border-primary/25 bg-primary/[0.07] px-4 py-3.5">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-bold">Tu n'as pas encore joué sur Clover Games.</span> Tes niveaux, classements et temps de jeu apparaîtront ici dès ta première partie.
            </span>
            <button type="button" disabled={playBusy} onClick={() => onPlay()} className={cn(secondaryButton, "shrink-0")}>
              <Play className="size-4 fill-current" aria-hidden />
              Jouer
            </button>
          </div>
        )}

        {/* Progression */}
        {(loading || data) && !error && !newcomer && (
          <Section title="Progression" className="mt-8">
            {loading ? (
              <>
                <Skeleton className="h-[76px]" />
                <div className="grid grid-cols-4 gap-2.5">
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="h-[86px]" />
                  ))}
                </div>
              </>
            ) : (
              data && (
                <>
                  {data.level && (
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-5 pt-3 pb-3.5">
                      <XpBar level={data.level.level} into={data.level.into} needed={data.level.needed} />
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground tabular-nums">
                            {number.format(data.level.into)} / {number.format(data.level.needed)} XP
                          </span>{" "}
                          · encore {number.format(data.level.needed - data.level.into)} XP avant le niveau {data.level.level + 1}
                        </span>
                        {data.level.rank !== null && (
                          <span className={cn("flex items-center gap-1 font-bold", data.level.rank <= 10 ? "text-[#e8bc5c]" : "text-muted-foreground")}>
                            <Trophy className="size-3.5" aria-hidden />
                            {place(data.level.rank)} du réseau
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2.5 min-[1180px]:grid-cols-4">
                    <Slot icon={<Coins />} label="Pièces" tone="[&>svg]:text-[#e8bc5c]" value={data.coins === null ? "—" : number.format(data.coins)} detail="Pour la boutique en jeu" />
                    <Slot
                      icon={<Vote />}
                      label="Votes"
                      tone="[&>svg]:text-accent"
                      value={data.votes ? number.format(data.votes.total) : "—"}
                      detail={data.votes ? `${number.format(data.votes.month)} ce mois-ci` : undefined}
                    />
                    <Slot
                      icon={<Flame />}
                      label="Série de connexion"
                      tone="[&>svg]:text-[#f08c4a]"
                      value={data.streak ? `${data.streak.current} jour${data.streak.current > 1 ? "s" : ""}` : "—"}
                      detail={data.streak ? `Record : ${data.streak.best} jours` : undefined}
                    />
                    <Slot
                      icon={<Trophy />}
                      label="Succès"
                      tone="[&>svg]:text-[#e8bc5c]"
                      value={data.achievements ? `${data.achievements.unlocked} / ${data.achievements.total}` : "—"}
                      detail={data.achievements ? `${number.format(data.achievements.points)} points` : data.linked ? undefined : "Compte du site non lié"}
                    />
                  </div>
                </>
              )
            )}
          </Section>
        )}

        {/* Modes de jeu */}
        {!error && !newcomer && (
          <Section title="Modes de jeu" className="mt-9">
            {loading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-[70px]" />
                ))}
              </div>
            ) : (
              <>
                {played.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {played.map((mode) => (
                      <ModeRow key={mode.id} mode={mode} info={modeInfo(mode.id)} />
                    ))}
                  </ul>
                )}
                {untried.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    Pas encore essayé :
                    {untried.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        disabled={playBusy || !mode.quickPlay}
                        onClick={() => onPlay(mode.id)}
                        title={mode.quickPlay ? `Jouer à ${mode.name}` : undefined}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-card py-1 pr-2.5 pl-1 font-semibold text-foreground transition-colors enabled:hover:bg-secondary disabled:opacity-60"
                      >
                        {mode.icon ? <img src={mode.icon} alt="" className="pixelated size-5" /> : <Play className="size-3.5" aria-hidden />}
                        {mode.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Section>
        )}

        {/* Amis */}
        {!error && (loading || (friends && friends.length > 0)) && (
          <Section
            title="Amis"
            className="mt-9"
            aside={
              friends && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" aria-hidden />
                  {onlineFriends > 0 ? `${onlineFriends} en ligne sur ${friends.length}` : `${friends.length} ami${friends.length > 1 ? "s" : ""}`}
                </span>
              )
            }
          >
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((index) => (
                  <Skeleton key={index} className="h-[58px]" />
                ))}
              </div>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
                {friends!.map((friend) => (
                  <FriendRow key={friend.uuid} friend={friend} mode={friend.server ? modeInfo(friend.server) : undefined} playBusy={playBusy} onJoin={(mode) => onPlay(mode)} />
                ))}
              </ul>
            )}
            {friends && <p className="text-[11px] text-muted-foreground">Ajoute des amis en jeu avec /amis. Leur serveur s'affiche s'ils l'autorisent.</p>}
          </Section>
        )}

        {/* Temps de jeu */}
        <Section title="Temps de jeu" className="mt-9">
          {!error && !newcomer && (loading ? (
            <Skeleton className="h-[148px]" />
          ) : (
            data?.playtime && (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-display text-[26px] leading-none">{formatDuration(data.playtime.total)}</span>
                    <span className="text-xs text-muted-foreground">sur Clover Games, hors AFK</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden />
                    {number.format(data.playtime.joins)} connexions · plus longue session {formatDuration(data.playtime.longest)}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {data.playtime.servers.map((server) => (
                    <li key={server.id} className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-3 text-xs">
                      <span className="truncate font-semibold">{modeInfo(server.id)?.name ?? server.id}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, (server.seconds / topServer) * 100)}%` }} />
                      </span>
                      <span className="text-right text-muted-foreground tabular-nums">{formatDuration(server.seconds)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ))}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <h3 className="text-[13px] font-bold">Dans le launcher</h3>
            {sessions === null ? <Skeleton className="h-[160px]" /> : <ActivityHeatmap sessions={sessions} />}
          </div>
        </Section>

        {/* Collection */}
        <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-6 gap-y-9">
          <Section
            title="Capes"
            aside={
              <button type="button" onClick={onOpenSkins} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
                {skinCount} skin{skinCount > 1 ? "s" : ""} dans Mes skins
                <ArrowRight className="size-3.5" aria-hidden />
              </button>
            }
          >
            {capes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ce compte ne possède aucune cape.</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {capes.map((cape) => {
                  const count = owners(cape.url);
                  const { name } = ownedCapeText(cape.name);
                  return (
                    <li
                      key={cape.id}
                      title={count === null ? name : `${name} · ${number.format(count)} propriétaires recensés`}
                      className={cn("mc-slot relative flex flex-col items-center gap-1.5 px-1 pt-3 pb-2", cape.active && "outline-[#e9e3d4]")}
                    >
                      {count !== null && count < RARE_BELOW && (
                        <span className="absolute top-1 left-1 rounded bg-[#a68ae6]/20 px-1 text-[9px] font-bold tracking-wide text-[#c8b5f5] uppercase">Rare</span>
                      )}
                      {cape.active && <Check className="absolute top-1.5 right-1.5 size-3.5 text-[#e9e3d4]" strokeWidth={3} aria-label="Portée" />}
                      <CapeFront texture={cape.url} scale={3.5} />
                      <span className="w-full truncate text-center text-[11px] font-semibold">{name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Succès">
            {loading ? (
              <Skeleton className="h-[120px]" />
            ) : data?.achievements ? (
              data.achievements.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun succès débloqué pour l'instant.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.achievements.recent.map((achievement) => (
                    <li key={achievement.name} title={achievement.description} className="flex items-center gap-3 rounded-md bg-card px-3 py-2">
                      <span aria-hidden className="mc-slot grid size-8 shrink-0 place-items-center text-base [--mc-radius:5px]">
                        {achievement.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{achievement.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{shortDate.format(new Date(achievement.unlockedAt))}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : data && !data.linked ? (
              <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
                Lie ton compte Minecraft à ton compte du site pour voir tes succès et ton grade.
                <button type="button" onClick={() => onOpenLink(`${SITE_URL}/profile`)} className={secondaryButton}>
                  Lier sur le site
                  <ArrowUpRight className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Succès indisponibles pour le moment.</p>
            )}
          </Section>
        </div>
      </div>

      <ProfileCardDialog data={card} link={`${SITE_URL}/player/${encodeURIComponent(profile.name)}`} onOpenChange={(open) => !open && setCard(null)} onSave={services.savePng} />
    </main>
  );
}
