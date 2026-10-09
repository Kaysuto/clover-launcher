import type { AvailableVersion } from "@/types";

/** Les numéros sont ceux de Mojang ; une famille réunit ses correctifs. */
export function versionFamily(id: string): string {
  return /^\d+\.\d+(?:\.\d+)?$/.test(id)
    ? id.split(".").slice(0, 2).join(".")
    : id;
}

/** Minecraft ouvre un monde dès son lancement (Quick Play) depuis la 1.20 (snapshot 23w14a). */
export function opensWorldsDirectly(id: string): boolean {
  const release = /^1\.(\d+)/.exec(id);
  if (release) return Number(release[1]) >= 20;
  const snapshot = /^(\d{2})w(\d{2})/.exec(id);
  if (snapshot) return Number(snapshot[1]) * 100 + Number(snapshot[2]) >= 2314;
  return true;
}

export type VersionFamily = {
  id: string;
  versions: string[];
  snapshot: boolean;
};

export function groupVersions(
  versions: AvailableVersion[],
  existing: string[],
  snapshots: boolean,
): VersionFamily[] {
  const groups = new Map<string, VersionFamily>();
  const visible = versions.filter((entry) => snapshots || !entry.snapshot);
  for (const id of [...visible.map((entry) => entry.id), ...existing]) {
    const family = versionFamily(id);
    const group = groups.get(family) ?? {
      id: family,
      versions: [],
      snapshot: versions.find((entry) => entry.id === id)?.snapshot ?? false,
    };
    if (!group.versions.includes(id)) group.versions.push(id);
    groups.set(family, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      versions: group.versions.sort((a, b) =>
        b.localeCompare(a, "en", { numeric: true }),
      ),
    }))
    .sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
}
