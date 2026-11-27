import type { DayWindow } from "../../../shared/window.ts";
import type { Draft } from "../../types/Draft.ts";
import { endFace } from "@utils/clock/endFace.ts";
import { toMin } from "@utils/clock/toMin.ts";
import { startOnDraft } from "@utils/week/startOnDraft.ts";

export function summaryEnd(
  draft: Draft,
  stackSec: number | null,
  activeSec: number,
  painted: DayWindow | null,
): string {
  if (draft.mode === "playlist") {
    if (stackSec != null) return endFace(draft.start, stackSec);
    if (draft.end) return draft.end;
    if (
      painted &&
      startOnDraft(draft, draft.origin) === painted.start &&
      painted.end
    )
      return painted.end;
    return "/";
  }

  if (activeSec) return endFace(draft.start, activeSec);
  return draft.end;
}

export function summaryMinutes(
  draft: Draft,
  stackSec: number | null,
  activeSec: number,
  fixedMin: number | null,
): number | null {
  if (draft.mode === "playlist" && stackSec != null)
    return Math.max(1, Math.ceil(stackSec / 60));
  if (activeSec) return Math.max(1, Math.ceil(activeSec / 60));
  return fixedMin;
}

export function summaryLength(
  draft: Draft,
  minutes: number | null,
  end: string,
  label: (mins: number) => string,
): string {
  if (minutes != null && minutes > 0) return label(minutes);
  if (end && end !== "/")
    return label(Math.max(1, toMin(end) - toMin(draft.start)));
  return "";
}
