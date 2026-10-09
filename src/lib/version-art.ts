import { versionFamily } from "./game-versions";

const art = import.meta.glob<string>("../assets/versions/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
export function versionImage(id: string): string {
  return (
    art[`../assets/versions/${versionFamily(id)}.webp`] ??
    art["../assets/versions/26.3.webp"]
  );
}
