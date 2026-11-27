import type { DraftItem } from "../../types/DraftItem.ts";
import { gapOf } from "@utils/playlist/gapOf.ts";
import { itemSeconds } from "@utils/length/itemSeconds.ts";
import { minuteFace } from "@utils/clock/minuteFace.ts";
import { toMin } from "@utils/clock/toMin.ts";

export function stackClocks(
  start: string,
  items: DraftItem[],
): { start: string; end: string }[] {
  let cursor: number | null = toMin(start);
  return items.map((item, index) => {
    if (cursor == null) return { start: "/", end: "/" };
    const begin = cursor;
    const sec = itemSeconds(item);
    if (sec == null) {
      cursor = null;
      return { start: minuteFace(begin), end: "/" };
    }
    const endMin = begin + Math.max(1, Math.ceil(sec / 60));
    const gap = index < items.length - 1 ? gapOf(item) : 0;
    cursor = endMin + gap;
    return { start: minuteFace(begin), end: minuteFace(endMin) };
  });
}
