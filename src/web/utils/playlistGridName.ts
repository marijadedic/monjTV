import { canonicalPlaylistUrl } from "../../shared/youtube.ts";
import { folderLabel } from "./folderLabel.ts";
import { itemLabel } from "./itemLabel.ts";
import type { DraftItem } from "../types/DraftItem.ts";

export function playlistGridName(
  item: DraftItem,
  titles: Readonly<Record<string, string>>,
): string {
  if (item.mode === "specific-file" || canonicalPlaylistUrl(item.folder)) return itemLabel(item, titles);
  return folderLabel(item.folder);
}
