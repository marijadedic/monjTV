// Yesterday through six days ahead.
import { dateOffset, shiftDateKey } from "../../shared/dates.ts";
import type { BoardFile } from "./boardFile.ts";

export const TV_PAST = 1;
export const TV_AHEAD = 6;

// True when this date is yesterday through six days ahead.
export function inWindow(today: string, date: string): boolean {
  const offset = dateOffset(today, date);
  return offset >= -TV_PAST && offset <= TV_AHEAD;
}

// True when the saved week already covers the dates this read needs.
export function windowReady(board: BoardFile, today: string, fillAhead: boolean): boolean {
  if (board.carriedInto !== today) return false;
  const dates = new Set(board.days.map((day) => day.date));
  if (!dates.has(today)) return false;
  if (board.days.some((day) => !inWindow(today, day.date))) return false;
  if (!fillAhead) return true;
  for (let offset = -TV_PAST; offset <= TV_AHEAD; offset++) {
    if (!dates.has(shiftDateKey(today, offset))) return false;
  }
  return true;
}
