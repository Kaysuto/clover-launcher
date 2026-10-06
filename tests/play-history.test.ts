import assert from "node:assert/strict";
import test from "node:test";
import { activity, activityScale, formatDuration, playStats, topServers } from "../src/lib/play-history.ts";

const session = (started: Date, minutes: number, servers: string[] = []) => ({ instance: "clover", started: started.getTime() / 1000, seconds: minutes * 60, code: 0, servers });

test("les durées s'écrivent en heures et minutes", () => {
  assert.equal(formatDuration(20), "moins d'une minute");
  assert.equal(formatDuration(45 * 60), "45 min");
  assert.equal(formatDuration(13 * 3600 + 5 * 60), "13 h 05");
  assert.equal(formatDuration(2 * 3600), "2 h");
});

test("statistiques et serveurs les plus joués", () => {
  const sessions = [session(new Date(2026, 9, 1), 60, ["play.clovergames.fr"]), session(new Date(2026, 9, 2), 180, ["play.clovergames.fr", "autre.example"]), session(new Date(2026, 9, 3), 30)];
  assert.deepEqual(playStats(sessions), { total: 270 * 60, count: 3, average: 90 * 60, longest: 180 * 60 });
  assert.deepEqual(playStats([]), { total: 0, count: 0, average: 0, longest: 0 });
  assert.deepEqual(topServers(sessions).map((server) => [server.address, server.sessions, server.seconds / 60]), [["play.clovergames.fr", 2, 240], ["autre.example", 1, 180]]);
});

test("barres par jour jusqu'à aujourd'hui, par semaine sur six mois, comparées à avant", () => {
  const now = new Date(2026, 9, 5, 15); // lundi 5 octobre
  const sessions = [session(new Date(2026, 9, 5, 10), 40), session(new Date(2026, 9, 5, 12), 20), session(new Date(2026, 9, 4, 22), 90), session(new Date(2026, 8, 25, 20), 30)];
  const week = activity(sessions, now, "week");
  assert.equal(week.buckets.length, 7);
  assert.equal(week.buckets[6].start.getDate(), 5);
  assert.deepEqual([week.buckets[6].seconds / 60, week.buckets[6].sessions, week.buckets[5].seconds / 60], [60, 2, 90]);
  assert.deepEqual([week.total / 60, week.daysPlayed, week.previous / 60], [150, 2, 30]);
  const half = activity(sessions, now, "half");
  assert.equal(half.buckets.length, 26);
  assert.equal(half.buckets[25].start.getDay(), 1);
  assert.equal(half.buckets[25].seconds / 60, 60);
  assert.deepEqual([half.buckets[24].seconds / 60, half.buckets[23].seconds / 60], [90, 30]);
  assert.equal(activity(sessions, now, "month").buckets.length, 30);
});

test("l'axe s'arrête sur une durée ronde, trois lignes au plus", () => {
  assert.deepEqual(activityScale(0), { top: 900, step: 900 });
  assert.deepEqual(activityScale(50 * 60), { top: 3600, step: 1800 });
  assert.deepEqual(activityScale(5 * 3600 + 60), { top: 6 * 3600, step: 2 * 3600 });
});
