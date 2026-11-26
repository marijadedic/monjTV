export function gapMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (!trimmed || !Number.isInteger(n) || n < 1) return null;
  return n;
}
