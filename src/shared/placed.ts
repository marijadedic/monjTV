import { weekdayOfKey } from "./dates.ts";
import type { Day, RundownItem, ScheduleBlock, TvBoard } from "./types.ts";
import {
  DAY_MINUTES,
  clockOf,
  leftoverMin,
  minutesOf,
  nextDay,
  windowOn,
  type DaySegment,
  type DayWindow,
} from "./window.ts";

// Files this playlist airs on that weekday. Prefers the upcoming date.
export function playlistRowsOn(
  block: ScheduleBlock,
  day: Day,
  board: TvBoard | null,
): RundownItem[] {
  if (block.mode !== "playlist" || !board) return [];
  const matches = board.days.filter((entry) => weekdayOfKey(entry.date) === day);
  const upcoming = matches.find((entry) => entry.date >= board.today) ?? matches[matches.length - 1];
  if (!upcoming) return [];
  return upcoming.items.filter((item) => item.blockId === block.id && !item.overnight);
}

// Minutes those files occupy. Null when the board has not built this slot yet.
export function playlistMinutesOn(
  block: ScheduleBlock,
  day: Day,
  board: TvBoard | null,
): number | null {
  const items = playlistRowsOn(block, day, board);
  if (items.length === 0) return null;
  let startMin = Infinity;
  let endMin = -Infinity;
  for (const item of items) {
    const start = minutesOf(item.start);
    const end = start + item.durationSec / 60;
    if (start < startMin) startMin = start;
    if (end > endMin) endMin = end;
  }
  const span = endMin - startMin;
  return span > 0 ? Math.max(1, Math.ceil(span)) : null;
}

// Start from the week, height from the TV schedule for a playlist.
export function placedOn(block: ScheduleBlock, day: Day, board: TvBoard | null): DayWindow {
  const placed = windowOn(block, day);
  const mins = playlistMinutesOn(block, day, board);
  if (mins == null) return placed;
  const endMin = placed.startMin + mins;
  return { start: placed.start, end: clockOf(endMin), startMin: placed.startMin, endMin };
}

// Clock pieces including leftover past midnight, using placed height.
export function segmentsPlaced(block: ScheduleBlock, board: TvBoard | null): DaySegment[] {
  const out: DaySegment[] = [];
  for (const day of block.days) {
    const placed = placedOn(block, day, board);
    out.push({ day, start: placed.startMin, end: Math.min(placed.endMin, DAY_MINUTES) });
    const leftover = leftoverMin(placed);
    if (leftover > 0) out.push({ day: nextDay(day), start: 0, end: leftover });
  }
  return out;
}
