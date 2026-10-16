import type { Day, ScheduleBlock } from "./types.ts";

const DAY_MINUTES = 24 * 60;

export type BlockClock = Pick<ScheduleBlock, "start" | "end" | "starts" | "lengthMin">;

// Minutes from midnight. An invalid clock counts as 00:00.
export function minutesOf(hm: string): number {
  const [hRaw, mRaw] = hm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return 0;
  return h * 60 + m;
}

// HH:mm for a minute of the day, capped at 23:59.
export function clockOf(mins: number): string {
  const capped = Math.max(0, Math.min(mins, DAY_MINUTES - 1));
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Slot length in minutes. A saved length wins over the origin window.
export function lengthMinutes(block: BlockClock): number {
  if (block.lengthMin && block.lengthMin > 0) return block.lengthMin;
  return Math.max(1, minutesOf(block.end) - minutesOf(block.start));
}

// Start and end of this block on one day. A day without its own start uses `start`.
export function windowOn(block: BlockClock, day: Day): { start: string; end: string } {
  const start = block.starts?.[day] ?? block.start;
  const endMin = minutesOf(start) + lengthMinutes(block);
  return { start, end: clockOf(endMin) };
}
