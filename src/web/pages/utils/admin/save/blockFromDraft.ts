import type { Day, ScheduleBlock, SlotLength } from "../../../../../shared/types.ts";
import { canonicalPlaylistUrl, parseYoutubeUrl } from "../../../../../shared/youtube.ts";
import type { Draft } from "../../../../types/Draft.ts";
import { chosenSeconds } from "@utils/length/chosenSeconds.ts";
import { parentDir } from "@utils/source/parentDir.ts";
import { toEntry } from "@utils/playlist/toEntry.ts";

function savedFolder(
  draft: Draft,
  file: string,
  playlist: boolean,
  tubeVideo: boolean,
  video: boolean,
  tubeList: boolean,
): string {
  if (playlist || tubeVideo) return "";
  if (video) return parentDir(file);
  if (tubeList) return canonicalPlaylistUrl(draft.folder) ?? draft.folder.trim();
  return draft.folder.trim();
}

export function blockFromDraft(
  draft: Draft,
  measured: { key: string; length: SlotLength | null } | null,
): ScheduleBlock {
  const tubeVideo = draft.mode === "specific-file" && draft.source === "youtube";
  const tubeList =
    (draft.mode === "next-episode" || draft.mode === "random-file") && draft.source === "youtube";
  const video = draft.mode === "specific-file" && draft.source === "path";
  const playlist = draft.mode === "playlist";
  const youtubeFile = tubeVideo ? parseYoutubeUrl(draft.file) : null;
  const file = youtubeFile ?? draft.file.trim();
  const sec = chosenSeconds(draft, measured);
  const slotMin = sec ? Math.max(1, Math.ceil(sec / 60)) : 0;
  const days = draft.days.includes(draft.origin) ? draft.days : [draft.origin, ...draft.days];
  const starts: Partial<Record<Day, string>> = {};
  for (const day of days) {
    if (day === draft.origin) continue;
    starts[day] = draft.starts[day] ?? draft.start;
  }
  return {
    id: draft.id ?? crypto.randomUUID(),
    days,
    start: draft.start,
    end: draft.end,
    ...(slotMin > 0 ? { lengthMin: slotMin } : {}),
    ...(Object.keys(starts).length > 0 ? { starts } : {}),
    folder: savedFolder(draft, file, playlist, tubeVideo, video, tubeList),
    ...((video || tubeVideo) && !playlist ? { file: youtubeFile ?? file } : {}),
    mode: draft.mode,
    ...(playlist ? { name: draft.name.trim(), items: draft.items.map(toEntry) } : {}),
  };
}
