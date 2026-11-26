import type { RundownItem } from "../../../shared/types.ts";

export function showsFrame(item: RundownItem): boolean {
  return item.mode === "next-episode" || item.mode === "random-file" || item.mode === "specific-file";
}
