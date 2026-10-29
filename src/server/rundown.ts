import { randomUUID } from "node:crypto";
import { GRACE_SEC, MIN_REMAINING_SEC } from "../shared/constants.ts";
import type {
  BlockMode,
  Day,
  Progress,
  RundownItem,
  Schedule,
  ScheduleBlock,
  SlotLength,
  SlotMiss,
  TodayRundown,
} from "../shared/types.ts";
import {
  DAY_MINUTES,
  DAY_SECONDS,
  itemCoversNow,
  itemHasPassed,
  itemJoinOffset,
  leftoverMin,
  lengthMinutes,
  prevDay,
  windowOn,
} from "../shared/window.ts";
import { parseYoutubeUrl } from "../shared/youtube.ts";
import { dateKey, formatHm, nowSec, parseHm, weekday } from "./clock.ts";
import { probeDuration } from "./duration.ts";
import { isDir, isVideoFile, titleFromPath } from "./files.ts";
import { todayPath } from "./paths.ts";
import { nextEpisode, randomFile, videosIn } from "./picker.ts";
import { loadProgress } from "./progress.ts";
import { blocksForDay, loadSchedule } from "./schedule.ts";
import { readJson, writeJson } from "./store.ts";
import { probeYoutube } from "./youtube.ts";

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
  const result = await rollToToday(current);
  await saveToday(result);
  return result;
}

// Rebuild today while keeping items that are already playing or finished.
export async function rebuildTodayPreservingPlayback(): Promise<TodayRundown> {
  const today = dateKey();
  const current = await loadToday();
  const built = await buildRundown(today);
  if (current.date !== today) {
    const result = await rollToToday(current);
    await saveToday(result);
    return result;
  }
  if (!current.items.some((i) => i.status === "playing")) {
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
  const overnightLocked = current.items.filter((item) => item.overnight && item.status !== "planned");
  merged.push(...overnightLocked);
  const overnightLockedBlocks = new Set(overnightLocked.map((item) => item.blockId));
  for (const block of blocksForDay(schedule, weekday())) {
    const locked = (lockedByBlock.get(block.id) ?? []).filter((item) => !item.overnight);
    if (!locked.length) {
      merged.push(...built.items.filter((i) => i.blockId === block.id && !i.overnight));
      continue;
    }
    merged.push(...locked);
    if (locked.some((i) => i.status === "playing")) continue;
    const lockedPaths = new Set(locked.map((i) => i.path));
    merged.push(
      ...built.items.filter((i) => i.blockId === block.id && !i.overnight && !lockedPaths.has(i.path)),
    );
  }
  merged.push(
    ...built.items.filter(
      (item) => item.overnight && !overnightLockedBlocks.has(item.blockId),
    ),
  );
  const result = { date: today, items: sortRundown(merged) };
  await saveToday(result);
  return result;
}

// Fill today's items from the schedule and each video's length.
export async function buildRundown(date = dateKey()): Promise<TodayRundown> {
  const schedule = await loadSchedule();
  const progress = await loadProgress();
  const day = weekday();
  const items: RundownItem[] = [];

  for (const block of blocksForDay(schedule, day)) {
    const placed = windowOn(block, day);
    items.push(
      ...(await itemsForWindow(
        block,
        parseHm(placed.start),
        parseHm(placed.start) + lengthMinutes(block) * 60,
        progress,
      )),
    );
  }

  const yesterday = prevDay(day);
  const now = nowSec();
  for (const block of blocksForDay(schedule, yesterday)) {
    const placed = windowOn(block, yesterday);
    if (placed.endMin <= DAY_MINUTES) continue;
    const leftoverEndSec = leftoverMin(placed) * 60;
    const built = await itemsForWindow(
      block,
      parseHm(placed.start),
      parseHm(placed.start) + lengthMinutes(block) * 60,
      progress,
    );
    for (const item of built) {
      const leftover = { ...item, overnight: true };
      if (leftoverStillActive(leftover, now, leftoverEndSec)) items.push(leftover);
    }
  }

  return { date, items: sortRundown(items) };
}

async function itemsForWindow(
  block: ScheduleBlock,
  cursorStart: number,
  blockEnd: number,
  progress: Progress,
): Promise<RundownItem[]> {
  const items: RundownItem[] = [];

  if (block.mode === "youtube") {
    const url = parseYoutubeUrl(block.file ?? "");
    if (!url) return items;
    let meta;
    try {
      meta = await probeYoutube(url);
    } catch {
      return items;
    }
    if (!itemFits(meta.durationSec, blockEnd - cursorStart)) return items;
    items.push(makeItem(block, meta.url, cursorStart, meta.durationSec, meta.title));
    return items;
  }

  if (block.mode === "specific-file") {
    const file = block.file;
    if (!file || !(await isVideoFile(file))) return items;
    const durationSec = await probeDuration(file);
    if (!itemFits(durationSec, blockEnd - cursorStart)) return items;
    items.push(makeItem(block, file, cursorStart, durationSec));
    return items;
  }

  const files = await videosIn(block.folder);
  if (files.length === 0) return items;
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

  return items;
}

async function rollToToday(current: TodayRundown): Promise<TodayRundown> {
  const built = await buildRundown(dateKey());
  const schedule = await loadSchedule();
  const carry = leftoverCarry(current.items, schedule, prevDay(weekday()), nowSec());
  return { date: dateKey(), items: mergeOvernight(built.items, carry) };
}

function leftoverCarry(
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
    const placed = windowOn(block, yesterday);
    if (placed.endMin <= DAY_MINUTES) continue;
    const leftover = { ...item, overnight: true };
    if (item.status === "playing" || leftoverStillActive(leftover, now, leftoverMin(placed) * 60)) {
      out.push(leftover);
    }
  }
  return out;
}

function mergeOvernight(built: RundownItem[], carry: RundownItem[]): RundownItem[] {
  if (carry.length === 0) return built;
  const carriedBlocks = new Set(carry.map((item) => item.blockId));
  return sortRundown([
    ...carry,
    ...built.filter((item) => !item.overnight || !carriedBlocks.has(item.blockId)),
  ]);
}

function leftoverStillActive(item: RundownItem, now: number, leftoverEndSec: number): boolean {
  if (itemCoversNow(item, now)) return true;
  const start = parseHm(item.start);
  return start < leftoverEndSec && start > now;
}

function sortRundown(items: RundownItem[]): RundownItem[] {
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
  title = titleFromPath(file),
): RundownItem {
  return {
    id: randomUUID(),
    blockId: block.id,
    path: file,
    title,
    mode: block.mode,
    start: formatHm(startSec),
    end: formatHm(startSec + durationSec),
    durationSec,
    status: "planned",
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

// Length of the file a new slot will play. A random folder uses its longest video.
export async function slotLength(opts: {
  mode: BlockMode;
  folder: string;
  file?: string;
}): Promise<SlotLength | null> {
  if (opts.mode === "youtube") {
    const file = parseYoutubeUrl(opts.file ?? "");
    if (!file) return null;
    const meta = await probeYoutube(file);
    return {
      title: meta.title,
      path: meta.url,
      durationSec: meta.durationSec,
      kind: "video",
    };
  }

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
  let shortest: { file: string; durationSec: number } | null = null;
  for (const file of files) {
    const durationSec = await probeDuration(file);
    if (!longest || durationSec > longest.durationSec) longest = { file, durationSec };
    if (!shortest || durationSec < shortest.durationSec) shortest = { file, durationSec };
  }
  if (!longest || !shortest) return null;
  return {
    title: titleFromPath(longest.file),
    path: longest.file,
    durationSec: longest.durationSec,
    kind: "random",
    fileCount: files.length,
    shortest: {
      title: titleFromPath(shortest.file),
      path: shortest.file,
      durationSec: shortest.durationSec,
    },
  };
}

// How many videos a folder holds, without timing them.
export async function videoCount(folder: string): Promise<number> {
  const trimmed = folder.trim();
  if (!trimmed || !(await isDir(trimmed))) return 0;
  return (await videosIn(trimmed)).length;
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
  if (block.mode === "youtube") {
    const url = parseYoutubeUrl(block.file ?? "");
    if (!url) return null;
    let meta;
    try {
      meta = await probeYoutube(url);
    } catch {
      return null;
    }
    if (itemFits(meta.durationSec, slotSec)) return null;
    return { blockId: block.id, kind: "video", title: meta.title, durationSec: meta.durationSec, limitSec };
  }

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
  if (item.status === "playing" || itemHasPassed(item, nowSec())) {
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

// Move a next-episode item to the previous or next file, and keep later episodes in order.
export async function stepEpisode(itemId: string, direction: -1 | 1): Promise<TodayRundown> {
  const rundown = await ensureToday();
  const item = rundown.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Item not found");
  if (item.mode !== "next-episode") throw new Error("Only next-episode items can change episode");
  const now = nowSec();
  if (item.status === "done" || item.status === "skipped" || (item.status !== "playing" && itemHasPassed(item, now))) {
    throw new Error("Cannot change a finished episode");
  }

  const schedule = await loadSchedule();
  const block = schedule.blocks.find((entry) => entry.id === item.blockId);
  if (!block) throw new Error("Slot missing from schedule");

  const files = await videosIn(block.folder);
  const index = files.indexOf(item.path);
  if (index === -1) throw new Error("Episode is no longer in this folder");
  const startIndex = index + direction;
  if (startIndex < 0) throw new Error("No previous episode");
  if (startIndex >= files.length) throw new Error("No next episode");

  const tail = rundown.items.filter((row) => {
    if (row.blockId !== item.blockId || Boolean(row.overnight) !== Boolean(item.overnight)) return false;
    if (row.mode !== "next-episode") return false;
    if (row.id === item.id) return true;
    if (parseHm(row.start) <= parseHm(item.start)) return false;
    return row.status === "planned" && !itemHasPassed(row, now);
  });
  const tailIds = new Set(tail.map((row) => row.id));
  const locked = new Set(
    rundown.items.filter((row) => row.blockId === item.blockId && !tailIds.has(row.id)).map((row) => row.path),
  );
  const startFile = files[startIndex]!;
  if (locked.has(startFile)) {
    throw new Error(direction < 0 ? "No previous episode" : "No next episode");
  }

  const drop = new Set<string>();
  let cursor = startIndex;
  for (const row of tail) {
    while (cursor < files.length && locked.has(files[cursor]!)) cursor += 1;
    const file = files[cursor];
    if (!file) {
      drop.add(row.id);
      continue;
    }
    row.path = file;
    row.title = titleFromPath(file);
    row.durationSec = await probeDuration(file);
    if (row.status !== "playing") row.status = "planned";
    cursor += 1;
  }
  if (drop.size > 0) rundown.items = rundown.items.filter((row) => !drop.has(row.id));

  recomputeBlockTimes(rundown, block);
  await saveToday(rundown);
  return rundown;
}

// Recalculate start and end times for every item in a block.
function recomputeBlockTimes(rundown: TodayRundown, block: ScheduleBlock): void {
  const overnight = rundown.items.filter((item) => item.blockId === block.id && item.overnight);
  const todayItems = rundown.items.filter((item) => item.blockId === block.id && !item.overnight);
  if (overnight.length) {
    let cursor = parseHm(windowOn(block, prevDay(weekday())).start);
    for (const item of overnight) {
      item.start = formatHm(cursor);
      item.end = formatHm(cursor + item.durationSec);
      cursor += item.durationSec;
    }
  }
  if (todayItems.length) {
    let cursor = parseHm(windowOn(block, weekday()).start);
    for (const item of todayItems) {
      item.start = formatHm(cursor);
      item.end = formatHm(cursor + item.durationSec);
      cursor += item.durationSec;
    }
  }
}

// Window length in seconds. Every day uses the same stored length.
function tightestSlotSec(block: ScheduleBlock): number {
  return lengthMinutes(block) * 60;
}

// Schedule block with the given id.
export function findBlock(schedule: Schedule, blockId: string): ScheduleBlock | undefined {
  return schedule.blocks.find((b) => b.id === blockId);
}
