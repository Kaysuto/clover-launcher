import { Flame, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

import { ACTIVITY_RANGES, type ActivityRange, activity, activityLevel, formatDuration } from "@/lib/play-history";
import { cn } from "@/lib/utils";
import type { PlaySession } from "@/types";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "short" });

/** Teintes des cases, de « pas joué » à « plus de 3 h ». */
const LEVELS = ["bg-[#24201a]", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary"];
const LEVEL_HINTS = ["Pas joué", "Moins de 30 min", "Moins d'1 h", "Moins de 3 h", "3 h et plus"];
const DAY_LABELS = ["lun.", "", "mer.", "", "ven.", "", ""];

/** Temps joué jour par jour, en grille de petites cases (une colonne par semaine). */
export function ActivityHeatmap({ sessions }: { sessions: PlaySession[] }) {
  const [range, setRange] = useState<ActivityRange>("half");
  const [hovered, setHovered] = useState<number | null>(null);
  const { label, weeks } = ACTIVITY_RANGES[range];
  const { days, total, daysPlayed, previous, streak, best } = activity(sessions, new Date(), range);
  const delta = total - previous;
  const shown = hovered === null ? null : days[hovered];
  const today = days.filter((day) => !day.future).length - 1;
  // Le mois au-dessus de la semaine qui contient son 1er ; la première colonne seulement si le
  // mois suivant ne commence pas juste après (les deux noms se chevaucheraient).
  const months = Array.from({ length: weeks }, (_, column) => {
    const week = days.slice(column * 7, column * 7 + 7);
    const first = week.find((day) => day.date.getDate() === 1);
    if (first) return monthFormat.format(first.date);
    const next = days.slice(7, 21).some((day) => day.date.getDate() === 1);
    return column === 0 && !next ? monthFormat.format(week[0].date) : "";
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-display text-[26px] leading-none">{total ? formatDuration(total) : "0 min"}</span>
          <span className="text-xs text-muted-foreground">{daysPlayed ? `${daysPlayed} jour${daysPlayed > 1 ? "s" : ""} de jeu sur ${label}` : `Pas joué sur ${label}`}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {best > 1 && (
              <span className="flex items-center gap-1">
                <Flame className={cn("size-3.5", streak > 1 && "text-accent")} aria-hidden />
                {streak > 1 ? `${streak} jours d'affilée` : "Pas de série en cours"} · record {best} jours
              </span>
            )}
            {Math.abs(delta) >= 60 && (
              <span className="flex items-center gap-1">
                {delta > 0 ? <TrendingUp className="size-3.5 text-primary" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
                {formatDuration(Math.abs(delta))} {delta > 0 ? "de plus" : "de moins"} qu'avant
              </span>
            )}
          </span>
        </div>
        <div role="tablist" aria-label="Période" className="flex shrink-0 gap-0.5 rounded-md border border-border bg-[#100e0b] p-0.5">
          {(Object.keys(ACTIVITY_RANGES) as ActivityRange[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={range === id}
              onClick={() => {
                setRange(id);
                setHovered(null);
              }}
              className={cn("rounded px-2.5 py-1 text-[11px] font-semibold transition-colors", range === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {ACTIVITY_RANGES[id].label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative" style={{ maxWidth: `calc(32px + ${weeks} * 24px)` }} onMouseLeave={() => setHovered(null)}>
        <div
          role="img"
          aria-label={`Temps de jeu sur ${label} : ${total ? formatDuration(total) : "aucun"}, ${daysPlayed} jour${daysPlayed > 1 ? "s" : ""} de jeu`}
          className={cn("grid grid-flow-col", weeks > 30 ? "gap-[2px]" : "gap-[3px]")}
          style={{ gridTemplateColumns: `28px repeat(${weeks}, minmax(0, 1fr))`, gridTemplateRows: "14px repeat(7, auto)" }}
        >
          <span aria-hidden />
          {DAY_LABELS.map((day, index) => (
            <span key={index} aria-hidden className="flex items-center text-[10px] leading-none text-muted-foreground">
              {day}
            </span>
          ))}
          {months.map((month, column) => [
            <span key={`m${column}`} aria-hidden className="w-0 text-[10px] leading-none whitespace-nowrap text-muted-foreground">
              {month}
            </span>,
            ...days.slice(column * 7, column * 7 + 7).map((day, row) => {
              const index = column * 7 + row;
              return (
                <span
                  key={index}
                  aria-hidden
                  onMouseEnter={() => setHovered(day.future ? null : index)}
                  className={cn(
                    "aspect-square w-full rounded-[3px] transition-[box-shadow]",
                    day.future ? "invisible" : LEVELS[activityLevel(day.seconds)],
                    hovered === index && "ring-1 ring-accent",
                    index === today && hovered !== index && "ring-1 ring-[#e9e3d4]/40",
                  )}
                />
              );
            }),
          ])}
        </div>
        {shown && hovered !== null && (
          <div
            className="pointer-events-none absolute z-10 mb-1.5 flex -translate-x-1/2 flex-col gap-0.5 rounded-md border border-border bg-[#100e0b] px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg"
            style={{
              left: `calc(32px + (100% - 32px) * ${Math.min(0.9, Math.max(0.1, (Math.floor(hovered / 7) + 0.5) / weeks))})`,
              bottom: `calc((100% - 14px) * ${1 - (hovered % 7) / 7})`,
            }}
          >
            <span className="text-muted-foreground">{dayFormat.format(shown.date)}</span>
            <span className="font-semibold">{shown.seconds ? `${formatDuration(shown.seconds)} · ${shown.sessions > 1 ? `${shown.sessions} parties` : "1 partie"}` : "Pas joué"}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        Moins
        {LEVELS.map((level, index) => (
          <span key={level} title={LEVEL_HINTS[index]} className={cn("size-2.5 rounded-[2px]", level)} />
        ))}
        Plus
      </div>
    </div>
  );
}
