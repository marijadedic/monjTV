import { canonicalPlaylistUrl, parseYoutubeUrl } from "../../../../../shared/youtube.ts";
import type { ItemMode } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";
import { addMeasureCap } from "../../../../utils/length/addMeasureCap.ts";
import { measureKey } from "../../../../utils/length/measureKey.ts";
import { playlistAddNeedsMeasure } from "../../../../utils/length/playlistAddNeedsMeasure.ts";

export type MeasurePlan =
  | { action: "clear" }
  | { action: "empty"; key: string }
  | {
      action: "run";
      key: string;
      mode: ItemMode;
      folder: string;
      file: string;
      cap: number | undefined;
      countRandom: boolean;
    };

export function measurePlan(draft: Draft | null): MeasurePlan {
  const needsMeasure = draft
    ? draft.mode === "playlist"
      ? playlistAddNeedsMeasure(draft)
      : (draft.mode === "specific-file" && draft.source === "youtube") || draft.lengthChoice === "longest"
    : false;
  if (!draft || !needsMeasure) return { action: "clear" };
  const mode = draft.mode === "playlist" ? draft.addMode : draft.mode;
  const folder = draft.mode === "playlist" ? draft.addFolder : draft.folder;
  const file = draft.mode === "playlist" ? draft.addFile : draft.file;
  const key = measureKey(draft);
  const source = draft.mode === "playlist" ? draft.addSource : draft.source;
  const tubeVideo = mode === "specific-file" && source === "youtube";
  const tubeList = (mode === "next-episode" || mode === "random-file") && source === "youtube";
  const empty = tubeVideo
    ? !parseYoutubeUrl(file)
    : tubeList
      ? !canonicalPlaylistUrl(folder)
      : mode === "specific-file"
        ? !file.trim()
        : !folder.trim();
  if (empty) return { action: "empty", key };
  return {
    action: "run",
    key,
    mode,
    folder,
    file,
    cap: addMeasureCap(draft),
    countRandom: mode === "random-file",
  };
}
