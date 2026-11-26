import type { ItemMode } from "../../../shared/types.ts";

export function modeClass(mode: ItemMode): string {
  if (mode === "next-episode") return "shows";
  if (mode === "specific-file") return "film";
  return "movie";
}
