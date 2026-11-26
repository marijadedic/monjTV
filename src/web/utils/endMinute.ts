import { toMin } from "./toMin.ts";

export function endMinute(start: string, durationSec: number): number {
  return toMin(start) + Math.max(1, Math.ceil(durationSec / 60));
}
