import type { DraftItem } from "../../../../types/DraftItem.ts";

export function withGap(
  items: DraftItem[],
  itemId: string,
  minutes: number,
): DraftItem[] {
  return items.map((item) =>
    item.id === itemId ? { ...item, gapAfterMin: minutes } : item,
  );
}
