import type { RundownItem } from "../../../shared/types.ts";

export function stillSrc(item: RundownItem): string {
  return `/api/tv/items/${encodeURIComponent(item.id)}/still?v=2&file=${encodeURIComponent(item.path)}`;
}
