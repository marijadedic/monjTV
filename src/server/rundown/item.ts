// Row order, whether a file fits, overnight leftovers, and times.
import { randomUUID } from "node:crypto";
import { GRACE_SEC, MIN_REMAINING_SEC } from "../../shared/constants.ts";
import { weekdayOfKey } from "../../shared/dates.ts";
import type { Day, DayRundown, ItemMode, RundownItem, Schedule, ScheduleBlock } from "../../shared/types.ts";
import {
  DAY_SECONDS,
  itemCoversNow,
  itemJoinOffset,
  leftoverMin,
  lengthMinutes,
  prevDay,
  windowOn,
} from "../../shared/window.ts";
import { formatHm, parseHm } from "../clock/clock.ts";
import { nameOf } from "./media.ts";

// Folder a next-episode row walks, from the row or its slot.
export function seriesFolder(item: RundownItem, schedule: Schedule): string | undefined {
  if (item.mode !== "next-episode") return undefined;
  if (item.folder) return item.folder;
  const block = schedule.blocks.find((entry) => entry.id === item.blockId);
  return block?.folder || undefined;
}

// Folder this row uses for episode or random history.
export function sourceFolder(item: RundownItem, block: ScheduleBlock): string {
  if (item.folder) return item.folder;
  return block.folder;
}

// Seconds after midnight this block still occupies, from its files or its window.
export function blockLeftoverSec(block: ScheduleBlock, day: Day, items: RundownItem[]): number {
  const placed = windowOn(block, day);
  if (block.mode !== "playlist") return leftoverMin(placed) * 60;
  let leftover = 0;
  for (const item of items) {
    if (item.blockId !== block.id || item.overnight) continue;
    leftover = Math.max(leftover, parseHm(item.start) + item.durationSec - DAY_SECONDS);
  }
  return Math.max(0, leftover);
}

// True when this leftover is on now, or still starts later tonight.
export function leftoverStillActive(item: RundownItem, now: number, leftoverEndSec: number): boolean {
  if (itemCoversNow(item, now)) return true;
  const start = parseHm(item.start);
  return start < leftoverEndSec && start > now;
}

// Rows from yesterday that are still on after midnight.
export function leftoverCarry(
  items: RundownItem[],
  schedule: Schedule,
  yesterday: Day,
  now: number,
): RundownItem[] {
  const out: RundownItem[] = [];
  for (const item of items) {
    if (item.status === "done" || item.status === "skipped") continue;
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block?.days.includes(yesterday)) continue;
    const leftoverSec = blockLeftoverSec(block, yesterday, items);
    if (leftoverSec <= 0) continue;
    const leftover = { ...item, overnight: true };
    if (item.status === "playing" || leftoverStillActive(leftover, now, leftoverSec)) {
      out.push(leftover);
    }
  }
  return out;
}

// Overnight leftovers first, then the day's own rows by start time.
export function sortRundown(items: RundownItem[]): RundownItem[] {
  return items.slice().sort((a, b) => {
    const aOver = a.overnight ? 0 : 1;
    const bOver = b.overnight ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    if (a.overnight && b.overnight) {
      const aWrap = parseHm(a.start) + a.durationSec > DAY_SECONDS ? 0 : 1;
      const bWrap = parseHm(b.start) + b.durationSec > DAY_SECONDS ? 0 : 1;
      if (aWrap !== bWrap) return aWrap - bWrap;
    }
    return parseHm(a.start) - parseHm(b.start);
  });
}

// Saved rows for this slot on this day, not the leftover from yesterday.
export function keptForBlock(existing: DayRundown | undefined, blockId: string): RundownItem[] {
  if (!existing) return [];
  return sortRundown(existing.items).filter((item) => item.blockId === blockId && !item.overnight);
}

// Put yesterday's leftover ahead of today's own rows for those slots.
export function mergeOvernight(built: RundownItem[], carry: RundownItem[]): RundownItem[] {
  if (carry.length === 0) return built;
  const carriedBlocks = new Set(carry.map((item) => item.blockId));
  return sortRundown([
    ...carry,
    ...built.filter((item) => !item.overnight || !carriedBlocks.has(item.blockId)),
  ]);
}

// Next file after the last completed one, wrapping to the start.
export function nextFrom(files: string[], lastCompleted?: string): string | null {
  if (files.length === 0) return null;
  if (!lastCompleted) return files[0];
  const idx = files.indexOf(lastCompleted);
  if (idx === -1) return files[0];
  return files[(idx + 1) % files.length];
}

// A planned rundown row for one file.
export function makeItem(
  block: ScheduleBlock,
  file: string,
  startSec: number,
  durationSec: number,
  extra?: { title?: string; mode?: ItemMode; folder?: string; entryId?: string },
): RundownItem {
  const mode = extra?.mode ?? (block.mode === "playlist" ? "specific-file" : block.mode);
  return {
    id: randomUUID(),
    blockId: block.id,
    path: file,
    title: extra?.title ?? nameOf(file),
    mode,
    folder: extra?.folder ?? block.folder,
    start: formatHm(startSec),
    end: formatHm(startSec + durationSec),
    durationSec,
    status: "planned",
    ...(extra?.entryId ? { entryId: extra.entryId } : {}),
  };
}

// True when the clock is inside this file's planned window.
export function coversNow(item: RundownItem, now: number): boolean {
  return itemCoversNow(item, now);
}

// Planned file the clock is inside. A later start wins when two windows overlap.
export function onAirItem(items: RundownItem[], now: number): RundownItem | null {
  let chosen: RundownItem | null = null;
  for (const item of items) {
    if (item.status !== "planned") continue;
    if (!coversNow(item, now)) continue;
    if (!chosen || parseHm(item.start) >= parseHm(chosen.start)) chosen = item;
  }
  return chosen;
}

// Seconds from the start of the file to this clock time.
export function joinOffset(item: RundownItem, now: number): number {
  return itemJoinOffset(item, now);
}

// True when the file can start with this many seconds left in the block.
export function itemFits(durationSec: number, remainingSec: number): boolean {
  if (remainingSec <= 0 || durationSec <= 0) return false;
  if (durationSec <= remainingSec) return true;
  if (remainingSec < MIN_REMAINING_SEC) return false;
  return durationSec <= remainingSec + GRACE_SEC;
}

// Longest file that can start in a block of this length.
export function maxPlayableSec(slotSec: number): number {
  if (slotSec <= 0) return 0;
  if (slotSec < MIN_REMAINING_SEC) return slotSec;
  return slotSec + GRACE_SEC;
}

// The part of the previous day that is still on after midnight.
export function plannedSpill(previous: DayRundown, schedule: Schedule): RundownItem[] {
  const day = weekdayOfKey(previous.date);
  const out: RundownItem[] = [];
  for (const item of previous.items) {
    if (item.overnight || item.status === "done" || item.status === "skipped") continue;
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block?.days.includes(day)) continue;
    if (blockLeftoverSec(block, day, previous.items) <= 0) continue;
    if (parseHm(item.start) + item.durationSec <= DAY_SECONDS) continue;
    out.push({ ...item, id: randomUUID(), overnight: true, status: "planned" });
  }
  return out;
}

// Recalculate start and end times for every item in a block.
export function recomputeBlockTimes(rundown: DayRundown, block: ScheduleBlock): void {
  const day = weekdayOfKey(rundown.date);
  const overnight = rundown.items.filter((item) => item.blockId === block.id && item.overnight);
  const todayItems = rundown.items.filter((item) => item.blockId === block.id && !item.overnight);
  if (overnight.length) {
    let cursor = parseHm(windowOn(block, prevDay(day)).start);
    for (const item of overnight) {
      item.start = formatHm(cursor);
      item.end = formatHm(cursor + item.durationSec);
      cursor += item.durationSec;
    }
  }
  if (todayItems.length) {
    let cursor = parseHm(windowOn(block, day).start);
    for (const item of todayItems) {
      item.start = formatHm(cursor);
      item.end = formatHm(cursor + item.durationSec);
      cursor += item.durationSec;
    }
  }
}

// Window length in seconds. Every day uses the same stored length.
export function tightestSlotSec(block: ScheduleBlock): number {
  return lengthMinutes(block) * 60;
}

// Schedule block with the given id.
export function findBlock(schedule: Schedule, blockId: string): ScheduleBlock | undefined {
  return schedule.blocks.find((b) => b.id === blockId);
}
