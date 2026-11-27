import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
} from "../../../shared/youtube.ts";
import { gapFields } from "@utils/playlist/gapFields.ts";
import { parentDir } from "@utils/source/parentDir.ts";
import type { DraftItem } from "../../types/DraftItem.ts";
import type { PlaylistEntry } from "../../../shared/types.ts";

export function toEntry(item: DraftItem): PlaylistEntry {
  const file = item.file.trim();
  const gap = gapFields(item);
  if (item.mode === "specific-file") {
    const youtube = parseYoutubeUrl(file);
    if (youtube)
      return {
        id: item.id,
        mode: item.mode,
        folder: "",
        file: youtube,
        ...gap,
      };
    return {
      id: item.id,
      mode: item.mode,
      folder: parentDir(file),
      file,
      ...gap,
    };
  }
  if (item.mode === "next-episode" || item.mode === "random-file") {
    const playlist = canonicalPlaylistUrl(item.folder);
    return {
      id: item.id,
      mode: item.mode,
      folder: playlist ?? item.folder.trim(),
      ...(item.mode === "random-file" && item.lengthMin
        ? { lengthMin: item.lengthMin }
        : {}),
      ...gap,
    };
  }
  return {
    id: item.id,
    mode: item.mode,
    folder: item.folder.trim(),
    ...gap,
  };
}
