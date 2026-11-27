import type { SlotLength } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";

export function withProbe(
  current: Draft,
  itemId: string,
  length: SlotLength | null,
  error?: string,
): Draft {
  if (current.mode !== "playlist") return current;
  return {
    ...current,
    items: current.items.map((row) => {
      if (row.id !== itemId || row.durationSec != null) return row;
      if (error) return { ...row, error, durationSec: null };
      if (!length)
        return { ...row, durationSec: null, error: "No video found there." };
      return {
        ...row,
        durationSec: length.durationSec,
        title: length.title,
        error: undefined,
      };
    }),
  };
}
