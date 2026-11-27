import type { RundownItem } from "../../../shared/types.ts";
import { secondsOf } from "../../../shared/window.ts";

// Overnight rows of one slot, with the latest real end.
export function carryGroups(items: RundownItem[]): { id: string; until: string; rows: RundownItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, RundownItem[]>();
  for (const item of items) {
    if (!item.overnight) continue;
    const rows = map.get(item.blockId);
    if (rows) rows.push(item);
    else {
      map.set(item.blockId, [item]);
      order.push(item.blockId);
    }
  }
  return order.map((id) => {
    const rows = map.get(id)!;
    let until = rows[0].end;
    let untilSec = secondsOf(until);
    for (const row of rows) {
      const sec = secondsOf(row.end);
      if (sec >= untilSec) {
        until = row.end;
        untilSec = sec;
      }
    }
    return { id, until, rows };
  });
}
