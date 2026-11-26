import { secondsOf } from "../../shared/window.ts";
import type { RundownItem } from "../../shared/types.ts";

// A file whose clock starts the previous evening and ends after midnight.
export function beganPreviousDay(item: RundownItem): boolean {
  return Boolean(item.overnight) && secondsOf(item.start) > secondsOf(item.end);
}
