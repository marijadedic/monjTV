import type { ItemMode } from "../../shared/types.ts";
import type { useI18n } from "../i18n.tsx";

export function modeHint(mode: ItemMode, t: ReturnType<typeof useI18n>["t"]): string {
  if (mode === "next-episode") return t.nextHint;
  if (mode === "specific-file") return t.oneHint;
  return t.randomHint;
}
