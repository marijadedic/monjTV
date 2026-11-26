import type { BlockMode } from "../../../shared/types.ts";
import type { useI18n } from "../../i18n.tsx";
import type { PlaySource } from "../../types/PlaySource.ts";

export function sourcePrompt(
  mode: BlockMode,
  source: PlaySource,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (source === "youtube" && mode === "specific-file") return t.chooseYoutube;
  if (source === "youtube") return t.choosePlaylist;
  if (mode === "specific-file") return t.chooseVideo;
  return t.chooseFolder;
}
