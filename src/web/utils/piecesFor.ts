import { DAY_MINUTES, leftoverMin, prevDay } from "../../shared/window.ts";
import { placedOn } from "../../shared/placed.ts";
import type { Day, ScheduleBlock, TvBoard } from "../../shared/types.ts";
import type { Piece } from "../types/Piece.ts";

export function piecesFor(day: Day, blocks: ScheduleBlock[], board: TvBoard | null): Piece[] {
  const mine: { block: ScheduleBlock; start: number; end: number; origin: Day }[] = [];
  for (const block of blocks) {
    if (block.days.includes(day)) {
      const placed = placedOn(block, day, board);
      const end = Math.min(placed.endMin, DAY_MINUTES);
      if (end > placed.startMin) mine.push({ block, start: placed.startMin, end, origin: day });
    }
    const prev = prevDay(day);
    if (block.days.includes(prev)) {
      const leftover = leftoverMin(placedOn(block, prev, board));
      if (leftover > 0) mine.push({ block, start: 0, end: leftover, origin: prev });
    }
  }
  mine.sort((a, b) => a.start - b.start);
  const out: Piece[] = [];
  let cursor = 0;
  for (const piece of mine) {
    if (piece.start > cursor) out.push({ kind: "gap", start: cursor, end: piece.start });
    out.push({ kind: "slot", ...piece });
    cursor = Math.max(cursor, piece.end);
  }
  if (cursor < DAY_MINUTES) out.push({ kind: "gap", start: cursor, end: DAY_MINUTES });
  return out;
}
