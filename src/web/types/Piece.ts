import type { Day, ScheduleBlock } from "../../shared/types.ts";

export type Piece =
  | { kind: "gap"; start: number; end: number }
  | {
      kind: "slot";
      block: ScheduleBlock;
      start: number;
      end: number;
      origin: Day;
    };
