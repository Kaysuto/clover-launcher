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

export type ActivityRange = "half" | "year";

/** Semaines affichées : une colonne par semaine, du lundi au dimanche. */
export const ACTIVITY_RANGES: Record<ActivityRange, { label: string; weeks: number }> = {
  half: { label: "6 mois", weeks: 26 },
  year: { label: "1 an", weeks: 53 },
};

/** Teinte d'une case : 0 sans partie, puis moins de 30 min, moins d'1 h, moins de 3 h, au-delà. */
export const ACTIVITY_LEVELS = [30 * 60, 3600, 3 * 3600];
export const activityLevel = (seconds: number) => (seconds ? 1 + ACTIVITY_LEVELS.filter((limit) => seconds >= limit).length : 0);

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const dayIndex = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);

/**
 * Temps joué par jour, en grille : `weeks` colonnes du lundi au dimanche, la dernière étant la
 * semaine en cours (ses jours à venir marqués `future`). Une partie compte pour le jour où elle a
 * commencé. `previous` : temps joué sur la même durée juste avant ; `streak` : jours d'affilée
 * jusqu'à aujourd'hui (ou hier, la journée n'étant pas finie).
 */
export function activity(sessions: PlaySession[], now: Date, range: ActivityRange) {
  const { weeks } = ACTIVITY_RANGES[range];
  const today = addDays(now, 0);
  const start = addDays(today, -((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  // Arrondi : un passage à l'heure d'été fait des jours de 23 ou 25 heures.
  const elapsed = dayIndex(start, today) + 1;
  const previousStart = addDays(start, -elapsed);
  const days = Array.from({ length: weeks * 7 }, (_, index) => ({ date: addDays(start, index), seconds: 0, sessions: 0, future: index >= elapsed }));
  let previous = 0;
  for (const session of sessions) {
    const date = new Date(session.started * 1000);
    if (date >= previousStart && date < start) previous += session.seconds;
    const index = dayIndex(start, addDays(date, 0));
    if (date < start || index >= elapsed) continue;
    days[index].seconds += session.seconds;
    days[index].sessions += 1;
  }
  const played = days.filter((day) => day.seconds > 0);
  let best = 0;
  let run = 0;
  for (const day of days.slice(0, elapsed)) {
    run = day.seconds ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let streak = 0;
  for (let index = days[elapsed - 1].seconds ? elapsed - 1 : elapsed - 2; index >= 0 && days[index].seconds; index -= 1) streak += 1;
  return {
    days,
    total: played.reduce((sum, day) => sum + day.seconds, 0),
    sessions: played.reduce((sum, day) => sum + day.sessions, 0),
    daysPlayed: played.length,
    previous,
    streak,
    best,
  };
}
