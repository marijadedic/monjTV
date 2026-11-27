import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
} from "../../../../../shared/youtube.ts";
import type { ItemMode } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";
import type { PlaySource } from "../../../../types/PlaySource.ts";
import { addMeasureCap } from "@utils/length/addMeasureCap.ts";
import { measureKey } from "@utils/length/measureKey.ts";
import { playlistAddNeedsMeasure } from "@utils/length/playlistAddNeedsMeasure.ts";

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

function needsMeasure(draft: Draft): boolean {
  if (draft.mode === "playlist") return playlistAddNeedsMeasure(draft);
  if (draft.mode === "specific-file" && draft.source === "youtube") return true;
  return draft.lengthChoice === "longest";
}

function sourceEmpty(
  mode: ItemMode,
  source: PlaySource,
  file: string,
  folder: string,
): boolean {
  if (mode === "specific-file" && source === "youtube")
    return !parseYoutubeUrl(file);
  if (
    (mode === "next-episode" || mode === "random-file") &&
    source === "youtube"
  ) {
    return !canonicalPlaylistUrl(folder);
  }
  if (mode === "specific-file") return !file.trim();
  return !folder.trim();
}

export function measurePlan(draft: Draft | null): MeasurePlan {
  if (!draft || !needsMeasure(draft)) return { action: "clear" };

  const mode = draft.mode === "playlist" ? draft.addMode : draft.mode;
  const folder = draft.mode === "playlist" ? draft.addFolder : draft.folder;
  const file = draft.mode === "playlist" ? draft.addFile : draft.file;
  const key = measureKey(draft);
  const source = draft.mode === "playlist" ? draft.addSource : draft.source;
  if (sourceEmpty(mode, source, file, folder)) return { action: "empty", key };

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
