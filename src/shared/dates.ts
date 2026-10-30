import type { Day } from "./types.ts";

const ORDER: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Local calendar date at noon, so a daylight-saving shift stays on that date.
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDateKey(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export function weekdayOfKey(key: string): Day {
  return ORDER[parseDateKey(key).getDay()]!;
}

// Whole calendar days from `from` to `to`. Negative when `to` is earlier.
export function dateOffset(from: string, to: string): number {
  const a = parseDateKey(from).getTime();
  const b = parseDateKey(to).getTime();
  return Math.round((b - a) / 86_400_000);
}
