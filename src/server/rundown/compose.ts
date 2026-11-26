// Build one day's rows from the weekly grid.
import { weekdayOfKey } from "../../shared/dates.ts";
import type { DayRundown, Progress, RundownItem, TodayRundown } from "../../shared/types.ts";
import { DAY_MINUTES, lengthMinutes, prevDay, windowOn } from "../../shared/window.ts";
import { dateKey, nowSec, parseHm, weekday } from "../clock/clock.ts";
import { loadProgress, noteRandom } from "../schedule/progress.ts";
import { blocksForDay, loadSchedule } from "../schedule/schedule.ts";
import {
  blockLeftoverSec,
  keptForBlock,
  leftoverStillActive,
  sortRundown,
  sourceFolder,
} from "./item.ts";
import { itemsForWindow } from "./place.ts";
import { cloneProgress } from "./picks.ts";

// Slots that belong to this calendar day, without the previous night's leftover.
export async function buildOwnItems(
  date: string,
  progress: Progress,
  existing?: DayRundown,
  changedIds?: Set<string>,
  reserved: readonly string[] = [],
): Promise<{ items: RundownItem[]; progress: Progress }> {
  const schedule = await loadSchedule();
  const shadow = cloneProgress(progress);
  const day = weekdayOfKey(date);
  const items: RundownItem[] = [];

  for (const block of blocksForDay(schedule, day)) {
    const placed = windowOn(block, day);
    const kept = keptForBlock(existing, block.id);
    const built =
      changedIds && existing && !changedIds.has(block.id)
        ? kept
        : await itemsForWindow(
            block,
            parseHm(placed.start),
            parseHm(placed.start) + lengthMinutes(block) * 60,
            shadow,
            kept,
            reserved,
          );
    items.push(...built);

    for (const item of built) {
      const folder = sourceFolder(item, block);
      if (!folder) continue;
      if (item.mode === "next-episode") shadow.lastCompleted[folder] = item.path;
      else if (item.mode === "random-file") {
        const prev = shadow.recentRandom[folder] ?? [];
        shadow.recentRandom[folder] = noteRandom(prev, item.path);
      }
    }
  }
  return { items, progress: shadow };
}

// Fill today's items from the schedule and each video's length.
export async function buildRundown(
  date = dateKey(),
  existing?: DayRundown,
  changedIds?: Set<string>,
  reserved: readonly string[] = [],
): Promise<TodayRundown> {
  const schedule = await loadSchedule();
  const stored = await loadProgress();
  const progress = cloneProgress(stored);
  const day = weekdayOfKey(date);
  const items: RundownItem[] = [];

  for (const block of blocksForDay(schedule, day)) {
    const placed = windowOn(block, day);
    const kept = keptForBlock(existing, block.id);
    const built =
      changedIds && existing && !changedIds.has(block.id)
        ? kept
        : await itemsForWindow(
            block,
            parseHm(placed.start),
            parseHm(placed.start) + lengthMinutes(block) * 60,
            progress,
            kept,
            reserved,
          );
    items.push(...built);

    for (const item of built) {
      const folder = sourceFolder(item, block);
      if (!folder) continue;
      if (item.mode === "next-episode") progress.lastCompleted[folder] = item.path;
      else if (item.mode === "random-file") {
        const prev = progress.recentRandom[folder] ?? [];
        progress.recentRandom[folder] = noteRandom(prev, item.path);
      }
    }
  }

  const yesterday = prevDay(day);
  const now = nowSec();
  for (const block of blocksForDay(schedule, yesterday)) {
    const placed = windowOn(block, yesterday);
    if (block.mode !== "playlist" && placed.endMin <= DAY_MINUTES) continue;

    if (changedIds && existing && !changedIds.has(block.id)) {
      items.push(...existing.items.filter((item) => item.blockId === block.id && item.overnight));
      continue;
    }

    const existingOvernight = existing?.items.filter((item) => item.blockId === block.id && item.overnight) ?? [];
    if (existingOvernight.length) {
      items.push(...existingOvernight);
      continue;
    }

    const built = await itemsForWindow(
      block,
      parseHm(placed.start),
      parseHm(placed.start) + lengthMinutes(block) * 60,
      stored,
      [],
      reserved,
    );
    const leftoverEndSec = blockLeftoverSec(block, yesterday, built);
    if (leftoverEndSec <= 0) continue;

    for (const item of built) {
      const leftover = { ...item, overnight: true };
      if (leftoverStillActive(leftover, now, leftoverEndSec)) items.push(leftover);
    }
  }

  return { date, items: sortRundown(items) };
}

// Today's slots from the timetable, keeping a file that is already playing or finished.
export async function rebuildLiveDay(
  current: DayRundown,
  changedIds?: Set<string>,
  reserved: readonly string[] = [],
): Promise<DayRundown> {
  const today = dateKey();
  const built = await buildRundown(today, current, changedIds, reserved);
  if (!current.items.some((item) => item.status === "playing")) return built;

  const lockedByBlock = new Map<string, RundownItem[]>();
  for (const item of current.items) {
    if (item.status === "planned") continue;
    const list = lockedByBlock.get(item.blockId) ?? [];
    list.push(item);
    lockedByBlock.set(item.blockId, list);
  }

  const merged: RundownItem[] = [];
  const schedule = await loadSchedule();
  const overnightLocked = current.items.filter((item) => item.overnight && item.status !== "planned");
  merged.push(...overnightLocked);
  const overnightLockedBlocks = new Set(overnightLocked.map((item) => item.blockId));
  for (const block of blocksForDay(schedule, weekday())) {
    const locked = (lockedByBlock.get(block.id) ?? []).filter((item) => !item.overnight);
    if (!locked.length) {
      merged.push(...built.items.filter((item) => item.blockId === block.id && !item.overnight));
      continue;
    }
    merged.push(...locked);
    if (locked.some((item) => item.status === "playing")) continue;
    const lockedPaths = new Set(locked.map((item) => item.path));
    merged.push(
      ...built.items.filter((item) => item.blockId === block.id && !item.overnight && !lockedPaths.has(item.path)),
    );
  }
  merged.push(...built.items.filter((item) => item.overnight && !overnightLockedBlocks.has(item.blockId)));

  return { date: today, items: sortRundown(merged) };
}
