import type { ItemMode } from "../../../shared/types.ts";
import type { useI18n } from "../../i18n.tsx";

export function youtubeAddNote(mode: ItemMode, t: ReturnType<typeof useI18n>["t"]): string {
  if (mode === "next-episode") return t.youtubePlaylistNote;
  if (mode === "random-file") return t.youtubeRandomNote;
  return t.youtubeCaveat;
}
