import type { ScheduleBlock } from "../../../shared/types.ts";

export function changedBlockIds(before: ScheduleBlock[], after: ScheduleBlock[]): string[] {
  return after
    .filter((block) => {
      const old = before.find((item) => item.id === block.id);
      return !old || JSON.stringify(old) !== JSON.stringify(block);
    })
    .map((block) => block.id);
}
