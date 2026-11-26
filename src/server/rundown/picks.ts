// A copy of progress while a day is placed.
import type { Progress, RundownItem, Schedule } from "../../shared/types.ts";
import { noteRandom } from "../schedule/progress.ts";
import { sortRundown, sourceFolder } from "./item.ts";

// A copy of progress, so placing one day does not change the saved history.
export function cloneProgress(progress: Progress): Progress {
  return {
    lastCompleted: { ...progress.lastCompleted },
    recentRandom: Object.fromEntries(
      Object.entries(progress.recentRandom).map(([folder, files]) => [folder, [...files]]),
    ),
  };
}

// Treat this day's planned picks as already chosen, so the next day continues the series.
// A skipped row does not use its episode or movie up. Overnight rows are the previous day's
// leftover, unless this is the live day and that leftover has not been written into progress yet.
export function notePicks(
  progress: Progress,
  items: RundownItem[],
  schedule: Schedule,
  includeOvernight = false,
): Progress {
  const next = cloneProgress(progress);
  for (const item of sortRundown(items)) {
    if (item.overnight && !includeOvernight) continue;
    if (item.status === "skipped") continue;
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block) continue;
    const folder = sourceFolder(item, block);
    if (!folder) continue;
    if (item.mode === "next-episode") next.lastCompleted[folder] = item.path;
    else if (item.mode === "random-file") {
      const prev = next.recentRandom[folder] ?? [];
      next.recentRandom[folder] = noteRandom(prev, item.path);
    }
  }
  return next;
}
