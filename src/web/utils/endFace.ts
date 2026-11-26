import { clockFace } from "./clockFace.ts";
import { DAY_MINUTES, clockOf } from "../../shared/window.ts";
import { endMinute } from "./endMinute.ts";

export function endFace(start: string, durationSec: number): string {
  const endMin = endMinute(start, durationSec);
  if (endMin > DAY_MINUTES) return clockOf(endMin);
  return clockFace(endMin);
}
