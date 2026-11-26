import { toMin } from "../clock/toMin.ts";
import { windowOn } from "../../../shared/window.ts";
import type { Day, ScheduleBlock } from "../../../shared/types.ts";

export function nextOnDay(
  day: Day,
  start: string,
  blocks: ScheduleBlock[],
  exceptId: string | null,
): ScheduleBlock | null {
  if (!/^\d{2}:\d{2}$/.test(start)) return null;
  const startMin = toMin(start);
  let next: ScheduleBlock | null = null;
  for (const block of blocks) {
    if (block.id === exceptId) continue;
    if (!block.days.includes(day)) continue;
    const placed = windowOn(block, day);
    if (toMin(placed.start) < startMin) continue;
    if (!next || toMin(placed.start) < toMin(windowOn(next, day).start)) next = block;
  }
  return next;
}
