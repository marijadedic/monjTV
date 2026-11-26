import type { ClockParts } from "../messages.ts";
import { fill } from "./fill.ts";

export function hoursMinutes(mins: number, parts: ClockParts): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return fill(parts.both, { h, m });
  if (h) return fill(parts.hours, { h });
  return fill(parts.minutes, { m });
}
