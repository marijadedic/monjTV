import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
} from "../../../shared/youtube.ts";
import type { Draft } from "../../types/Draft.ts";

export function pathChosen(draft: Draft): boolean {
  const adding = draft.mode === "playlist";
  const source = adding ? draft.addSource : draft.source;
  const mode = adding ? draft.addMode : draft.mode;
  const file = adding ? draft.addFile : draft.file;
  const folder = adding ? draft.addFolder : draft.folder;

  if (source === "youtube") {
    if (mode === "specific-file") return Boolean(parseYoutubeUrl(file));
    return Boolean(canonicalPlaylistUrl(folder));
  }
  if (mode === "specific-file") return Boolean(file.trim());
  return Boolean(folder.trim());
}
