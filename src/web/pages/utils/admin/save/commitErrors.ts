import { DAY_MINUTES } from "../../../../../shared/window.ts";
import { canonicalPlaylistUrl, isYoutubeLink, parseYoutubeUrl } from "../../../../../shared/youtube.ts";
import type { SlotLength } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";
import type { FieldError } from "../../../../types/FieldError.ts";
import { chosenSeconds } from "@utils/length/chosenSeconds.ts";
import { stackItemNeedsProbe } from "@utils/length/stackItemNeedsProbe.ts";

export function commitErrors(
  draft: Draft,
  measured: { key: string; length: SlotLength | null } | null,
  measuring: boolean,
  sourceMissing: boolean,
  missing: { video: string; folder: string },
): FieldError {
  const next: FieldError = {};
  const stackBusy = draft.mode === "playlist" && draft.items.some(stackItemNeedsProbe);
  const tubeVideo = draft.mode === "specific-file" && draft.source === "youtube";
  const tubeList =
    (draft.mode === "next-episode" || draft.mode === "random-file") && draft.source === "youtube";
  const waitsForMeasure =
    draft.mode !== "playlist" && measuring && (tubeVideo || draft.lengthChoice === "longest");
  if (waitsForMeasure) {
    next.time = "Still measuring the video.";
  } else if (stackBusy) {
    next.time = "Still measuring the video.";
  } else if (draft.mode === "playlist" && !draft.name.trim()) {
    next.folder = "Each playlist needs a name";
  } else if (draft.mode === "playlist" && draft.items.length === 0) {
    next.folder = "Each playlist needs at least one video";
  } else if (!draft.end) {
    next.time =
      draft.mode === "playlist"
        ? "Each playlist needs at least one video"
        : "Choose a video, folder, or YouTube URL to set the length.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) {
    next.time = "start and end must be HH:mm";
  } else {
    const sec = chosenSeconds(draft, measured);
    const slotMin = sec ? Math.max(1, Math.ceil(sec / 60)) : 0;
    if (slotMin >= DAY_MINUTES) next.time = "Block must be shorter than 24 hours";
    for (const day of draft.days) {
      if (day === draft.origin) continue;
      const start = draft.starts[day] ?? draft.start;
      if (!/^\d{2}:\d{2}$/.test(start)) {
        next.time = "start and end must be HH:mm";
        break;
      }
    }
  }
  const video = draft.mode === "specific-file" && draft.source === "path";
  const playlist = draft.mode === "playlist";
  if (playlist) {
    const broken = draft.items.find((item) => item.error);
    if (broken?.error) next.folder = broken.error;
  } else if (tubeVideo) {
    if (!draft.file.trim()) next.folder = "Each specific-file block needs a video";
    else if (!parseYoutubeUrl(draft.file)) next.folder = "Not a YouTube video URL";
  } else if (tubeList) {
    if (!draft.folder.trim()) next.folder = "Type a YouTube playlist URL.";
    else if (!canonicalPlaylistUrl(draft.folder)) next.folder = "Not a YouTube playlist URL";
  } else if (video) {
    if (!draft.file.trim()) next.folder = "Each specific-file block needs a video";
    else if (isYoutubeLink(draft.file)) next.folder = "That is a YouTube link. Choose YouTube, then add it.";
  } else if (!draft.folder.trim()) {
    next.folder = "Each block needs a folder";
  } else if (isYoutubeLink(draft.folder)) {
    next.folder =
      draft.mode === "next-episode"
        ? "Not a YouTube playlist URL"
        : "That is a YouTube link. Choose YouTube, then add it.";
  }
  if (sourceMissing) {
    next.folder = draft.mode === "specific-file" ? missing.video : missing.folder;
  }
  return next;
}
