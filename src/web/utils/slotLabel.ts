import type { BlockMode } from "../../shared/types.ts";
import { canonicalPlaylistUrl, parseYoutubeUrl, youtubeLabel } from "../../shared/youtube.ts";
import { fileTitle } from "./fileTitle.ts";
import { folderLabel } from "./folderLabel.ts";

export function slotLabel(
  block: { folder: string; file?: string; mode: BlockMode; name?: string },
  titles: Readonly<Record<string, string>> = {},
): string {
  if (block.mode === "playlist") return (block.name ?? "").trim() || "Playlist";
  if (block.mode === "specific-file" && block.file && parseYoutubeUrl(block.file)) {
    const url = parseYoutubeUrl(block.file);
    if (url && titles[url]) return titles[url];
    return youtubeLabel(block.file);
  }
  if ((block.mode === "next-episode" || block.mode === "random-file") && canonicalPlaylistUrl(block.folder)) {
    const url = canonicalPlaylistUrl(block.folder);
    if (url && titles[url]) return titles[url];
    return youtubeLabel(block.folder);
  }
  if (block.mode === "specific-file" && block.file) return fileTitle(block.file);
  return folderLabel(block.folder);
}
