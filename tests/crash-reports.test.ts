import assert from "node:assert/strict";
import test from "node:test";
import { scrubHome } from "../src/lib/crash-reports.ts";

test("les dossiers personnels sortent des rapports de plantage", () => {
  assert.equal(scrubHome(String.raw`Erreur disque : C:\Users\Kevin\.cloverlauncher\launcher.json`), String.raw`Erreur disque : C:\Users\~\.cloverlauncher\launcher.json`);
  assert.equal(scrubHome("c:/users/kevin/AppData"), "c:/users/~/AppData");
  assert.equal(scrubHome("/Users/kevin/Library et /home/kevin/.local"), "/Users/~/Library et /home/~/.local");
  assert.equal(scrubHome("Ce mode ne se rejoint pas directement"), "Ce mode ne se rejoint pas directement");
});
