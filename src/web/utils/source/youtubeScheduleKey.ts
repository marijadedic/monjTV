import { canonicalYoutubeIntermission, parseYoutubeUrl } from "../../../shared/youtube.ts";
import { youtubeRefsOf } from "./youtubeRefsOf.ts";
import type { Schedule } from "../../../shared/types.ts";

export function youtubeScheduleKey(schedule: Schedule, extra = ""): string {
  const urls = new Set<string>();
  for (const item of schedule.intermissions) {
    if (item.kind !== "youtube") continue;
    const url = canonicalYoutubeIntermission(item.source);
    if (url) urls.add(url);
  }
  for (const piece of extra.split("\n")) {
    const url = canonicalYoutubeIntermission(piece) ?? parseYoutubeUrl(piece);
    if (url) urls.add(url);
  }
  for (const block of schedule.blocks) {
    const files =
      block.mode === "playlist"
        ? (block.items ?? []).flatMap((item) => youtubeRefsOf(item.mode, item.folder, item.file))
        : youtubeRefsOf(block.mode, block.folder, block.file);
    for (const file of files) urls.add(file);
  }
  return [...urls].sort().join("\n");
}
