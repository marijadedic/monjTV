import type { ItemStatus, RundownItem } from "../../../shared/types.ts";
import { rowWatched } from "@utils/rundown/rowWatched.ts";

export function shownStatus(
  item: RundownItem,
  past: boolean,
  played: ReadonlySet<string>,
): ItemStatus {
  if (!past) return item.status;
  if (item.mode === "next-episode") {
    if (item.status === "done") return "done";
    return "skipped";
  }
  if (item.mode === "random-file") {
    if (rowWatched(item, played)) return "done";
    return "skipped";
  }
  return "done";
}
