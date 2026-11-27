import { fromEntry } from "@utils/playlist/fromEntry.ts";
import { playlistRowsOn } from "../../../shared/placed.ts";
import { takePlaylistRow } from "@utils/playlist/takePlaylistRow.ts";
import type { Day, ScheduleBlock, TvBoard } from "../../../shared/types.ts";
import type { DraftItem } from "../../types/DraftItem.ts";

export function fromPlaylist(
  block: ScheduleBlock,
  day: Day,
  board: TvBoard | null,
): DraftItem[] {
  const unused = playlistRowsOn(block, day, board);
  return (block.items ?? []).map((entry) => {
    const row = takePlaylistRow(unused, entry);
    return fromEntry(entry, row?.durationSec ?? null, row?.title ?? "");
  });
}
