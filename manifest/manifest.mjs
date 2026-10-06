#!/usr/bin/env node
// Construit et signe le manifeste distant du Clover Launcher.
//
//   node manifest/manifest.mjs build <canal>   résout les mods sur Modrinth, écrit et signe
//                                              manifest/dist/<canal>/manifest.json(.sig)
//   node manifest/manifest.mjs keygen <fichier> crée une paire ed25519 (clé privée PEM dans
//                                              <fichier>, clé publique affichée pour le launcher)
//
// La clé privée est lue dans le fichier désigné par CLOVER_MANIFEST_KEY. Elle ne doit jamais
// entrer dans le dépôt.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
/** Descriptions complètes en français, `descriptions/<slug>.md`, affichées sur la page du mod. */
const DESCRIPTIONS = join(ROOT, "descriptions");
const MODRINTH = "https://api.modrinth.com/v2";
const USER_AGENT = "Kaysuto/clover-launcher (contact@kaysuto.fr)";
const SCHEMA = 1;
const RELEASE_ORDER = ["release", "beta", "alpha"];

async function modrinth(path) {
  const response = await fetch(`${MODRINTH}${path}`, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Modrinth ${path} → HTTP ${response.status}`);
  return response.json();
}

/** Version la plus récente compatible, en préférant une release à une bêta puis à une alpha. */
async function compatibleVersion(project, minecraft) {
  const query = new URLSearchParams({
    loaders: JSON.stringify(["fabric"]),
    game_versions: JSON.stringify([minecraft]),
  });
  const versions = await modrinth(`/project/${project}/version?${query}`);
  for (const type of RELEASE_ORDER) {
    const version = versions.find((candidate) => candidate.version_type === type);
    if (version) return version;
  }
  return null;
}

/** Description complète en français d'un mod du catalogue (Markdown), ou `null`. */
async function description(slug) {
  const file = join(DESCRIPTIONS, `${slug}.md`);
  if (!existsSync(file)) return null;
  const text = (await readFile(file, "utf8")).trim();
  return text || null;
}

/**
 * Résout le catalogue et ses dépendances obligatoires. Les dépendances absentes du catalogue sont
 * ajoutées comme mods cachés : le joueur ne les voit pas, le launcher les installe avec les mods
 * qui en ont besoin.
 */
async function resolveMods(catalogue, minecraft) {
  const resolved = new Map();
  const queue = catalogue.map((entry) => ({ ...entry, hidden: false }));

  while (queue.length > 0) {
    const entry = queue.shift();
    if (resolved.has(entry.slug)) continue;

    const project = await modrinth(`/project/${entry.slug}`);
    const version = await compatibleVersion(project.id, minecraft);
    const mod = {
      id: project.slug,
      name: project.title,
      // Logo publié sur Modrinth (CDN Modrinth), affiché sur la carte du mod.
      icon: project.icon_url ?? null,
      description: entry.description ?? null,
      // Remplace dans le launcher la description Modrinth, en anglais le plus souvent.
      body: entry.hidden ? null : await description(entry.slug),
      category: entry.category ?? null,
      default: entry.default ?? false,
      hidden: entry.hidden,
      version: version?.version_number ?? null,
      file: null,
      requires: [],
    };
    resolved.set(entry.slug, mod);
    if (!version) {
      console.warn(`  ${mod.id} : aucune version Fabric pour ${minecraft}`);
      continue;
    }

    const file = version.files.find((candidate) => candidate.primary) ?? version.files[0];
    mod.file = { filename: file.filename, url: file.url, sha512: file.hashes.sha512, size: file.size };

    const required = version.dependencies.filter((dependency) => dependency.dependency_type === "required");
    for (const dependency of required) {
      const projectId =
        dependency.project_id ?? (await modrinth(`/version/${dependency.version_id}`)).project_id;
      const slug = (await modrinth(`/project/${projectId}`)).slug;
      mod.requires.push(slug);
      if (!resolved.has(slug) && !queue.some((queued) => queued.slug === slug)) {
        queue.push({ slug, hidden: true });
      }
    }
    console.log(`  ${mod.id} ${mod.version}${mod.requires.length ? ` (requiert ${mod.requires.join(", ")})` : ""}`);
  }

  // Un mod n'est disponible que si lui et toutes ses dépendances ont une version compatible.
  const available = (id, seen = new Set()) => {
    if (seen.has(id)) return true;
    seen.add(id);
    const mod = resolved.get(id);
    return Boolean(mod?.file) && mod.requires.every((dependency) => available(dependency, seen));
  };
  return [...resolved.values()].map((mod) => ({ ...mod, available: available(mod.id) }));
}

async function build(channel) {
  const keyFile = process.env.CLOVER_MANIFEST_KEY;
  if (!keyFile || !existsSync(keyFile)) {
    throw new Error("CLOVER_MANIFEST_KEY doit désigner le fichier PEM de la clé privée du manifeste.");
  }
  const source = JSON.parse(await readFile(join(ROOT, `${channel}.json`), "utf8"));
  console.log(`Canal ${channel} : Minecraft ${source.minecraft}, Fabric ${source.fabricLoader}`);

  const manifest = {
    schema: SCHEMA,
    // Numéro croissant : le launcher refuse un manifeste plus ancien que celui qu'il connaît,
    // pour qu'un ancien manifeste signé ne puisse pas être rejoué.
    serial: Math.floor(Date.now() / 1000),
    minLauncherVersion: source.minLauncherVersion,
    minecraft: { version: source.minecraft },
    fabric: { loader: source.fabricLoader },
    server: { host: source.server },
    modes: source.modes.map((mode) => ({ image: null, ...mode })),
    mods: await resolveMods(source.mods, source.minecraft),
    // Comptes Minecraft (UUID) qui voient le réglage « Canal bêta » du launcher.
    betaTesters: source.betaTesters ?? [],
  };

  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const key = createPrivateKey(await readFile(keyFile));
  const signature = sign(null, bytes, key).toString("base64");

  const out = join(ROOT, "dist", channel);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "manifest.json"), bytes);
  await writeFile(join(out, "manifest.json.sig"), `${signature}\n`);

  // Un fichier mal nommé ne serait jamais affiché : le signaler plutôt que l'ignorer.
  const slugs = new Set(source.mods.map((entry) => entry.slug));
  const orphans = existsSync(DESCRIPTIONS)
    ? (await readdir(DESCRIPTIONS)).filter((file) => file.endsWith(".md") && !slugs.has(file.slice(0, -3)))
    : [];
  if (orphans.length) console.warn(`Descriptions sans mod dans le catalogue : ${orphans.join(", ")}`);
  const untranslated = manifest.mods.filter((mod) => !mod.hidden && !mod.body).map((mod) => mod.id);
  if (untranslated.length) console.warn(`Sans description en français : ${untranslated.join(", ")}`);

  const unavailable = manifest.mods.filter((mod) => !mod.available).map((mod) => mod.id);
  console.log(`Écrit : ${join(out, "manifest.json")} (+ .sig), ${manifest.mods.length} mods`);
  if (unavailable.length) console.warn(`Indisponibles : ${unavailable.join(", ")}`);
}

async function keygen(file) {
  if (existsSync(file)) throw new Error(`${file} existe déjà : refus de l'écraser.`);
  const { privateKey } = generateKeyPairSync("ed25519");
  await writeFile(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  // Les 32 derniers octets du SPKI DER ed25519 sont la clé publique brute.
  const der = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  console.log(`Clé privée écrite dans ${file}`);
  console.log(`Clé publique (MANIFEST_PUBLIC_KEY) : ${der.subarray(-32).toString("base64")}`);
}

const [command, argument] = process.argv.slice(2);
const commands = { build, keygen };
if (!commands[command] || !argument) {
  console.error("Usage : manifest.mjs build <canal> | keygen <fichier>");
  process.exit(1);
}
commands[command](argument).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
