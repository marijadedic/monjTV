import { gapOf } from "@utils/playlist/gapOf.ts";
import { itemSeconds } from "@utils/length/itemSeconds.ts";
import { toMin } from "@utils/clock/toMin.ts";
import type { DraftItem } from "../../types/DraftItem.ts";

export function nextItemMinute(start: string, items: DraftItem[]): number | null {
  let cursor = toMin(start);
  for (let index = 0; index < items.length; index++) {
    const sec = itemSeconds(items[index]);
    if (sec == null) return null;
    const endMin = cursor + Math.max(1, Math.ceil(sec / 60));
    const gap = index < items.length - 1 ? gapOf(items[index]) : 0;
    cursor = endMin + gap;
  }
  return cursor;
}
