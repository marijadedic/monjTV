import { segmentsPlaced } from "../../../shared/placed.ts";
import type { Day, ScheduleBlock, TvBoard } from "../../../shared/types.ts";
import { clockOf, segmentsOf } from "../../../shared/window.ts";
import type { Draft } from "../../types/Draft.ts";
import { draftAsBlock } from "@utils/week/draftAsBlock.ts";
import { slotLabel } from "@utils/label/slotLabel.ts";

export function dayClashes(
  draft: Draft,
  blocks: ScheduleBlock[],
  durationSec: number,
  titles: Readonly<Record<string, string>> = {},
  board: TvBoard | null = null,
): { day: Day; title: string; start: string; end: string }[] {
  const clashes: { day: Day; title: string; start: string; end: string }[] = [];
  const next = draftAsBlock(draft, durationSec);
  const draftSegs = segmentsOf(next);
  for (const block of blocks) {
    if (block.id === next.id) continue;
    for (const other of segmentsPlaced(block, board)) {
      for (const mine of draftSegs) {
        if (mine.day !== other.day) continue;
        if (mine.start < other.end && other.start < mine.end) {
          clashes.push({
            day: mine.day,
            title: slotLabel(block, titles),
            start: clockOf(other.start),
            end: clockOf(other.end),
          });
        }
      }
    }
  }
  return clashes;
}
