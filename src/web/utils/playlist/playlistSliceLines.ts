import { clipLabel } from "../label/clipLabel.ts";
import { DAY_MINUTES, clockOf } from "../../../shared/window.ts";
import { fromEntry } from "./fromEntry.ts";
import { gapOf } from "./gapOf.ts";
import { itemSeconds } from "../length/itemSeconds.ts";
import { placedOn, playlistRowsOn } from "../../../shared/placed.ts";
import { playlistGridName } from "./playlistGridName.ts";
import { takePlaylistRow } from "./takePlaylistRow.ts";
import { toMin } from "../clock/toMin.ts";
import type { Day, ScheduleBlock, TvBoard } from "../../../shared/types.ts";
import type { SliceLine } from "../../types/SliceLine.ts";
import type { SliceSide } from "../../types/SliceSide.ts";
import type { useI18n } from "../../i18n.tsx";

// Lines of a playlist that air on one side of midnight. A video that crosses is on both.
export function playlistSliceLines(
  block: ScheduleBlock,
  origin: Day,
  board: TvBoard | null,
  spill: boolean,
  t: ReturnType<typeof useI18n>["t"],
  titles: Readonly<Record<string, string>>,
): SliceLine[] {
  const unused = playlistRowsOn(block, origin, board);
  const placed = placedOn(block, origin, board);
  let cursor: number | null = placed.startMin;
  const lines: SliceLine[] = [];
  const entries = block.items ?? [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const row = takePlaylistRow(unused, entry);
    const item = fromEntry(entry, row?.durationSec ?? null, row?.title ?? "");
    const named = (row?.title ?? "").trim();
    const name = named ? clipLabel(named) : playlistGridName(item, titles);
    const gap = index < entries.length - 1 ? gapOf(entry) : 0;
    let side: SliceSide = "start";
    let text = name;
    if (row && row.durationSec > 0) {
      const startMin = toMin(row.start);
      const beginsNext = startMin < placed.startMin;
      const crosses = !beginsNext && toMin(row.end) < startMin;
      side = beginsNext ? "next" : crosses ? "cross" : "start";
      text =
        side === "cross"
          ? spill
            ? `${name} · ${t.sliceFrom(row.start)}`
            : `${name} · ${t.sliceEnds(row.end)}`
          : `${name} · ${row.start}`;
      cursor = (beginsNext ? DAY_MINUTES + startMin : startMin) + Math.ceil(row.durationSec / 60) + gap;
    } else {
      if (cursor == null) break;
      const begin: number = cursor;
      const sec = itemSeconds(item);
      if (sec == null) {
        side = begin >= DAY_MINUTES ? "next" : "start";
        text = `${name} · ${clockOf(begin)}`;
        lines.push({ key: entry.id, text, side });
        break;
      }
      const endMin: number = begin + Math.max(1, Math.ceil(sec / 60));
      cursor = endMin + gap;
      side = endMin <= DAY_MINUTES ? "start" : begin >= DAY_MINUTES ? "next" : "cross";
      text =
        side === "cross"
          ? spill
            ? `${name} · ${t.sliceFrom(clockOf(begin))}`
            : `${name} · ${t.sliceEnds(clockOf(endMin))}`
          : `${name} · ${clockOf(begin)}`;
    }
    lines.push({ key: entry.id, text, side });
    if (gap > 0) {
      const gapSide: SliceSide = side === "start" ? "start" : "next";
      lines.push({ key: `${entry.id}-gap`, text: t.playlistGapLine(gap), side: gapSide });
    }
  }
  return lines.filter((line) => (spill ? line.side !== "start" : line.side !== "next"));
}
