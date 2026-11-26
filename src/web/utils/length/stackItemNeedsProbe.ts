import type { DraftItem } from "../../types/DraftItem.ts";

export function stackItemNeedsProbe(item: DraftItem): boolean {
  if (item.durationSec != null || item.error) return false;
  return item.mode === "next-episode" || item.mode === "specific-file";
}
