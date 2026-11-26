import { playlistMinutesOn } from "../../../shared/placed.ts";
import type { Day, ScheduleBlock, TvBoard } from "../../../shared/types.ts";
import { DAY_MINUTES, lengthMinutes, nextDay, windowOn } from "../../../shared/window.ts";
import type { Draft } from "../../types/Draft.ts";
import { draftSpanMin } from "../length/draftSpanMin.ts";
import { startOnDraft } from "./startOnDraft.ts";
import { toMin } from "../clock/toMin.ts";

export function ghostsOn(
  draft: Draft,
  day: Day,
  blocks: ScheduleBlock[],
  board: TvBoard | null,
): { start: number; end: number; continues: boolean; spill: boolean }[] {
  const span = draftSpanMin(draft);
  if (span < 1) return [];
  const saved = draft.id ? blocks.find((block) => block.id === draft.id) : undefined;
  const shown = saved ? (playlistMinutesOn(saved, draft.origin, board) ?? lengthMinutes(saved)) : 0;
  if (saved && windowOn(saved, draft.origin).start === draft.start && shown === span) {
    return [];
  }
  const out: { start: number; end: number; continues: boolean; spill: boolean }[] = [];
  for (const air of draft.days) {
    const start = toMin(startOnDraft(draft, air));
    if (day === air) {
      out.push({
        start,
        end: Math.min(start + span, DAY_MINUTES),
        continues: start + span > DAY_MINUTES,
        spill: false,
      });
    }
    if (day === nextDay(air)) {
      const leftover = start + span - DAY_MINUTES;
      if (leftover > 0) out.push({ start: 0, end: leftover, continues: false, spill: true });
    }
  }
  return out;
}
