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

export function weekday(d = new Date()): Day {
  return JS_DAY_TO_DAY[d.getDay()]!;
}

export function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseHm(hm: string): number {
  const [hRaw, mRaw] = hm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time: ${hm}`);
  }
  return h * 3600 + m * 60;
}

export function formatHm(secFromMidnight: number): string {
  const wrapped = ((secFromMidnight % 86400) + 86400) % 86400;
  const h = Math.floor(wrapped / 3600);
  const m = Math.floor((wrapped % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function nowSec(d = new Date()): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

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

export function isHm(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}
