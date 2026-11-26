import { itemStartsLater, secondsOf } from "../../shared/window.ts";
import type { RundownItem } from "../../shared/types.ts";

export function nextPlanned(items: RundownItem[], sec: number): RundownItem | null {
  let chosen: RundownItem | null = null;
  let chosenStart = Infinity;
  for (const item of items) {
    if (!itemStartsLater(item, sec)) continue;
    const start = secondsOf(item.start);
    if (start < chosenStart) {
      chosen = item;
      chosenStart = start;
    }
  }
  return chosen;
}
