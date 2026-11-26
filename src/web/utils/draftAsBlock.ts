import { endFromDuration } from "./endFromDuration.ts";
import { toEntry } from "./toEntry.ts";
import type { Draft } from "../types/Draft.ts";
import type { ScheduleBlock } from "../../shared/types.ts";

export function draftAsBlock(draft: Draft, durationSec: number): ScheduleBlock {
  const lengthMin = Math.max(1, Math.ceil(durationSec / 60));
  return {
    id: draft.id ?? "draft",
    days: draft.days,
    start: draft.start,
    end: endFromDuration(draft.start, durationSec),
    lengthMin,
    starts: draft.starts,
    folder: draft.folder,
    file: draft.file,
    mode: draft.mode,
    ...(draft.mode === "playlist"
      ? { name: draft.name.trim(), items: draft.items.map(toEntry) }
      : {}),
  };
}
