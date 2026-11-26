import type { DraftItem } from "../../../../types/DraftItem.ts";

export function withoutGap(items: DraftItem[], itemId: string): DraftItem[] {
  return items.map((item) => {
    if (item.id !== itemId) return item;
    const next = { ...item };
    delete next.gapAfterMin;
    return next;
  });
}
