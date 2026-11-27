import { addMeasureCap } from "@utils/length/addMeasureCap.ts";
import { canonicalPlaylistUrl } from "../../../shared/youtube.ts";
import type { Draft } from "../../types/Draft.ts";

export function measureKey(draft: Draft): string {
  const mode = draft.mode === "playlist" ? draft.addMode : draft.mode;
  const folder = draft.mode === "playlist" ? draft.addFolder : draft.folder;
  const file = draft.mode === "playlist" ? draft.addFile : draft.file;
  if (mode === "specific-file") {
    return `video:${file.trim()}`;
  }
  const playlist = canonicalPlaylistUrl(folder);
  if ((mode === "next-episode" || mode === "random-file") && playlist)
    return `${mode}:${playlist}`;
  const cap = addMeasureCap(draft);
  return cap ? `${mode}:${folder.trim()}:${cap}` : `${mode}:${folder.trim()}`;
}
