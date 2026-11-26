import { canonicalPlaylistUrl } from "../../../shared/youtube.ts";
import type { useI18n } from "../../i18n.tsx";
import type { DraftItem } from "../../types/DraftItem.ts";
import { clipLabel } from "@utils/label/clipLabel.ts";
import { modeLabel } from "@utils/label/modeLabel.ts";
import { playlistGridName } from "@utils/playlist/playlistGridName.ts";

export function playlistGridLine(
  item: DraftItem,
  t: ReturnType<typeof useI18n>["t"],
  titles: Readonly<Record<string, string>> = {},
): string {
  const kind = modeLabel(item.mode, t);
  const name = playlistGridName(item, titles);
  const shown =
    item.mode === "specific-file" || canonicalPlaylistUrl(item.folder) ? clipLabel(name) : name;
  return `${kind} - ${shown}`;
}
