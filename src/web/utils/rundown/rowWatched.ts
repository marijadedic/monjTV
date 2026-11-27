import type { RundownItem } from "../../../shared/types.ts";

export function rowWatched(
  item: RundownItem,
  played: ReadonlySet<string>,
): boolean {
  if (item.mode === "random-file") return played.has(item.path);
  return item.status === "done";
}
