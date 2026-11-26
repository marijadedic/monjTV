import "./styles/WeekScale.css";
import type { Day, Schedule, ScheduleBlock, TvBoard } from "../../../shared/types.ts";
import type { Draft } from "../../types/Draft.ts";
import { piecesFor } from "../../utils/week/piecesFor.ts";
import { slotKind } from "../../utils/label/slotKind.ts";
import { DayColumn } from "./DayColumn.tsx";
import { GapBlock } from "./GapBlock.tsx";
import { GhostBlock } from "./GhostBlock.tsx";
import { SlotBlock } from "./SlotBlock.tsx";

type Ghost = { start: number; end: number; continues: boolean; spill: boolean };

export function WeekScale({
  days,
  schedule,
  board,
  draft,
  today,
  building,
  titles,
  fallbackName,
  ghostsByDay,
  onOpenGap,
  onOpenSlot,
}: {
  days: readonly Day[];
  schedule: Schedule;
  board: TvBoard | null;
  draft: Draft | null;
  today: Day;
  building: string[];
  titles: Readonly<Record<string, string>>;
  fallbackName: string;
  ghostsByDay: Partial<Record<Day, Ghost[]>> | null;
  onOpenGap: (day: Day, start: number, end: number, at: number) => void;
  onOpenSlot: (block: ScheduleBlock, origin: Day) => void;
}) {
  return (
    <div class="week-scale">
      {days.map((day) => {
        const pieces = piecesFor(day, schedule.blocks, board);
        const emptyDay = pieces.length === 1 && pieces[0]?.kind === "gap";
        const editing = draft?.origin === day;
        const rows = [
          ...pieces,
          ...(ghostsByDay?.[day] ?? []).map((ghost) => ({
            kind: "ghost" as const,
            start: ghost.start,
            end: ghost.end,
            continues: ghost.continues,
            spill: ghost.spill,
          })),
        ].sort((a, b) => a.start - b.start || (a.kind === "ghost" ? 1 : -1));
        return (
          <DayColumn key={day} day={day} today={today} editing={editing}>
            {rows.map((piece) => {
              if (piece.kind === "ghost") {
                return (
                  <GhostBlock
                    key={`ghost-${piece.start}-${piece.end}`}
                    start={piece.start}
                    end={piece.end}
                    continues={piece.continues}
                    spill={piece.spill}
                    tone={draft ? slotKind(draft) : ""}
                    day={day}
                  />
                );
              }
              if (piece.kind === "gap") {
                return (
                  <GapBlock
                    key={`gap-${piece.start}`}
                    start={piece.start}
                    end={piece.end}
                    emptyDay={emptyDay}
                    fallbackName={fallbackName}
                    onOpen={(at) => onOpenGap(day, piece.start, piece.end, at)}
                  />
                );
              }
              return (
                <SlotBlock
                  key={`${piece.block.id}-${piece.origin}-${piece.start}`}
                  block={piece.block}
                  start={piece.start}
                  end={piece.end}
                  origin={piece.origin}
                  day={day}
                  board={board}
                  draft={draft}
                  building={building}
                  titles={titles}
                  onOpen={() => onOpenSlot(piece.block, piece.origin)}
                />
              );
            })}
          </DayColumn>
        );
      })}
    </div>
  );
}
