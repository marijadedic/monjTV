import { itemSeconds } from "./itemSeconds.ts";
import { stackGapSeconds } from "./stackGapSeconds.ts";
import type { DraftItem } from "../../types/DraftItem.ts";

export function stackSeconds(items: DraftItem[]): number | null {
  if (items.length === 0 || items.some((item) => item.error)) return null;
  if (items.some((item) => itemSeconds(item) == null && item.mode !== "random-file")) return null;
  const total = items.reduce((sum, item) => sum + (itemSeconds(item) ?? 0), 0) + stackGapSeconds(items);
  return total > 0 ? total : null;
}
