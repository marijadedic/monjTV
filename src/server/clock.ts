import type { Day } from "../shared/types.ts";

const JS_DAY_TO_DAY: Day[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

// Weekday key for a date.
export function weekday(d = new Date()): Day {
  return JS_DAY_TO_DAY[d.getDay()]!;
}

// Calendar date as YYYY-MM-DD.
export function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// HH:mm as seconds from midnight.
export function parseHm(hm: string): number {
  const [hRaw, mRaw] = hm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time: ${hm}`);
  }
  return h * 3600 + m * 60;
}

// Seconds from midnight as HH:mm.
export function formatHm(secFromMidnight: number): string {
  const wrapped = ((secFromMidnight % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Current time as seconds from midnight.
export function nowSec(d = new Date()): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

// Milliseconds until a clock time, wrapping to the next day if needed.
export function msUntil(secFromMidnight: number, d = new Date()): number {
  const target = new Date(d);
  const h = Math.floor(secFromMidnight / 3600);
  const m = Math.floor((secFromMidnight % 3600) / 60);
  const s = secFromMidnight % 60;
  target.setHours(h, m, s, 0);
  let ms = target.getTime() - d.getTime();
  if (ms < 0) ms += 86400_000;
  return ms;
}

// True when the string is HH:mm.
export function isHm(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}
