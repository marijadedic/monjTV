import type { Schedule } from "../../../shared/types.ts";

export function emptySchedule(): Schedule {
  return { blocks: [], intermissions: [], activeIntermission: "", intermissionRandomStart: false };
}
