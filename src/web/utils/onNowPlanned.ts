import { itemCoversNow, secondsOf } from "../../shared/window.ts";
import type { RundownItem } from "../../shared/types.ts";

export function onNowPlanned(items: RundownItem[], sec: number): RundownItem | null {
  let chosen: RundownItem | null = null;
  for (const item of items) {
    if (item.status !== "planned" || !itemCoversNow(item, sec)) continue;
    if (!chosen || secondsOf(item.start) >= secondsOf(chosen.start)) chosen = item;
  }
  return chosen;
}
