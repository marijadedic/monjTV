import type { RundownItem } from "../../../shared/types.ts";
import type { useI18n } from "../../i18n.tsx";

export function scheduleMode(
  mode: RundownItem["mode"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (mode === "next-episode") return t.nextEpisode;
  if (mode === "specific-file") return t.oneVideo;
  return t.random;
}
