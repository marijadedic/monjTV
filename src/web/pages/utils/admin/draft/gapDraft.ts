import type { Day } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";
import { emptyStack } from "@utils/playlist/emptyStack.ts";
import { endFromDuration } from "@utils/clock/endFromDuration.ts";
import { inputTime } from "@utils/clock/inputTime.ts";

export function gapDraft(
  day: Day,
  startMin: number,
  endMin: number,
  at: number,
): Draft {
  let start = startMin + Math.round((at - startMin) / 30) * 30;
  start = Math.min(Math.max(start, startMin), endMin);
  if (endMin - start < 30) start = startMin;
  const startClock = inputTime(start);
  return {
    id: null,
    origin: day,
    days: [day],
    start: startClock,
    end: endFromDuration(startClock, 60 * 60),
    starts: {},
    folder: "",
    file: "",
    source: "path",
    mode: "random-file",
    ...emptyStack(),
    lengthChoice: 60,
    customMin: "",
    freeEnd: endMin,
    gapStart: startMin,
    formStep: "how",
    addPhase: "list",
    returnTo: null,
  };
}
