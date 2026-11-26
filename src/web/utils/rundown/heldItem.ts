import { itemCoversNow } from "../../../shared/window.ts";
import { onNowPlanned } from "./onNowPlanned.ts";
import type { RundownItem } from "../../../shared/types.ts";

export function heldItem(items: RundownItem[], sec: number): RundownItem | null {
  const winner = onNowPlanned(items, sec);
  if (!winner) return null;
  for (const item of items) {
    if (item.status !== "planned" || !itemCoversNow(item, sec)) continue;
    if (item.id !== winner.id) return item;
  }
  return null;
}
