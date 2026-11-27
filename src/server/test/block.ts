// Fixtures for schedule rules. A test sets only the fields that rule cares about.
import type {
  RundownItem,
  Schedule,
  ScheduleBlock,
} from "../../shared/types.ts";

// A schedule block. Days, clock, folder, and mode are filled in.
export function block(
  partial: Partial<ScheduleBlock> & Pick<ScheduleBlock, "id">,
): ScheduleBlock {
  return {
    days: ["mon"],
    start: "18:00",
    end: "19:00",
    folder: "/shows/example",
    mode: "next-episode",
    ...partial,
  };
}

// One rundown row. The test sets the file, the clock, and the status.
export function row(
  partial: Partial<RundownItem> & Pick<RundownItem, "blockId" | "path">,
): RundownItem {
  return {
    id: partial.path,
    title: partial.path,
    mode: "specific-file",
    start: "18:00",
    end: "19:00",
    durationSec: 3600,
    status: "planned",
    ...partial,
  };
}

// A week that holds these blocks and no intermission.
export function week(blocks: ScheduleBlock[]): Schedule {
  return {
    blocks,
    intermissions: [],
    activeIntermission: "",
    intermissionRandomStart: false,
  };
}
