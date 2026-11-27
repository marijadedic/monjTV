import type { ScheduleBlock } from "../../../../../shared/types.ts";

export function blocksWith(
  blocks: ScheduleBlock[],
  block: ScheduleBlock,
  id: string | null,
): ScheduleBlock[] {
  return id
    ? blocks.map((item) => (item.id === id ? block : item))
    : [...blocks, block];
}
