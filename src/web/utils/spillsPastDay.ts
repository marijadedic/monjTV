import { DAY_MINUTES } from "../../shared/window.ts";
import { endMinute } from "./endMinute.ts";

export function spillsPastDay(start: string, durationSec: number): boolean {
  return endMinute(start, durationSec) > DAY_MINUTES;
}
