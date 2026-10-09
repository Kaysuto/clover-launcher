import assert from "node:assert/strict";
import test from "node:test";

import { networkPlayers } from "../src/lib/site.ts";

const modes = ["lobby", "bedwars", "practice", "pvpsoup", "skypvp", "creatif"].map((id) => ({ id, name: id, image: null }));
const statuses = modes.map(({ id }) => ({ id, online: true, players: id === "skypvp" ? 2 : 0 }));
const feed = { news: null, votes: null, modes: statuses };

test("counts SkyPvP players even when the lobby is empty", () => {
  assert.equal(networkPlayers(feed, modes), 2);
});

test("sums the modes declared by the manifest, ignoring other servers", () => {
  const modes = [{ id: "new-mode", name: "Nouveau mode", image: null }, { id: "skypvp", name: "SkyPvP", image: null }];
  const modesStatus = [...statuses, { id: "new-mode", online: true, players: 3 }, { id: "proxy", online: true, players: 100 }];
  assert.equal(networkPlayers({ ...feed, modes: modesStatus }, modes), 5);
});

test("shows a real zero when all modes are empty", () => {
  assert.equal(networkPlayers({ ...feed, modes: statuses.map((mode) => ({ ...mode, players: 0 })) }, modes), 0);
});

test("offline modes contribute zero even if their last count was nonzero", () => {
  const modesStatus = statuses.map((mode) => mode.id === "lobby" ? { ...mode, online: false, players: 4 } : mode);
  assert.equal(networkPlayers({ ...feed, modes: modesStatus }, modes), 2);
  assert.equal(networkPlayers({ ...feed, modes: modesStatus.map((mode) => ({ ...mode, online: false, players: null })) }, modes), 0);
});

test("does not present an incomplete or stale total as zero", () => {
  assert.equal(networkPlayers({ ...feed, modes: null }, modes), null);
  assert.equal(networkPlayers(feed, []), null);
  assert.equal(networkPlayers({ ...feed, modes: statuses.filter((mode) => mode.id !== "skypvp") }, modes), null);
  assert.equal(networkPlayers({ ...feed, modes: statuses.map((mode) => mode.id === "skypvp" ? { ...mode, online: null, players: null } : mode) }, modes), null);
  assert.equal(networkPlayers({ ...feed, modes: statuses.map((mode) => mode.id === "skypvp" ? { ...mode, players: null } : mode) }, modes), null);
});
