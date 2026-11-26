import type { RundownItem } from "../../../shared/types.ts";

export function canStepEpisode(item: RundownItem, passed: boolean): boolean {
  return item.mode === "next-episode" && !passed;
}
