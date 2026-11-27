import type { ScheduleBlock } from "../../../../../shared/types.ts";

export function blocksWithout(
  blocks: ScheduleBlock[],
  id: string,
): ScheduleBlock[] {
  return blocks.filter((item) => item.id !== id);
}
