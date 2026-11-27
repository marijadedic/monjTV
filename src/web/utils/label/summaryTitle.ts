import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
} from "../../../shared/youtube.ts";
import type { Draft } from "../../types/Draft.ts";

export function summaryTitle(
  draft: Draft,
  titles: Readonly<Record<string, string>>,
  unnamed: string,
): string {
  if (draft.mode === "playlist") return draft.name || unnamed;

  if (draft.mode === "specific-file" && draft.source === "youtube") {
    return titles[parseYoutubeUrl(draft.file) ?? ""] || draft.file;
  }
  if (draft.source === "youtube") {
    return titles[canonicalPlaylistUrl(draft.folder) ?? ""] || draft.folder;
  }
  if (draft.mode === "specific-file")
    return draft.file.split(/[\\/]/).pop() || draft.file;
  return draft.folder;
}
