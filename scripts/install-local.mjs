#!/usr/bin/env node
// Met à jour le Clover Launcher installé sur ce poste (Windows) avec le code courant :
//
//   npm run install:local
//
// Construit l'installeur NSIS sans artefacts de mise à jour (pas de clé de signature), l'installe
// en silencieux par-dessus l'installation existante, puis relance le launcher. Refuse si un
// Minecraft lancé par Clover tourne : l'installation fermerait le launcher, et le jeu avec lui.
// Comptes, instances et mondes (~/.cloverlauncher) ne sont pas touchés.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const powershell = (command) => execFileSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8" }).trim();

if (process.platform !== "win32") throw new Error("Installation locale prévue pour Windows seulement.");

const gameRunning = () =>
  powershell("@(Get-Process javaw, java -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*\\.cloverlauncher\\*' }).Count") !== "0";

if (gameRunning()) throw new Error("Minecraft tourne depuis le Clover Launcher : ferme la partie avant d'installer.");

const target = process.env.CARGO_TARGET_DIR ?? join(root, "src-tauri", "target");
// Fichier plutôt que JSON en argument : l'interpréteur de commandes Windows en retire les guillemets.
const config = join(target, "install-local.conf.json");
mkdirSync(target, { recursive: true });
writeFileSync(config, JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
execFileSync("npm", ["run", "tauri", "build", "--", "--bundles", "nsis", "--config", `"${config}"`], { cwd: root, stdio: "inherit", shell: true });

// Sans `version` dans tauri.conf.json, Tauri prend celle de Cargo.toml.
const version = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8").match(/^version = "(.+)"$/m)?.[1];
const installer = join(target, "release", "bundle", "nsis", `Clover Launcher_${version}_x64-setup.exe`);
if (!existsSync(installer)) throw new Error(`Installeur introuvable : ${installer}`);

// Une partie a pu démarrer pendant la compilation.
if (gameRunning()) throw new Error("Minecraft a été lancé pendant la compilation : ferme la partie puis relance la commande.");

execFileSync(installer, ["/S"], { stdio: "inherit" });

const exe = join(process.env.LOCALAPPDATA, "Clover Launcher", "clover-launcher.exe");
spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
console.log(`Clover Launcher ${version} installé et relancé.`);
