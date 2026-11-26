import { modeHint } from "./modeHint.ts";
import type { BlockMode } from "../../shared/types.ts";
import type { useI18n } from "../i18n.tsx";

export function blockHint(mode: BlockMode, t: ReturnType<typeof useI18n>["t"]): string {
  if (mode === "playlist") return t.playlistHint;
  return modeHint(mode, t);
}
