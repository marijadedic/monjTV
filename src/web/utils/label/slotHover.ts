import type { BlockMode, PlaylistEntry } from "../../../shared/types.ts";
import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
} from "../../../shared/youtube.ts";

export function slotHover(
  block: {
    folder: string;
    file?: string;
    mode: BlockMode;
    name?: string;
    items?: PlaylistEntry[];
  },
  titles: Readonly<Record<string, string>>,
): string {
  if (block.mode === "playlist") {
    const name = (block.name ?? "").trim();
    const count = block.items?.length ?? 0;
    return name && count ? `${name}\n${count}` : name || String(count);
  }
  if (
    block.mode === "specific-file" &&
    block.file &&
    parseYoutubeUrl(block.file)
  ) {
    const url = parseYoutubeUrl(block.file);
    const title = url ? titles[url] : "";
    if (title && url) return `${title}\n${url}`;
    return block.file;
  }
  if (
    (block.mode === "next-episode" || block.mode === "random-file") &&
    canonicalPlaylistUrl(block.folder)
  ) {
    const url = canonicalPlaylistUrl(block.folder);
    const title = url ? titles[url] : "";
    if (title && url) return `${title}\n${url}`;
    return block.folder;
  }
  return block.file ?? block.folder;
}
