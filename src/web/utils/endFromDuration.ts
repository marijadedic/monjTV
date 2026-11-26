import { clockOf } from "../../shared/window.ts";
import { endMinute } from "./endMinute.ts";

export function endFromDuration(start: string, durationSec: number): string {
  return clockOf(endMinute(start, durationSec));
}
