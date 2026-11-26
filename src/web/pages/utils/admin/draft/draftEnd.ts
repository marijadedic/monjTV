import type { SlotLength } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";
import { endFromDuration } from "@utils/clock/endFromDuration.ts";
import { fixedMinutes } from "@utils/length/fixedMinutes.ts";
import { measureKey } from "@utils/length/measureKey.ts";
import { stackSeconds } from "@utils/length/stackSeconds.ts";

export function draftEnd(
  current: Draft,
  measured: { key: string; length: SlotLength | null; error?: string } | null,
): Draft {
  if (current.mode === "playlist") {
    const sec = stackSeconds(current.items);
    if (!sec) {
      if (current.items.length > 0 && !current.items.some((item) => item.error)) return current;
      return current.end === "" ? current : { ...current, end: "" };
    }
    const end = endFromDuration(current.start, sec);
    return current.end === end ? current : { ...current, end };
  }
  if (current.lengthChoice !== "longest") {
    const mins = fixedMinutes(current);
    if (!mins) return current.end === "" ? current : { ...current, end: "" };
    const end = endFromDuration(current.start, mins * 60);
    return current.end === end ? current : { ...current, end };
  }
  if (!measured || measured.key !== measureKey(current)) return current;
  if (!measured.length) {
    if (measured.error) return current;
    return current.end === "" ? current : { ...current, end: "" };
  }
  const end = endFromDuration(current.start, measured.length.durationSec);
  return current.end === end ? current : { ...current, end };
}
