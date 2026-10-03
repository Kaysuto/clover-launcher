#!/usr/bin/env node
// Paquet MSIX du Microsoft Store, à partir du launcher déjà construit (`npm run tauri build`).
//
//   node scripts/msix.mjs [sortie]
//     Assemble src-tauri/target/msix/layout (exécutable, logos, AppxManifest.xml) puis le paquet
//     <sortie>/clover-launcher_<version>_x64.msix (par défaut src-tauri/target/msix), non signé :
//     Partner Center le signe à la soumission.
//   node scripts/msix.mjs --layout
//     Assemble seulement le dossier, pour un essai local en mode développeur :
//     Add-AppxPackage -Register src-tauri/target/msix/layout/AppxManifest.xml
//
// makeappx.exe vient du SDK Windows ; MAKEAPPX peut désigner un autre emplacement. Comme cargo,
// CARGO_TARGET_DIR remplace src-tauri/target.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAURI = join(ROOT, "src-tauri");
const ICONS = join(TAURI, "icons");
const TARGET = process.env.CARGO_TARGET_DIR ?? join(TAURI, "target");
const LOGOS = ["StoreLogo.png", "Square44x44Logo.png", "Square71x71Logo.png", "Square150x150Logo.png", "Square310x310Logo.png"];

async function version() {
  const cargo = await readFile(join(TAURI, "Cargo.toml"), "utf8");
  const found = cargo.match(/^version\s*=\s*"(\d+)\.(\d+)\.(\d+)"/m);
  if (!found) throw new Error("Version X.Y.Z introuvable dans src-tauri/Cargo.toml (pas de suffixe pour le Store).");
  // Le Store réserve le quatrième nombre : toujours 0.
  return { semver: found.slice(1).join("."), msix: `${found.slice(1).join(".")}.0` };
}

async function makeappx() {
  if (process.env.MAKEAPPX) return process.env.MAKEAPPX;
  const kits = "C:/Program Files (x86)/Windows Kits/10/bin";
  const versions = (await readdir(kits).catch(() => [])).filter((name) => /^10\./.test(name)).sort().reverse();
  const found = versions.map((v) => join(kits, v, "x64", "makeappx.exe")).find(existsSync);
  if (!found) throw new Error("makeappx.exe introuvable : installer le SDK Windows ou définir MAKEAPPX.");
  return found;
}

async function layout(v) {
  const exe = join(TARGET, "release", "clover-launcher.exe");
  if (!existsSync(exe)) throw new Error(`${exe} manque : lancer d'abord npm run tauri build.`);
  const dir = join(TARGET, "msix", "layout");
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "Assets"), { recursive: true });
  await copyFile(exe, join(dir, "clover-launcher.exe"));
  for (const logo of LOGOS) await copyFile(join(ICONS, logo), join(dir, "Assets", logo));
  for (const extra of await readdir(join(ICONS, "msix"))) await copyFile(join(ICONS, "msix", extra), join(dir, "Assets", extra));
  const manifest = await readFile(join(ROOT, "scripts", "msix", "AppxManifest.xml"), "utf8");
  await writeFile(join(dir, "AppxManifest.xml"), manifest.replace("{{VERSION}}", v.msix));
  return dir;
}

const args = process.argv.slice(2);
try {
  const v = await version();
  const dir = await layout(v);
  if (args[0] === "--layout") {
    console.log(`Dossier MSIX : ${dir}`);
  } else {
    const out = args[0] ?? join(TARGET, "msix");
    await mkdir(out, { recursive: true });
    const file = join(out, `clover-launcher_${v.semver}_x64.msix`);
    execFileSync(await makeappx(), ["pack", "/o", "/d", dir, "/p", file], { stdio: ["ignore", "ignore", "inherit"] });
    console.log(`Paquet MSIX ${v.msix} : ${file}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
