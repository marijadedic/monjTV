import { randomUUID } from "node:crypto";
import { GRACE_SEC, MIN_REMAINING_SEC } from "../shared/constants.ts";
import type {
  RundownItem,
  Schedule,
  ScheduleBlock,
  TodayRundown,
} from "../shared/types.ts";
import { dateKey, formatHm, parseHm, weekday } from "./clock.ts";
import { probeDuration } from "./duration.ts";
import { isVideoFile, titleFromPath } from "./files.ts";
import { todayPath } from "./paths.ts";
import { randomFile, videosIn } from "./picker.ts";
import { loadProgress } from "./progress.ts";
import { blocksForDay, loadSchedule } from "./schedule.ts";
import { readJson, writeJson } from "./store.ts";

// Empty rundown used when today's file is missing.
const empty = (): TodayRundown => ({ date: "", items: [] });

// Read today's rundown from disk.
export async function loadToday(): Promise<TodayRundown> {
  return readJson<TodayRundown>(todayPath, empty());
}

// Write today's rundown to disk.
export async function saveToday(rundown: TodayRundown): Promise<void> {
  await writeJson(todayPath, rundown);
}

// Return today's rundown, rebuilding it when the date has changed.
export async function ensureToday(): Promise<TodayRundown> {
  const today = dateKey();
  const current = await loadToday();
  if (current.date === today) return current;
  const built = await buildRundown(today);
  await saveToday(built);
  return built;
}

// Rebuild today while keeping items that are already playing or finished.
export async function rebuildTodayPreservingPlayback(): Promise<TodayRundown> {
  const today = dateKey();
  const current = await loadToday();
  const built = await buildRundown(today);
  if (current.date !== today || !current.items.some((i) => i.status === "playing")) {
    await saveToday(built);
    return built;
  }

  const lockedByBlock = new Map<string, RundownItem[]>();
  for (const item of current.items) {
    if (item.status === "planned") continue;
    const list = lockedByBlock.get(item.blockId) ?? [];
    list.push(item);
    lockedByBlock.set(item.blockId, list);
  }

  const merged: RundownItem[] = [];
  const schedule = await loadSchedule();
  for (const block of blocksForDay(schedule, weekday())) {
    const locked = lockedByBlock.get(block.id);
    if (!locked) {
      merged.push(...built.items.filter((i) => i.blockId === block.id));
      continue;
    }
    merged.push(...locked);
    if (locked.some((i) => i.status === "playing")) continue;
    const lockedPaths = new Set(locked.map((i) => i.path));
    merged.push(
      ...built.items.filter((i) => i.blockId === block.id && !lockedPaths.has(i.path)),
    );
  }
  const result = { date: today, items: merged };
  await saveToday(result);
  return result;
}

// Fill today's items from the schedule and each video's length.
export async function buildRundown(date = dateKey()): Promise<TodayRundown> {
  const schedule = await loadSchedule();
  const progress = await loadProgress();
  const day = weekday();
  const blocks = blocksForDay(schedule, day);
  const items: RundownItem[] = [];

  for (const block of blocks) {
    const cursorStart = parseHm(block.start);
    const blockEnd = parseHm(block.end);

    if (block.mode === "specific-file") {
      const file = block.file;
      const remaining = blockEnd - cursorStart;
      if (!file || remaining < MIN_REMAINING_SEC || !(await isVideoFile(file))) continue;
      const durationSec = await probeDuration(file);
      if (durationSec > remaining + GRACE_SEC) continue;
      items.push(makeItem(block, file, cursorStart, durationSec));
      continue;
    }

    const files = await videosIn(block.folder);
    if (files.length === 0) continue;
    const used: string[] = [];
    let lastCompleted = progress.lastCompleted[block.folder];
    let cursor = cursorStart;

    while (true) {
      const remaining = blockEnd - cursor;
      if (remaining < MIN_REMAINING_SEC) break;

      let file: string | null = null;
      if (block.mode === "next-episode") {
        file = nextFrom(files, lastCompleted);
      } else {
        const recent = progress.recentRandom[block.folder] ?? [];
        file = randomFile(files, [...recent, ...used]);
      }
      if (!file) break;

      const durationSec = await probeDuration(file);
      if (durationSec > remaining + GRACE_SEC) break;

      items.push(makeItem(block, file, cursor, durationSec));
      used.push(file);
      if (block.mode === "next-episode") lastCompleted = file;
      cursor += durationSec;
    }
  }

  return { date, items };
}

// Next file after the last completed one, wrapping to the start.
function nextFrom(files: string[], lastCompleted?: string): string | null {
  if (files.length === 0) return null;
  if (!lastCompleted) return files[0]!;
  const idx = files.indexOf(lastCompleted);
  if (idx === -1) return files[0]!;
  return files[(idx + 1) % files.length]!;
}

// A planned rundown row for one file.
function makeItem(
  block: ScheduleBlock,
  file: string,
  startSec: number,
  durationSec: number,
): RundownItem {
  return {
    id: randomUUID(),
    blockId: block.id,
    path: file,
    title: titleFromPath(file),
    mode: block.mode,
    start: formatHm(startSec),
    end: formatHm(startSec + durationSec),
    durationSec,
    status: "planned",
  };
}

// True when the file can still start in the time left in the block.
export function itemFits(durationSec: number, remainingSec: number): boolean {
  if (remainingSec < MIN_REMAINING_SEC) return false;
  return durationSec <= remainingSec + GRACE_SEC;
}

// Replace a random item with another file and retime its block.
export async function shuffleItem(itemId: string): Promise<TodayRundown> {
  const rundown = await ensureToday();
  const item = rundown.items.find((i) => i.id === itemId);
  if (!item) throw new Error("Item not found");
  if (item.mode !== "random-file") throw new Error("Only random items can be shuffled");
  if (item.status === "playing" || item.status === "done") {
    throw new Error("Cannot shuffle a playing or finished item");
  }

  const schedule = await loadSchedule();
  const block = schedule.blocks.find((b) => b.id === item.blockId);
  if (!block) throw new Error("Block missing from schedule");

  const files = await videosIn(block.folder);
  const used = rundown.items
    .filter((i) => i.blockId === item.blockId && i.id !== item.id)
    .map((i) => i.path);
  const progress = await loadProgress();
  const recent = progress.recentRandom[block.folder] ?? [];
  const next = randomFile(files, [...recent, ...used, item.path]);
  if (!next || next === item.path) throw new Error("No other files in this folder");

  item.path = next;
  item.title = titleFromPath(next);
  item.durationSec = await probeDuration(next);
  item.status = "planned";
  recomputeBlockTimes(rundown, block);
  await saveToday(rundown);
  return rundown;
}

// Recalculate start and end times for every item in a block.
function recomputeBlockTimes(rundown: TodayRundown, block: ScheduleBlock): void {
  let cursor = parseHm(block.start);
  for (const item of rundown.items.filter((i) => i.blockId === block.id)) {
    item.start = formatHm(cursor);
    item.end = formatHm(cursor + item.durationSec);
    cursor += item.durationSec;
  }
}

// Schedule block with the given id.
export function findBlock(schedule: Schedule, blockId: string): ScheduleBlock | undefined {
  return schedule.blocks.find((b) => b.id === blockId);
}
