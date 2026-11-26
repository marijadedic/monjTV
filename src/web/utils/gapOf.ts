export function gapOf(item: { gapAfterMin?: number }): number {
  const mins = item.gapAfterMin;
  return mins && mins >= 1 ? mins : 0;
}
