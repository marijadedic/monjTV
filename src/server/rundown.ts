import { randomUUID } from "node:crypto";
import { GRACE_SEC, MIN_REMAINING_SEC } from "../shared/constants.ts";
import type {
  BlockMode,
  Progress,
  RundownItem,
  Schedule,
  ScheduleBlock,
  SlotLength,
  SlotMiss,
  TodayRundown,
} from "../shared/types.ts";
import { windowOn } from "../shared/window.ts";
import { dateKey, formatHm, parseHm, weekday } from "./clock.ts";
import { probeDuration } from "./duration.ts";
import { isDir, isVideoFile, titleFromPath } from "./files.ts";
import { todayPath } from "./paths.ts";
import { nextEpisode, randomFile, videosIn } from "./picker.ts";
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
    const placed = windowOn(block, day);
    const cursorStart = parseHm(placed.start);
    const blockEnd = parseHm(placed.end);

    if (block.mode === "specific-file") {
      const file = block.file;
      if (!file || !(await isVideoFile(file))) continue;
      const durationSec = await probeDuration(file);
      if (!itemFits(durationSec, blockEnd - cursorStart)) continue;
      items.push(makeItem(block, file, cursorStart, durationSec));
      continue;
    }

    const files = await videosIn(block.folder);
    if (files.length === 0) continue;
    const used: string[] = [];
    const passed = new Set<string>();
    let lastCompleted = progress.lastCompleted[block.folder];
    let cursor = cursorStart;

    while (true) {
      const remaining = blockEnd - cursor;
      if (remaining <= 0) break;

      let picked: string | null = null;
      let durationSec = 0;
      if (block.mode === "next-episode") {
        const file = nextFrom(files, lastCompleted);
        if (!file) break;
        durationSec = await probeDuration(file);
        if (!itemFits(durationSec, remaining)) break;
        picked = file;
      } else {
        const recent = progress.recentRandom[block.folder] ?? [];
        const pool = files.filter((candidate) => !passed.has(candidate) && !used.includes(candidate));
        if (pool.length === 0) break;
        const file = randomFile(pool, recent);
        if (!file) break;
        durationSec = await probeDuration(file);
        if (!itemFits(durationSec, remaining)) {
          passed.add(file);
          continue;
        }
        picked = file;
      }
      if (!picked) break;

      items.push(makeItem(block, picked, cursor, durationSec));
      used.push(picked);
      if (block.mode === "next-episode") lastCompleted = picked;
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

// True when the clock is inside this file's planned window.
export function coversNow(item: RundownItem, now: number): boolean {
  const start = parseHm(item.start);
  return now >= start && now < start + item.durationSec;
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
  return Math.max(0, now - parseHm(item.start));
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

// Length of the file a new slot will play. A random folder uses its longest video.
export async function slotLength(opts: {
  mode: BlockMode;
  folder: string;
  file?: string;
}): Promise<SlotLength | null> {
  if (opts.mode === "specific-file") {
    const file = opts.file?.trim() ?? "";
    if (!file || !(await isVideoFile(file))) return null;
    return {
      title: titleFromPath(file),
      path: file,
      durationSec: await probeDuration(file),
      kind: "video",
    };
  }

  const folder = opts.folder.trim();
  if (!folder || !(await isDir(folder))) return null;
  const files = await videosIn(folder);
  if (files.length === 0) return null;

  if (opts.mode === "next-episode") {
    const progress = await loadProgress();
    const file = nextEpisode(files, progress.lastCompleted[folder]);
    if (!file) return null;
    return {
      title: titleFromPath(file),
      path: file,
      durationSec: await probeDuration(file),
      kind: "episode",
    };
  }

  let longest: { file: string; durationSec: number } | null = null;
  for (const file of files) {
    const durationSec = await probeDuration(file);
    if (!longest || durationSec > longest.durationSec) longest = { file, durationSec };
  }
  if (!longest) return null;
  return {
    title: titleFromPath(longest.file),
    path: longest.file,
    durationSec: longest.durationSec,
    kind: "random",
  };
}

// Why a saved block cannot start a file, for blocks that were just added or edited.
export async function missesForBlocks(blocks: ScheduleBlock[]): Promise<SlotMiss[]> {
  const progress = await loadProgress();
  const misses: SlotMiss[] = [];
  for (const block of blocks) {
    const miss = await missForBlock(block, progress);
    if (miss) misses.push(miss);
  }
  return misses;
}

// The file this block would start, when that file is too long for the slot.
async function missForBlock(block: ScheduleBlock, progress: Progress): Promise<SlotMiss | null> {
  const slotSec = tightestSlotSec(block);
  const limitSec = maxPlayableSec(slotSec);
  if (block.mode === "specific-file") {
    const file = block.file;
    if (!file || !(await isVideoFile(file))) return null;
    const durationSec = await probeDuration(file);
    if (itemFits(durationSec, slotSec)) return null;
    return { blockId: block.id, kind: "video", title: titleFromPath(file), durationSec, limitSec };
  }

  const files = await videosIn(block.folder);
  if (files.length === 0) return null;
  if (block.mode === "next-episode") {
    const file = nextFrom(files, progress.lastCompleted[block.folder]);
    if (!file) return null;
    const durationSec = await probeDuration(file);
    if (itemFits(durationSec, slotSec)) return null;
    return { blockId: block.id, kind: "episode", title: titleFromPath(file), durationSec, limitSec };
  }

  let shortest: { title: string; durationSec: number } | null = null;
  for (const file of files) {
    const durationSec = await probeDuration(file);
    if (itemFits(durationSec, slotSec)) return null;
    if (!shortest || durationSec < shortest.durationSec) {
      shortest = { title: titleFromPath(file), durationSec };
    }
  }
  if (!shortest) return null;
  return {
    blockId: block.id,
    kind: "folder",
    title: shortest.title,
    durationSec: shortest.durationSec,
    limitSec,
  };
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
  let cursor = parseHm(windowOn(block, weekday()).start);
  for (const item of rundown.items.filter((i) => i.blockId === block.id)) {
    item.start = formatHm(cursor);
    item.end = formatHm(cursor + item.durationSec);
    cursor += item.durationSec;
  }
}

// Shortest window among the block's days, in seconds.
function tightestSlotSec(block: ScheduleBlock): number {
  let slotSec = 0;
  for (const day of block.days) {
    const placed = windowOn(block, day);
    const span = parseHm(placed.end) - parseHm(placed.start);
    if (slotSec === 0 || span < slotSec) slotSec = span;
  }
  return slotSec;
}

// Schedule block with the given id.
export function findBlock(schedule: Schedule, blockId: string): ScheduleBlock | undefined {
  return schedule.blocks.find((b) => b.id === blockId);
}
