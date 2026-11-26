import { gapOf } from "./gapOf.ts";

export function gapFields(item: { gapAfterMin?: number }): { gapAfterMin?: number } {
  const mins = gapOf(item);
  return mins ? { gapAfterMin: mins } : {};
}
