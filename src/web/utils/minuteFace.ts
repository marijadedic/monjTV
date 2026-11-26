import { clockFace } from "./clockFace.ts";
import { DAY_MINUTES, clockOf } from "../../shared/window.ts";

export function minuteFace(mins: number): string {
  if (mins > DAY_MINUTES) return clockOf(mins);
  return clockFace(mins);
}
