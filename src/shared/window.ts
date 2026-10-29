import { DAYS, type Day, type ScheduleBlock } from "./types.ts";

export const DAY_MINUTES = 24 * 60;
export const DAY_SECONDS = 24 * 3600;

export type BlockClock = Pick<ScheduleBlock, "start" | "end" | "starts" | "lengthMin">;

export type DayWindow = {
  start: string;
  end: string;
  startMin: number;
  /** Exclusive end in minutes from this day's midnight. May be greater than 24 hours. */
  endMin: number;
};

export type DaySegment = { day: Day; start: number; end: number };

// Minutes from midnight. An invalid clock counts as 00:00.
export function minutesOf(hm: string): number {
  const [hRaw, mRaw] = hm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return 0;
  return h * 60 + m;
}

// Seconds from midnight. An invalid clock counts as 00:00.
export function secondsOf(hm: string): number {
  return minutesOf(hm) * 60;
}

// HH:mm for a minute of the day, wrapping past 24:00.
export function clockOf(mins: number): string {
  const wrapped = ((Math.floor(mins) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function nextDay(day: Day): Day {
  return DAYS[(DAYS.indexOf(day) + 1) % DAYS.length]!;
}

export function prevDay(day: Day): Day {
  return DAYS[(DAYS.indexOf(day) + DAYS.length - 1) % DAYS.length]!;
}

// Slot length in minutes. A saved length wins over the origin window.
export function lengthMinutes(block: BlockClock): number {
  if (block.lengthMin && block.lengthMin > 0) return block.lengthMin;
  const start = minutesOf(block.start);
  const end = minutesOf(block.end);
  if (end > start) return end - start;
  if (end < start) return DAY_MINUTES - start + end;
  return DAY_MINUTES;
}

// Start and end of this block on one day. A day without its own start uses `start`.
export function windowOn(block: BlockClock, day: Day): DayWindow {
  const start = block.starts?.[day] ?? block.start;
  const startMin = minutesOf(start);
  const endMin = startMin + lengthMinutes(block);
  return { start, end: clockOf(endMin), startMin, endMin };
}

export function leftoverMin(window: DayWindow): number {
  return Math.max(0, window.endMin - DAY_MINUTES);
}

// Pieces of this block on the clock, including time that runs into the next day.
export function segmentsOf(block: ScheduleBlock): DaySegment[] {
  const out: DaySegment[] = [];
  for (const day of block.days) {
    const placed = windowOn(block, day);
    out.push({ day, start: placed.startMin, end: Math.min(placed.endMin, DAY_MINUTES) });
    const leftover = leftoverMin(placed);
    if (leftover > 0) out.push({ day: nextDay(day), start: 0, end: leftover });
  }
  return out;
}

export function itemCoversNow(
  item: { start: string; durationSec: number; overnight?: boolean },
  now: number,
): boolean {
  const start = secondsOf(item.start);
  const end = start + item.durationSec;
  if (item.overnight) {
    if (end <= DAY_SECONDS) return now >= start && now < end;
    return now < end - DAY_SECONDS;
  }
  if (end <= DAY_SECONDS) return now >= start && now < end;
  return now >= start;
}

// A planned slot whose start is still ahead. An overnight file that began yesterday is not ahead.
export function itemStartsLater(
  item: { start: string; durationSec: number; overnight?: boolean; status?: string },
  now: number,
): boolean {
  if (item.status && item.status !== "planned") return false;
  const start = secondsOf(item.start);
  if (item.overnight && start + item.durationSec > DAY_SECONDS) return false;
  return start > now;
}

// Done, skipped, or a window that has already ended. The file on screen is not passed.
export function itemHasPassed(
  item: { start: string; durationSec: number; overnight?: boolean; status?: string },
  now: number,
): boolean {
  if (item.status === "playing") return false;
  if (item.status === "done" || item.status === "skipped") return true;
  if (itemCoversNow(item, now)) return false;
  return !itemStartsLater(item, now);
}

export function itemJoinOffset(
  item: { start: string; overnight?: boolean },
  now: number,
): number {
  const start = secondsOf(item.start);
  if (item.overnight && now < start) return now + DAY_SECONDS - start;
  return Math.max(0, now - start);
}

export function itemProgress(
  item: { start: string; durationSec: number; overnight?: boolean },
  now: number,
): number {
  if (item.durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, itemJoinOffset(item, now) / item.durationSec));
}
