#!/usr/bin/env node
// Paquets d'une release du launcher, pour la CI (.github/workflows/release.yml).
//
//   node scripts/release.mjs collect <dossier target> <sortie>
//     Copie les paquets construits par `tauri build` (et leurs signatures d'updater) dans <sortie>,
//     sous des noms sans espace, versionnés par la version de src-tauri/Cargo.toml.
//   node scripts/release.mjs index <dossier>
//     Vérifie qu'une release est complète puis écrit dans <dossier> :
//     - latest.json : lu par l'updater Tauri du launcher (paquets de mise à jour signés) ;
//     - downloads.json : lu par la page /launcher du site (installeurs, contrat de SPEC.md §3.7).
//
// Les paquets vont dans https://cdn.clovergames.fr/launcher/prod/<version>/, les deux index à la
// racine du canal, envoyés après les paquets.

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CDN = "https://cdn.clovergames.fr/launcher/prod";

/**
 * Paquets attendus. `platforms` : clés de latest.json servies par ce paquet de mise à jour (signé) ;
 * `download` : présent dans downloads.json, que le site propose au téléchargement.
 */
const PACKAGES = [
  { match: /-setup\.exe$/, name: (v) => `clover-launcher_${v}_x64-setup.exe`, platforms: ["windows-x86_64"], download: "exe" },
  { match: /\.app\.tar\.gz$/, name: (v) => `clover-launcher_${v}_universal.app.tar.gz`, platforms: ["darwin-aarch64", "darwin-x86_64"] },
  { match: /\.dmg$/, name: (v) => `clover-launcher_${v}_universal.dmg`, download: "dmg" },
  { match: /\.AppImage$/, name: (v) => `clover-launcher_${v}_amd64.AppImage`, platforms: ["linux-x86_64"], download: "appimage" },
  { match: /\.deb$/, name: (v) => `clover-launcher_${v}_amd64.deb`, download: "deb" },
  { match: /\.rpm$/, name: (v) => `clover-launcher_${v}_x86_64.rpm`, download: "rpm" },
];

async function version() {
  const cargo = await readFile(join(ROOT, "src-tauri", "Cargo.toml"), "utf8");
  const found = cargo.match(/^version\s*=\s*"([^"]+)"/m);
  if (!found) throw new Error("Version introuvable dans src-tauri/Cargo.toml.");
  return found[1];
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    // Le bundle macOS `.app` est un dossier : seule son archive `.app.tar.gz` compte.
    if (entry.isDirectory() && !entry.name.endsWith(".app")) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

async function collect(target, out) {
  const v = await version();
  await mkdir(out, { recursive: true });
  let count = 0;
  for await (const file of walk(target)) {
    if (!file.split(/[\\/]/).includes("bundle")) continue;
    const kind = PACKAGES.find((pkg) => pkg.match.test(file));
    if (!kind) continue;
    const name = kind.name(v);
    await copyFile(file, join(out, name));
    if (kind.platforms) await copyFile(`${file}.sig`, join(out, `${name}.sig`));
    console.log(`${basename(file)} → ${name}`);
    count += 1;
  }
  if (count === 0) throw new Error(`Aucun paquet trouvé dans ${target}.`);
}

async function index(dir) {
  const v = await version();
  const latest = { version: v, pub_date: new Date().toISOString(), platforms: {} };
  const downloads = { schema: 1, version: v, date: latest.pub_date, files: [] };
  for (const pkg of PACKAGES) {
    const name = pkg.name(v);
    const file = join(dir, name);
    const bytes = await readFile(file).catch(() => {
      throw new Error(`Release incomplète : ${name} manque.`);
    });
    const url = `${CDN}/${v}/${name}`;
    if (pkg.platforms) {
      const signature = (await readFile(`${file}.sig`, "utf8").catch(() => "")).trim();
      if (!signature) throw new Error(`Signature d'updater manquante pour ${name}.`);
      for (const platform of pkg.platforms) latest.platforms[platform] = { signature, url };
    }
    if (pkg.download) {
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      downloads.files.push({ kind: pkg.download, url, size: (await stat(file)).size, sha256 });
    }
  }
  await writeFile(join(dir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);
  await writeFile(join(dir, "downloads.json"), `${JSON.stringify(downloads, null, 2)}\n`);
  console.log(`Clover Launcher ${v} : ${Object.keys(latest.platforms).length} plateformes, ${downloads.files.length} installeurs.`);
}

const [command, ...args] = process.argv.slice(2);
const commands = { collect: () => collect(args[0], args[1]), index: () => index(args[0]) };
if (!commands[command] || args.length < (command === "collect" ? 2 : 1)) {
  console.error("Usage : release.mjs collect <dossier target> <sortie> | index <dossier>");
  process.exit(1);
}
commands[command]().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
