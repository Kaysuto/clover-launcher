import type { PlaySession } from "../types";

/** « 13 h 20 », « 45 min », « moins d'une minute ». */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "moins d'une minute";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, "0")}` : ""}`;
}

export function playStats(sessions: PlaySession[]) {
  const total = sessions.reduce((sum, session) => sum + session.seconds, 0);
  return {
    total,
    count: sessions.length,
    average: sessions.length ? Math.round(total / sessions.length) : 0,
    longest: Math.max(0, ...sessions.map((session) => session.seconds)),
  };
}

/** Serveurs rejoints, du plus joué au moins joué : une partie compte pour chaque serveur visité. */
export function topServers(sessions: PlaySession[]) {
  const servers = new Map<string, { address: string; sessions: number; seconds: number }>();
  for (const session of sessions) {
    for (const address of session.servers) {
      const entry = servers.get(address) ?? { address, sessions: 0, seconds: 0 };
      entry.sessions += 1;
      entry.seconds += session.seconds;
      servers.set(address, entry);
    }
  }
  return [...servers.values()].sort((a, b) => b.seconds - a.seconds || b.sessions - a.sessions);
}

export type ActivityRange = "week" | "month" | "half";

/** Jours couverts, et taille d'une barre : un jour, ou une semaine sur six mois. */
export const ACTIVITY_RANGES: Record<ActivityRange, { label: string; days: number; bucket: 1 | 7 }> = {
  week: { label: "7 jours", days: 7, bucket: 1 },
  month: { label: "30 jours", days: 30, bucket: 1 },
  half: { label: "6 mois", days: 182, bucket: 7 },
};

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * Temps joué sur la période, en barres : par jour jusqu'à aujourd'hui, ou par semaine (du lundi)
 * jusqu'à la semaine en cours. Une partie compte pour le jour où elle a commencé. `previous` :
 * temps joué sur la période de même longueur juste avant, pour la comparaison.
 */
export function activity(sessions: PlaySession[], now: Date, range: ActivityRange) {
  const { days, bucket } = ACTIVITY_RANGES[range];
  const today = addDays(now, 0);
  const count = Math.ceil(days / bucket);
  const end = bucket === 7 ? addDays(today, 7 - ((today.getDay() + 6) % 7)) : addDays(today, 1);
  const start = addDays(end, -count * bucket);
  const previousStart = addDays(start, -count * bucket);
  const buckets = Array.from({ length: count }, (_, index) => ({ start: addDays(start, index * bucket), seconds: 0, sessions: 0 }));
  const played = new Set<number>();
  let previous = 0;
  for (const session of sessions) {
    const date = new Date(session.started * 1000);
    if (date >= previousStart && date < start) previous += session.seconds;
    if (date < start || date >= end) continue;
    const day = addDays(date, 0);
    // Arrondi : un passage à l'heure d'été fait des jours de 23 ou 25 heures.
    const target = buckets[Math.floor(Math.round((day.getTime() - start.getTime()) / 86_400_000) / bucket)];
    target.seconds += session.seconds;
    target.sessions += 1;
    played.add(day.getTime());
  }
  return {
    buckets,
    total: buckets.reduce((sum, item) => sum + item.seconds, 0),
    sessions: buckets.reduce((sum, item) => sum + item.sessions, 0),
    daysPlayed: played.size,
    previous,
  };
}

/** Haut de l'axe et pas des lignes de repère : au plus trois lignes, en durées rondes. */
export function activityScale(max: number): { top: number; step: number } {
  const steps = [15, 30, 60, 120, 180, 240, 360, 600, 1200, 2400, 3600].map((minutes) => minutes * 60);
  const step = steps.find((candidate) => Math.ceil(max / candidate) <= 3) ?? steps[steps.length - 1];
  return { top: step * Math.max(1, Math.ceil(max / step)), step };
}
