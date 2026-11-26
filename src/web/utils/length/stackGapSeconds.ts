import { gapOf } from "../playlist/gapOf.ts";
import type { DraftItem } from "../../types/DraftItem.ts";

export function stackGapSeconds(items: DraftItem[]): number {
  return items.slice(0, -1).reduce((sum, item) => sum + gapOf(item) * 60, 0);
}
