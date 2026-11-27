import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
  youtubeLabel,
} from "../../../shared/youtube.ts";
import { fileTitle } from "@utils/label/fileTitle.ts";
import { folderLabel } from "@utils/label/folderLabel.ts";
import type { DraftItem } from "../../types/DraftItem.ts";

export function itemLabel(
  item: DraftItem,
  titles: Readonly<Record<string, string>>,
): string {
  if (item.mode === "specific-file" && parseYoutubeUrl(item.file)) {
    const url = parseYoutubeUrl(item.file)!;
    return titles[url] || item.title || youtubeLabel(item.file);
  }
  if (
    (item.mode === "next-episode" || item.mode === "random-file") &&
    canonicalPlaylistUrl(item.folder)
  ) {
    const url = canonicalPlaylistUrl(item.folder)!;
    return titles[url] || youtubeLabel(item.folder);
  }
  if (item.title) return item.title;
  if (item.mode === "specific-file" && item.file) return fileTitle(item.file);
  return folderLabel(item.folder);
}
