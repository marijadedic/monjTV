import type { DraftItem } from "../../types/DraftItem.ts";

export function itemSeconds(item: DraftItem): number | null {
  if (item.durationSec != null) return item.durationSec;
  if (item.mode === "random-file" && item.lengthMin) return item.lengthMin * 60;
  return null;
}
