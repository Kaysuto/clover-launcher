import type { LogEntry } from "@/types";

const LEVEL_TEXT = { info: "INFO", warn: "WARN", error: "ERROR" } as const;

export const logTime = (time: number) => new Date(time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Préfixe façon `latest.log` de Fabric : `[12:34:56] [Render thread/WARN] (Logger)`. Vide pour une ligne brute. */
export function logPrefix(entry: LogEntry) {
  if (entry.time === null) return "";
  const logger = entry.logger ? ` (${entry.logger})` : "";
  const source = entry.thread ? `${entry.thread}/${LEVEL_TEXT[entry.level]}` : LEVEL_TEXT[entry.level];
  return `[${logTime(entry.time)}] [${source}]${logger}`;
}

/** Entrée en texte, exception comprise, telle qu'on la colle pour le support. */
export function formatEntry(entry: LogEntry) {
  const prefix = logPrefix(entry);
  const line = prefix ? `${prefix} ${entry.message}` : entry.message;
  return entry.throwable ? `${line}\n${entry.throwable}` : line;
}

export const formatLog = (entries: LogEntry[]) => entries.map(formatEntry).join("\n");
