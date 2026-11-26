import { DAY_MINUTES } from "../../shared/window.ts";
import { fixedMinutes } from "./fixedMinutes.ts";
import { toMin } from "./toMin.ts";
import type { Draft } from "../types/Draft.ts";

export function draftSpanMin(draft: Draft): number {
  const fixed = fixedMinutes(draft);
  if (fixed) return fixed;
  if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) return 0;
  const start = toMin(draft.start);
  const end = toMin(draft.end);
  if (end > start) return end - start;
  if (end < start) return DAY_MINUTES - start + end;
  return 0;
}
