import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { GRACE_SEC, MIN_REMAINING_SEC, RECENT_RANDOM_LIMIT } from "../shared/constants.ts";
import { dateOffset, shiftDateKey, weekdayOfKey } from "../shared/dates.ts";
import type {
  Day,
  DayRundown,
  ItemMode,
  PlaylistEntry,
  Progress,
  RundownItem,
  Schedule,
  ScheduleBlock,
  SlotLength,
  SlotMiss,
  TodayRundown,
  TvBoard,
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
import { schedulePath, todayPath, tvPath } from "./paths.ts";
import { nextEpisode, randomFile, videosIn } from "./picker.ts";
import { forgetRandomPath, loadProgress, markEpisodeDone, markRandomPlayed, saveProgress } from "./progress.ts";
import { blocksForDay, loadSchedule } from "./schedule.ts";
import { writeJson } from "./store.ts";
import { probeYoutube } from "./youtube.ts";

const TV_PAST = 1;
const TV_AHEAD = 6;

type BoardFile = {
  carriedInto?: string;
  days: DayRundown[];
};

let tail: Promise<void> = Promise.resolve();
let filling: Promise<void> | null = null;
let boardWait: Promise<TvBoard> | null = null;
let rebuildingAhead = 0;
let aheadChain: Promise<void> = Promise.resolve();
let buildingIds: Set<string> | null = null;

// One board write at a time, so a playback save cannot drop another day.
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// Probe a missing later day after Today has already been sent.
function scheduleFill(): void {
  if (filling) return;
  filling = exclusive(async () => {
    await syncBoard(true);
  })
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      filling = null;
    });
}

function isDay(value: unknown): value is DayRundown {
  if (!value || typeof value !== "object") return false;
  const day = value as DayRundown;
  return typeof day.date === "string" && Array.isArray(day.items);
}

function cloneProgress(progress: Progress): Progress {
  return {
    lastCompleted: { ...progress.lastCompleted },
    recentRandom: Object.fromEntries(
      Object.entries(progress.recentRandom).map(([folder, files]) => [folder, [...files]]),
    ),
  };
}

// Treat this day's planned picks as already chosen, so the next day continues the series.
// Overnight rows are the previous day's leftover, unless this is the live day and that leftover
// has not been written into progress yet.
function notePicks(
  progress: Progress,
  items: RundownItem[],
  schedule: Schedule,
  includeOvernight = false,
): Progress {
  const next = cloneProgress(progress);
  for (const item of sortRundown(items)) {
    if (item.overnight && !includeOvernight) continue;
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block) continue;
    const folder = sourceFolder(item, block);
    if (!folder) continue;
    if (item.mode === "next-episode") next.lastCompleted[folder] = item.path;
    else if (item.mode === "random-file") {
      const prev = next.recentRandom[folder] ?? [];
      next.recentRandom[folder] = [item.path, ...prev.filter((file) => file !== item.path)].slice(
        0,
        RECENT_RANDOM_LIMIT,
      );
    }
  }
  return next;
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    const raw = await readFile(file, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// The saved TV schedule, or the old single-day file the first time.
async function readBoard(): Promise<BoardFile> {
  const saved = await readJsonFile(tvPath);
  const legacy = await readJsonFile(todayPath);
  const legacyDay = isDay(legacy) && legacy.date ? legacy : null;
  if (saved && typeof saved === "object" && Array.isArray((saved as BoardFile).days)) {
    const file = saved as BoardFile;
    const days = file.days.filter(isDay);
    if (days.length > 0 || !legacyDay) {
      return {
        carriedInto: typeof file.carriedInto === "string" ? file.carriedInto : undefined,
        days,
      };
    }
  }
  return { days: legacyDay ? [legacyDay] : [] };
}

async function writeBoard(board: BoardFile): Promise<void> {
  const byDate = new Map<string, DayRundown>();
  for (const day of board.days) byDate.set(day.date, day);
  await writeJson(tvPath, {
    carriedInto: board.carriedInto,
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  });
}

function inWindow(today: string, date: string): boolean {
  const offset = dateOffset(today, date);
  return offset >= -TV_PAST && offset <= TV_AHEAD;
}

type SeriesCursor = {
  last?: string;
  consumed?: string;
  follow: boolean;
  day?: string;
};

// Keep a Previous or Next choice. A skipped choice stays the next episode that airs.
function holdChosenEpisode(
  cursor: SeriesCursor,
  path: string,
  files: string[],
  missed: boolean,
  day: string,
): void {
  if (missed) {
    const index = files.indexOf(path);
    cursor.consumed = index > 0 ? files[index - 1] : undefined;
    cursor.last = path;
    cursor.follow = true;
    cursor.day = day;
    return;
  }
  cursor.last = path;
  cursor.consumed = path;
  cursor.follow = false;
  cursor.day = day;
}

// A next-episode slot uses its episode up only when it plays. A skip, and every
// next-episode row on yesterday, leaves that episode for the next time the show airs.
// A row picked with Previous or Next keeps its file across that refresh.
async function reflowSeries(board: BoardFile): Promise<boolean> {
  const schedule = await loadSchedule();
  const progress = await loadProgress();
  const today = dateKey();
  const now = nowSec();
  const days = board.days.filter((day) => inWindow(today, day.date)).sort((a, b) => a.date.localeCompare(b.date));
  const cursors = new Map<string, SeriesCursor>();
  const filesCache = new Map<string, string[]>();
  const touched = new Set<string>();
  let changed = false;

  async function filesIn(folder: string): Promise<string[]> {
    const cached = filesCache.get(folder);
    if (cached) return cached;
    const files = await videosIn(folder);
    filesCache.set(folder, files);
    return files;
  }

  async function place(item: RundownItem, file: string, date: string, blockId: string): Promise<void> {
    if (item.path === file) return;
    delete item.chosen;
    item.path = file;
    item.title = titleFromPath(file);
    item.durationSec = await probeDuration(file);
    changed = true;
    touched.add(`${date}|${blockId}`);
  }

  for (const day of days) {
    if (day.date < today) continue;
    for (const item of sortRundown(day.items)) {
      if (item.overnight || item.mode !== "next-episode") continue;
      const folder = seriesFolder(item, schedule);
      if (!folder) continue;
      const files = await filesIn(folder);
      const cursor = cursors.get(folder) ?? {
        last: progress.lastCompleted[folder],
        consumed: progress.lastCompleted[folder],
        follow: false,
      };
      cursors.set(folder, cursor);
      const played = item.status === "done" || item.status === "playing";
      const missed =
        item.status === "skipped" || (day.date === today && !played && itemHasPassed(item, now));
      if (played) {
        cursor.last = item.path;
        cursor.consumed = item.path;
        cursor.follow = true;
        cursor.day = day.date;
        continue;
      }
      if (cursor.day !== day.date) cursor.last = cursor.consumed;
      const laterSameDay = cursor.day === day.date;
      if (item.chosen && files.includes(item.path)) {
        holdChosenEpisode(cursor, item.path, files, missed, day.date);
        if (missed && item.status !== "skipped") {
          item.status = "skipped";
          changed = true;
        }
        continue;
      }
      if (item.chosen) {
        delete item.chosen;
        changed = true;
      }
      if (missed || cursor.follow || laterSameDay) {
        const episode = nextFrom(files, cursor.last);
        if (!episode) continue;
        await place(item, episode, day.date, item.blockId);
        cursor.last = episode;
        if (missed) {
          if (item.status !== "skipped") {
            item.status = "skipped";
            changed = true;
          }
          cursor.follow = true;
        } else {
          cursor.consumed = episode;
        }
        cursor.day = day.date;
        continue;
      }
      cursor.last = item.path;
      cursor.consumed = item.path;
      cursor.day = day.date;
    }
  }

  if (await mirrorYesterdaySkips(days, schedule, progress, filesIn, touched)) changed = true;
  if (syncOvernightCopies(days, schedule, touched)) changed = true;
  applyTouched(days, schedule, touched);
  return changed;
}

function seriesFolder(item: RundownItem, schedule: Schedule): string | undefined {
  if (item.mode !== "next-episode") return undefined;
  if (item.folder) return item.folder;
  const block = schedule.blocks.find((entry) => entry.id === item.blockId);
  return block?.folder || undefined;
}

// Folder this row uses for episode or random history.
function sourceFolder(item: RundownItem, block: ScheduleBlock): string {
  if (item.folder) return item.folder;
  return block.folder;
}

// Later than this slot on the saved week. Overnight leftovers sit before that morning's own slots.
function laterInWeek(
  date: string,
  item: RundownItem,
  origin: { date: string; start: string; overnight: boolean },
): boolean {
  if (date < origin.date) return false;
  if (date > origin.date) return true;
  if (origin.overnight) {
    if (item.overnight) return parseHm(item.start) > parseHm(origin.start);
    return true;
  }
  if (item.overnight) return false;
  return parseHm(item.start) > parseHm(origin.start);
}

function firstUpcomingPath(days: DayRundown[], folder: string, schedule: Schedule, today: string): string | undefined {
  for (const day of days) {
    if (day.date < today) continue;
    for (const item of sortRundown(day.items)) {
      if (item.overnight) continue;
      if (seriesFolder(item, schedule) !== folder) continue;
      return item.path;
    }
  }
  return undefined;
}

function applyTouched(days: DayRundown[], schedule: Schedule, touched: Set<string>): void {
  for (const key of touched) {
    const split = key.indexOf("|");
    const date = key.slice(0, split);
    const blockId = key.slice(split + 1);
    const day = days.find((entry) => entry.date === date);
    const block = schedule.blocks.find((entry) => entry.id === blockId);
    if (!day || !block) continue;
    day.items = sortRundown(day.items);
    recomputeBlockTimes(day, block);
  }
}

function syncOvernightCopies(
  days: DayRundown[],
  schedule: Schedule,
  touched: Set<string>,
): boolean {
  let changed = false;
  for (const day of days) {
    const prev = days.find((entry) => entry.date === shiftDateKey(day.date, -1));
    if (!prev) continue;
    const sources = sortRundown(prev.items).filter((item) => {
      if (item.overnight || item.mode !== "next-episode") return false;
      return parseHm(item.start) + item.durationSec > DAY_SECONDS;
    });
    const targets = sortRundown(day.items).filter((item) => item.overnight && item.mode === "next-episode");
    const count = Math.min(sources.length, targets.length);
    for (let index = 0; index < count; index++) {
      const source = sources[index]!;
      const target = targets[index]!;
      if (target.status === "playing") continue;
      if (target.path !== source.path || target.durationSec !== source.durationSec || target.title !== source.title) {
        target.path = source.path;
        target.title = source.title;
        target.durationSec = source.durationSec;
        changed = true;
        touched.add(`${day.date}|${target.blockId}`);
      }
      if (source.status === "skipped" && target.status !== "skipped") {
        target.status = "skipped";
        changed = true;
      }
    }
  }
  return changed;
}

async function mirrorYesterdaySkips(
  days: DayRundown[],
  schedule: Schedule,
  progress: Progress,
  filesOf: (folder: string) => Promise<string[]>,
  touched: Set<string>,
  folderFilter?: string,
): Promise<boolean> {
  const today = dateKey();
  const yesterday = days.find((day) => day.date === shiftDateKey(today, -1));
  if (!yesterday) return false;
  const skippedCursor = new Map<string, string>();
  let changed = false;
  for (const item of sortRundown(yesterday.items)) {
    if (item.overnight) continue;
    const folder = seriesFolder(item, schedule);
    if (!folder || (folderFilter && folder !== folderFilter)) continue;
    if (item.status === "done") {
      skippedCursor.set(folder, item.path);
      continue;
    }
    const files = await filesOf(folder);
    const previous = skippedCursor.get(folder);
    const episode = previous
      ? nextFrom(files, previous)
      : (firstUpcomingPath(days, folder, schedule, today) ?? nextFrom(files, progress.lastCompleted[folder]));
    if (!episode) continue;
    if (item.path !== episode) {
      item.path = episode;
      item.title = titleFromPath(episode);
      item.durationSec = await probeDuration(episode);
      changed = true;
      touched.add(`${yesterday.date}|${item.blockId}`);
    }
    skippedCursor.set(folder, episode);
    if (item.status !== "skipped") {
      item.status = "skipped";
      changed = true;
    }
  }
  return changed;
}

// Later slots of this show follow the episode that was just chosen.
async function continueShowAfter(
  board: BoardFile,
  schedule: Schedule,
  folder: string,
  files: string[],
  origin: { date: string; start: string; overnight: boolean; path: string },
): Promise<void> {
  const today = dateKey();
  const now = nowSec();
  const days = board.days.filter((day) => inWindow(today, day.date)).sort((a, b) => a.date.localeCompare(b.date));
  const touched = new Set<string>();
  let cursor = origin.path;
  for (const day of days) {
    if (day.date < origin.date) continue;
    for (const item of sortRundown(day.items)) {
      if (seriesFolder(item, schedule) !== folder) continue;
      if (item.overnight) continue;
      if (!laterInWeek(day.date, item, origin)) continue;
      delete item.chosen;
      const played = item.status === "done" || item.status === "playing";
      const missed =
        item.status === "skipped" || (day.date === today && !played && itemHasPassed(item, now));
      if (played) {
        cursor = item.path;
        continue;
      }
      const episode = nextFrom(files, cursor);
      if (!episode) continue;
      if (item.path !== episode) {
        item.path = episode;
        item.title = titleFromPath(episode);
        item.durationSec = await probeDuration(episode);
        touched.add(`${day.date}|${item.blockId}`);
      }
      if (missed) {
        if (item.status !== "skipped") item.status = "skipped";
      } else {
        cursor = episode;
      }
    }
  }
  syncOvernightCopies(days, schedule, touched);
  await mirrorYesterdaySkips(days, schedule, await loadProgress(), async () => files, touched, folder);
  applyTouched(days, schedule, touched);
}

function windowReady(board: BoardFile, today: string, fillAhead: boolean): boolean {
  if (board.carriedInto !== today) return false;
  const dates = new Set(board.days.map((day) => day.date));
  if (!dates.has(today)) return false;
  if (board.days.some((day) => !inWindow(today, day.date))) return false;
  if (!fillAhead) return true;
  for (let offset = -TV_PAST; offset <= TV_AHEAD; offset++) {
    if (!dates.has(shiftDateKey(today, offset))) return false;
  }
  return true;
}

function presentBoard(board: BoardFile): TvBoard {
  const today = dateKey();
  const days: DayRundown[] = [];
  for (let offset = -TV_PAST; offset <= TV_AHEAD; offset++) {
    const date = shiftDateKey(today, offset);
    const saved = board.days.find((day) => day.date === date);
    if (saved) days.push(saved);
    else if (date === today) days.push({ date, items: [] });
  }
  return { today, days, building: buildingIds ? [...buildingIds] : [] };
}

// Mark these week slots as still being timed.
export function markBuilding(ids: Iterable<string>): void {
  buildingIds = new Set(ids);
}

// True while a rundown rebuild is still timing slots.
function stillBuilding(): boolean {
  return buildingIds !== null && buildingIds.size > 0;
}

// Clear the week spinner once later days are written.
function clearBuilding(): void {
  buildingIds = null;
}

// Slots that belong to this calendar day, without the previous night's leftover.
async function buildOwnItems(
  date: string,
  progress: Progress,
  existing?: DayRundown,
  changedIds?: Set<string>,
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
          );
    items.push(...built);
    for (const item of built) {
      const folder = sourceFolder(item, block);
      if (!folder) continue;
      if (item.mode === "next-episode") shadow.lastCompleted[folder] = item.path;
      else if (item.mode === "random-file") {
        const prev = shadow.recentRandom[folder] ?? [];
        shadow.recentRandom[folder] = [item.path, ...prev.filter((file) => file !== item.path)].slice(
          0,
          RECENT_RANDOM_LIMIT,
        );
      }
    }
  }
  return { items, progress: shadow };
}

// The part of the previous day that is still on after midnight.
function plannedSpill(previous: DayRundown, schedule: Schedule): RundownItem[] {
  const day = weekdayOfKey(previous.date);
  const out: RundownItem[] = [];
  for (const item of previous.items) {
    if (item.overnight) continue;
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block?.days.includes(day)) continue;
    if (blockLeftoverSec(block, day, previous.items) <= 0) continue;
    if (parseHm(item.start) + item.durationSec <= DAY_SECONDS) continue;
    out.push({ ...item, id: randomUUID(), overnight: true, status: "planned" });
  }
  return out;
}

// Keep saved days, drop anything older than yesterday, and fill days that are missing.
async function syncBoard(fillAhead: boolean): Promise<BoardFile> {
  const today = dateKey();
  const yesterday = shiftDateKey(today, -1);
  const board = await readBoard();
  if (windowReady(board, today, fillAhead)) {
    if (await reflowSeries(board)) await writeBoard(board);
    return board;
  }

  const savedDates = new Set(board.days.map((day) => day.date));
  const byDate = new Map<string, DayRundown>();
  for (const day of board.days) {
    if (inWindow(today, day.date)) byDate.set(day.date, day);
  }

  const schedule = await loadSchedule();
  let carriedInto = board.carriedInto;
  const savedYesterday = savedDates.has(yesterday) ? byDate.get(yesterday) : undefined;
  const existingToday = byDate.get(today);
  if (existingToday && carriedInto !== today && savedYesterday) {
    const stripped = existingToday.items.filter((item) => !item.overnight);
    const carry = leftoverCarry(savedYesterday.items, schedule, weekdayOfKey(yesterday), nowSec());
    byDate.set(today, { date: today, items: sortRundown([...carry, ...stripped]) });
    carriedInto = today;
  }

  if (!byDate.has(today)) {
    const built = await buildRundown(today);
    if (savedYesterday) {
      const carry = leftoverCarry(savedYesterday.items, schedule, weekdayOfKey(yesterday), nowSec());
      byDate.set(today, { date: today, items: mergeOvernight(built.items, carry) });
    } else {
      byDate.set(today, built);
    }
    carriedInto = today;
  }

  if (fillAhead && !byDate.has(yesterday)) {
    const own = await buildOwnItems(yesterday, await loadProgress());
    byDate.set(yesterday, { date: yesterday, items: sortRundown(own.items) });
  }

  if (fillAhead) {
    let progress = notePicks(await loadProgress(), byDate.get(today)!.items, schedule, true);
    let previous = byDate.get(today)!;
    for (let offset = 1; offset <= TV_AHEAD; offset++) {
      const date = shiftDateKey(today, offset);
      let day = byDate.get(date);
      if (!day) {
        const own = await buildOwnItems(date, progress);
        const spill = plannedSpill(previous, schedule);
        day = { date, items: sortRundown([...spill, ...own.items]) };
        byDate.set(date, day);
        progress = own.progress;
      } else {
        progress = notePicks(progress, day.items, schedule);
      }
      previous = day;
    }
  }

  const next: BoardFile = {
    carriedInto: today,
    days: [...byDate.values()],
  };
  await reflowSeries(next);
  await writeBoard(next);
  return next;
}

// The live day as last written, without waiting for a rebuild.
export async function savedToday(): Promise<TodayRundown> {
  const board = await readBoard();
  const today = dateKey();
  return board.days.find((day) => day.date === today) ?? { date: today, items: [] };
}

// The live day, rolling the saved schedule forward when the date has changed.
export function loadToday(): Promise<TodayRundown> {
  return exclusive(async () => {
    if (await scheduleAheadOfBoard()) {
      return rebuildTodayPreservingPlaybackLocked();
    }
    const board = await syncBoard(false);
    const today = dateKey();
    return board.days.find((day) => day.date === today) ?? { date: today, items: [] };
  });
}

export function ensureToday(): Promise<TodayRundown> {
  return loadToday();
}

// Yesterday through the next six days. Today is returned as saved; a missing later day is filled afterwards.
export function ensureBoard(): Promise<TvBoard> {
  if (boardWait) return boardWait;
  const run = ensureBoardBody().finally(() => {
    if (boardWait === run) boardWait = null;
  });
  boardWait = run;
  return run;
}

// A planned row whose window has ended is skipped. Progress stays as it was.
function closePassedSlots(board: BoardFile): boolean {
  const today = dateKey();
  const now = nowSec();
  const day = board.days.find((entry) => entry.date === today);
  if (!day) return false;
  let changed = false;
  for (const item of day.items) {
    if (item.status !== "planned") continue;
    if (!itemHasPassed(item, now)) continue;
    item.status = "skipped";
    changed = true;
  }
  return changed;
}

// Persist passed slots, then return the same board.
async function settlePassed(board: BoardFile): Promise<BoardFile> {
  if (closePassedSlots(board)) await writeBoard(board);
  return board;
}

// The saved week. A later-day rebuild does not hold this up, and a failed rebuild still returns the last save.
async function ensureBoardBody(): Promise<TvBoard> {
  if (stillBuilding()) return presentBoard(await readBoard());
  if (rebuildingAhead > 0 && !(await scheduleAheadOfBoard())) {
    return presentBoard(await exclusive(async () => settlePassed(await readBoard())));
  }
  return exclusive(async () => {
    if (await scheduleAheadOfBoard()) {
      try {
        await rebuildTodayPreservingPlaybackLocked();
      } catch (err) {
        console.error("rundown rebuild failed", err);
      }
      return presentBoard(await settlePassed(await readBoard()));
    }
    const today = dateKey();
    let board = await readBoard();
    if (!windowReady(board, today, true)) {
      if (!windowReady(board, today, false)) board = await syncBoard(false);
      else if (await reflowSeries(board)) await writeBoard(board);
      scheduleFill();
    } else if (await reflowSeries(board)) {
      await writeBoard(board);
    }
    return presentBoard(await settlePassed(board));
  });
}

// Write the live day back without dropping the other saved days.
export function saveToday(rundown: TodayRundown): Promise<void> {
  return exclusive(async () => {
    const board = await readBoard();
    const today = dateKey();
    const days = board.days.filter((day) => day.date !== rundown.date && inWindow(today, day.date));
    days.push(rundown);
    await writeBoard({ carriedInto: board.carriedInto, days });
  });
}

// A rundown row from any saved day. Overnight copies share an id and the same file.
export async function findRundownItem(id: string): Promise<RundownItem | undefined> {
  const board = await readBoard();
  for (const day of board.days) {
    const item = day.items.find((entry) => entry.id === id);
    if (item) return item;
  }
  return undefined;
}

// Rebuild today around playback, then rebuild the days after it. Yesterday stays as it was.
export function rebuildTodayPreservingPlayback(changedIds?: string[]): Promise<TodayRundown> {
  return exclusive(() => rebuildTodayPreservingPlaybackLocked(changedIds ? new Set(changedIds) : undefined));
}

// True when the week on disk is newer than the saved TV schedule.
async function scheduleAheadOfBoard(): Promise<boolean> {
  try {
    const [sched, tv] = await Promise.all([stat(schedulePath), stat(tvPath)]);
    return sched.mtimeMs > tv.mtimeMs;
  } catch {
    return true;
  }
}

async function rebuildTodayPreservingPlaybackLocked(changedIds?: Set<string>): Promise<TodayRundown> {
  if (changedIds?.size) markBuilding(changedIds);
  else markBuilding((await loadSchedule()).blocks.map((block) => block.id));
  try {
    return await rebuildTodayPreservingPlaybackBody(changedIds);
  } catch (err) {
    if (rebuildingAhead === 0) clearBuilding();
    throw err;
  }
}

// Time today's files, then queue the later days.
async function rebuildTodayPreservingPlaybackBody(changedIds?: Set<string>): Promise<TodayRundown> {
  const board = await syncBoard(false);
  const today = dateKey();
  const current = board.days.find((day) => day.date === today) ?? { date: today, items: [] };
  const rebuilt = await rebuildLiveDay(current, changedIds);
  const savedYesterday = board.days.find((day) => day.date === shiftDateKey(today, -1));
  const head: DayRundown[] = [];
  if (savedYesterday) head.push(savedYesterday);
  head.push(rebuilt);
  const drafted: BoardFile = { carriedInto: today, days: head };
  await reflowSeries(drafted);
  const later = board.days.filter((day) => day.date > today && inWindow(today, day.date));
  await writeBoard({ carriedInto: today, days: [...drafted.days, ...later] });
  scheduleAheadRebuild(changedIds);
  return rebuilt;
}

// Rebuild the days after today without holding the TV schedule read.
function scheduleAheadRebuild(changedIds?: Set<string>): void {
  aheadChain = aheadChain.then(
    () => rebuildDaysAfterToday(changedIds),
    () => rebuildDaysAfterToday(changedIds),
  );
}

// Files and times that identify a day, so a play or a skip does not drop the later days.
function dayFiles(day: DayRundown): string {
  return day.items
    .map((item) => `${item.blockId}|${item.path}|${item.start}|${item.durationSec}|${item.overnight ? 1 : 0}`)
    .join("\n");
}

// Replace the saved days after today from the live day. A newer today write wins.
async function rebuildDaysAfterToday(changedIds?: Set<string>): Promise<void> {
  rebuildingAhead += 1;
  try {
    const today = dateKey();
    const board = await readBoard();
    const live = board.days.find((day) => day.date === today);
    if (!live) return;
    const stamp = dayFiles(live);
    const schedule = await loadSchedule();
    let progress = notePicks(await loadProgress(), live.items, schedule, true);
    let previous = live;
    const days: DayRundown[] = [];
    const savedYesterday = board.days.find((day) => day.date === shiftDateKey(today, -1));
    if (savedYesterday) days.push(savedYesterday);
    days.push(live);
    for (let offset = 1; offset <= TV_AHEAD; offset++) {
      const date = shiftDateKey(today, offset);
      const saved = board.days.find((day) => day.date === date);
      const own = await buildOwnItems(date, progress, saved, changedIds);
      const spill = plannedSpill(previous, schedule);
      const day = { date, items: sortRundown([...spill, ...own.items]) };
      days.push(day);
      previous = day;
      progress = own.progress;
    }
    const next: BoardFile = { carriedInto: today, days };
    await reflowSeries(next);
    await exclusive(async () => {
      const latest = await readBoard();
      const current = latest.days.find((day) => day.date === today);
      if (!current || dayFiles(current) !== stamp) {
        if (current) scheduleAheadRebuild(changedIds);
        return;
      }
      const yesterday = latest.days.find((day) => day.date === shiftDateKey(today, -1));
      const days: DayRundown[] = [];
      if (yesterday) days.push(yesterday);
      days.push(current);
      days.push(...next.days.filter((day) => day.date > today));
      await writeBoard({ carriedInto: today, days });
    });
  } catch (err) {
    console.error("rundown rebuild failed", err);
  } finally {
    rebuildingAhead -= 1;
    if (rebuildingAhead === 0) clearBuilding();
  }
}

// Today's slots from the timetable, keeping a file that is already playing or finished.
async function rebuildLiveDay(current: DayRundown, changedIds?: Set<string>): Promise<DayRundown> {
  const today = dateKey();
  const built = await buildRundown(today, current, changedIds);
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

// Fill today's items from the schedule and each video's length.
export async function buildRundown(
  date = dateKey(),
  existing?: DayRundown,
  changedIds?: Set<string>,
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
          );
    items.push(...built);
    for (const item of built) {
      const folder = sourceFolder(item, block);
      if (!folder) continue;
      if (item.mode === "next-episode") progress.lastCompleted[folder] = item.path;
      else if (item.mode === "random-file") {
        const prev = progress.recentRandom[folder] ?? [];
        progress.recentRandom[folder] = [item.path, ...prev.filter((file) => file !== item.path)].slice(
          0,
          RECENT_RANDOM_LIMIT,
        );
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

async function itemsForWindow(
  block: ScheduleBlock,
  cursorStart: number,
  blockEnd: number,
  progress: Progress,
  kept: RundownItem[] = [],
): Promise<RundownItem[]> {
  if (block.mode === "playlist") {
    return itemsForPlaylist(block, cursorStart, progress, kept);
  }

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
    items.push(makeItem(block, meta.url, cursorStart, meta.durationSec, { title: meta.title }));
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

// One file per stacked entry, back to back, so the player never fills a gap.
async function itemsForPlaylist(
  block: ScheduleBlock,
  cursorStart: number,
  progress: Progress,
  kept: RundownItem[] = [],
): Promise<RundownItem[]> {
  const items: RundownItem[] = [];
  const shadow = cloneProgress(progress);
  const usedByFolder = new Map<string, string[]>();
  const unused = kept.slice();
  let cursor = cursorStart;
  for (const entry of block.items ?? []) {
    const used = usedByFolder.get(entry.folder) ?? [];
    const prev = takeKeptEntry(unused, entry);
    let picked: { path: string; durationSec: number; title: string } | null = null;
    if (entry.mode === "random-file" && prev && (await randomPickStillValid(entry, prev, used))) {
      picked = { path: prev.path, durationSec: prev.durationSec, title: prev.title };
    } else if (entry.mode === "next-episode" && prev?.chosen) {
      picked = { path: prev.path, durationSec: prev.durationSec, title: prev.title };
    } else {
      picked = await pickEntry(entry, shadow, used);
    }
    if (!picked) continue;
    items.push(placePlaylistItem(block, entry, prev, picked, cursor));
    if (entry.folder) {
      usedByFolder.set(entry.folder, [...used, picked.path]);
      if (entry.mode === "next-episode") shadow.lastCompleted[entry.folder] = picked.path;
      else if (entry.mode === "random-file") {
        const recent = shadow.recentRandom[entry.folder] ?? [];
        shadow.recentRandom[entry.folder] = [picked.path, ...recent.filter((file) => file !== picked.path)].slice(
          0,
          RECENT_RANDOM_LIMIT,
        );
      }
    }
    cursor += picked.durationSec;
  }
  return items;
}

// Saved rows for this slot on this day, not the leftover from yesterday.
function keptForBlock(existing: DayRundown | undefined, blockId: string): RundownItem[] {
  if (!existing) return [];
  return sortRundown(existing.items).filter((item) => item.blockId === blockId && !item.overnight);
}

// Pull the saved row for this stacked video, if this day already had it.
function takeKeptEntry(unused: RundownItem[], entry: PlaylistEntry): RundownItem | undefined {
  const byId = unused.findIndex((item) => item.entryId === entry.id);
  if (byId >= 0) return unused.splice(byId, 1)[0];
  const byShape = unused.findIndex((item) => {
    if (item.entryId) return false;
    if (item.mode !== entry.mode) return false;
    if (entry.mode === "youtube") {
      const url = parseYoutubeUrl(entry.file ?? "") ?? (entry.file ?? "").trim();
      return item.path === url;
    }
    if (entry.mode === "specific-file") return item.path === (entry.file ?? "").trim();
    return (item.folder ?? "") === entry.folder;
  });
  if (byShape >= 0) return unused.splice(byShape, 1)[0];
  return undefined;
}

// True when this day's random pick can stay, so a save does not shuffle it.
async function randomPickStillValid(
  entry: PlaylistEntry,
  item: RundownItem,
  used: string[],
): Promise<boolean> {
  if (item.mode !== "random-file" || !item.path) return false;
  if (used.includes(item.path)) return false;
  const files = await videosIn(entry.folder);
  if (!files.includes(item.path)) return false;
  const durationSec = item.durationSec > 0 ? item.durationSec : await probeDuration(item.path);
  if (entry.lengthMin && !itemFits(durationSec, entry.lengthMin * 60)) return false;
  return true;
}

// Keep the saved row when this stacked video is still the same pick.
function placePlaylistItem(
  block: ScheduleBlock,
  entry: PlaylistEntry,
  prev: RundownItem | undefined,
  picked: { path: string; durationSec: number; title: string },
  startSec: number,
): RundownItem {
    if (prev) {
    const rest = { ...prev };
    delete rest.overnight;
    return {
      ...rest,
      entryId: entry.id,
      path: picked.path,
      title: picked.title,
      durationSec: picked.durationSec,
      mode: entry.mode,
      folder: entry.folder,
      start: formatHm(startSec),
      end: formatHm(startSec + picked.durationSec),
    };
  }
  return makeItem(block, picked.path, startSec, picked.durationSec, {
    title: picked.title,
    mode: entry.mode,
    folder: entry.folder,
    entryId: entry.id,
  });
}

// The one file this stacked entry will play.
async function pickEntry(
  entry: PlaylistEntry,
  progress: Progress,
  used: string[],
): Promise<{ path: string; durationSec: number; title: string } | null> {
  if (entry.mode === "youtube") {
    const url = parseYoutubeUrl(entry.file ?? "");
    if (!url) return null;
    try {
      const meta = await probeYoutube(url);
      return { path: meta.url, durationSec: meta.durationSec, title: meta.title };
    } catch {
      return null;
    }
  }
  if (entry.mode === "specific-file") {
    const file = entry.file;
    if (!file || !(await isVideoFile(file))) return null;
    return { path: file, durationSec: await probeDuration(file), title: titleFromPath(file) };
  }
  const files = await videosIn(entry.folder);
  if (files.length === 0) return null;
  if (entry.mode === "next-episode") {
    const file = nextFrom(files, progress.lastCompleted[entry.folder]);
    if (!file) return null;
    return { path: file, durationSec: await probeDuration(file), title: titleFromPath(file) };
  }
  const recent = progress.recentRandom[entry.folder] ?? [];
  const remaining = entry.lengthMin ? entry.lengthMin * 60 : null;
  const passed = new Set<string>();
  while (true) {
    const pool = files.filter((candidate) => !passed.has(candidate) && !used.includes(candidate));
    if (pool.length === 0) return null;
    const file = randomFile(pool, recent);
    if (!file) return null;
    const durationSec = await probeDuration(file);
    if (remaining == null || itemFits(durationSec, remaining)) {
      return { path: file, durationSec, title: titleFromPath(file) };
    }
    passed.add(file);
  }
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
    const leftoverSec = blockLeftoverSec(block, yesterday, items);
    if (leftoverSec <= 0) continue;
    const leftover = { ...item, overnight: true };
    if (item.status === "playing" || leftoverStillActive(leftover, now, leftoverSec)) {
      out.push(leftover);
    }
  }
  return out;
}

// Seconds after midnight this block still occupies, from its files or its window.
function blockLeftoverSec(block: ScheduleBlock, day: Day, items: RundownItem[]): number {
  const placed = windowOn(block, day);
  if (block.mode !== "playlist") return leftoverMin(placed) * 60;
  let leftover = 0;
  for (const item of items) {
    if (item.blockId !== block.id || item.overnight) continue;
    leftover = Math.max(leftover, parseHm(item.start) + item.durationSec - DAY_SECONDS);
  }
  return Math.max(0, leftover);
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
  extra?: { title?: string; mode?: ItemMode; folder?: string; entryId?: string },
): RundownItem {
  const mode = extra?.mode ?? (block.mode === "playlist" ? "specific-file" : block.mode);
  return {
    id: randomUUID(),
    blockId: block.id,
    path: file,
    title: extra?.title ?? titleFromPath(file),
    mode,
    folder: extra?.folder ?? (mode === "youtube" ? "" : block.folder),
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

// Length of the file a new slot will play. A random folder uses its longest video.
export async function slotLength(opts: {
  mode: ItemMode;
  folder: string;
  file?: string;
  /** Cap in minutes. A random folder then uses the longest file that still fits. */
  maxMin?: number;
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

  const remaining = opts.maxMin && opts.maxMin > 0 ? opts.maxMin * 60 : null;
  let longest: { file: string; durationSec: number } | null = null;
  let shortest: { file: string; durationSec: number } | null = null;
  for (const file of files) {
    const durationSec = await probeDuration(file);
    if (remaining != null && !itemFits(durationSec, remaining)) continue;
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
  if (block.mode === "playlist") {
    for (const entry of block.items ?? []) {
      if (entry.mode !== "random-file" || !entry.lengthMin) continue;
      const miss = await missForRandomFolder(block.id, entry.folder, entry.lengthMin * 60);
      if (miss) return miss;
    }
    return null;
  }
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

  return missForRandomFolder(block.id, block.folder, slotSec);
}

// True when every file in a random folder is too long for this window.
async function missForRandomFolder(
  blockId: string,
  folder: string,
  slotSec: number,
): Promise<SlotMiss | null> {
  const files = await videosIn(folder);
  if (files.length === 0) return null;
  const limitSec = maxPlayableSec(slotSec);
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
    blockId,
    kind: "folder",
    title: shortest.title,
    durationSec: shortest.durationSec,
    limitSec,
  };
}

function editableDay(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || dateOffset(dateKey(), date) > TV_AHEAD) {
    throw new Error("Item not found");
  }
}

// A slot that has not aired can take a different file.
function stillToAir(date: string, item: RundownItem): boolean {
  if (item.status === "playing" || item.status === "done" || item.status === "skipped") return false;
  const offset = dateOffset(dateKey(), date);
  if (offset < 0) return false;
  if (offset === 0 && itemHasPassed(item, nowSec())) return false;
  return true;
}

// Mark as skipped applies to yesterday and to today's slots that have already aired.
function alreadyAired(date: string, item: RundownItem): boolean {
  if (item.status === "playing") return false;
  const offset = dateOffset(dateKey(), date);
  if (offset < 0) return true;
  if (offset > 0) return false;
  if (item.status === "done") return true;
  return itemHasPassed(item, nowSec());
}

// Record a movie as recently played, or an episode as watched so later airings move on.
export function markItemDone(date: string, itemId: string): Promise<TvBoard> {
  editableDay(date);
  return exclusive(async () => {
    const board = await syncBoard(true);
    const rundown = board.days.find((day) => day.date === date);
    const item = rundown?.items.find((entry) => entry.id === itemId);
    if (!rundown || !item) throw new Error("Item not found");
    if (item.mode !== "next-episode" && item.mode !== "random-file") {
      throw new Error("Only an episode or a random movie can be marked done");
    }
    const playingMovie = item.status === "playing" && item.mode === "random-file";
    if (item.status === "playing" && !playingMovie) {
      throw new Error("A file that is on the air cannot be marked done");
    }

    const schedule = await loadSchedule();
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block) throw new Error("Block missing from schedule");
    const folder = sourceFolder(item, block);
    if (!folder) throw new Error("Block missing from schedule");

    if (item.mode === "random-file") {
      const marked = item.path;
      const replace = playingMovie || stillToAir(date, item);
      let next: string | null = null;
      if (replace) {
        const files = await videosIn(folder);
        const used = rundown.items
          .filter(
            (entry) =>
              entry.blockId === item.blockId &&
              entry.id !== item.id &&
              sourceFolder(entry, block) === folder,
          )
          .map((entry) => entry.path);
        const progress = await loadProgress();
        const recent = progress.recentRandom[folder] ?? [];
        next = randomFile(files, [...recent, ...used, marked]);
        if (playingMovie && (!next || next === marked)) throw new Error("No other files in this folder");
      }
      await markRandomPlayed(folder, marked);
      if (replace && next && next !== marked) {
        item.path = next;
        item.title = titleFromPath(next);
        item.durationSec = await probeDuration(next);
        item.status = playingMovie ? "playing" : "planned";
        recomputeBlockTimes(rundown, block);
        await writeBoard(board);
      }
      return presentBoard(board);
    }

    const files = await videosIn(folder);
    if (!files.includes(item.path)) throw new Error("Episode is no longer in this folder");
    await markEpisodeDone(folder, item.path);

    const live = date === dateKey();
    const now = nowSec();
    const aired =
      dateOffset(dateKey(), date) < 0 ||
      item.status === "done" ||
      item.status === "skipped" ||
      Boolean(item.overnight) ||
      (live && itemHasPassed(item, now));

    if (!aired) {
      const next = nextFrom(files, item.path);
      if (!next) throw new Error("Episode is no longer in this folder");
      item.path = next;
      item.title = titleFromPath(next);
      item.durationSec = await probeDuration(next);
      item.status = "planned";
      item.chosen = true;
      recomputeBlockTimes(rundown, block);
    } else {
      item.status = "done";
    }

    await continueShowAfter(board, schedule, folder, files, {
      date,
      start: item.start,
      overnight: Boolean(item.overnight),
      path: item.path,
    });
    await writeBoard(board);
    return presentBoard(board);
  });
}

// A done episode goes back to skipped, and a movie leaves recently played.
export function markItemSkipped(date: string, itemId: string): Promise<TvBoard> {
  editableDay(date);
  return exclusive(async () => {
    const board = await syncBoard(true);
    const rundown = board.days.find((day) => day.date === date);
    const item = rundown?.items.find((entry) => entry.id === itemId);
    if (!rundown || !item) throw new Error("Item not found");
    if (item.mode !== "next-episode" && item.mode !== "random-file") {
      throw new Error("Only an episode or a random movie can be marked done");
    }

    const schedule = await loadSchedule();
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block) throw new Error("Block missing from schedule");
    const folder = sourceFolder(item, block);
    if (!folder) throw new Error("Block missing from schedule");

    if (!alreadyAired(date, item)) throw new Error("Only a video that already aired can be marked skipped");
    if (item.mode === "next-episode" && item.status !== "done") {
      throw new Error("Only a finished episode can be marked skipped");
    }

    await forgetRandomPath(item.path);

    if (item.mode === "random-file") {
      if (item.status === "done") item.status = "skipped";
      await writeBoard(board);
      return presentBoard(board);
    }

    const files = await videosIn(folder);
    const progress = await loadProgress();
    const rewound = progress.lastCompleted[folder] === item.path;
    if (rewound) {
      const index = files.indexOf(item.path);
      if (index > 0) progress.lastCompleted[folder] = files[index - 1]!;
      else delete progress.lastCompleted[folder];
      await saveProgress(progress);
    }
    item.status = "skipped";
    delete item.chosen;
    if (rewound) {
      const previous = files[files.indexOf(item.path) - 1];
      await continueShowAfter(board, schedule, folder, files, {
        date,
        start: item.start,
        overnight: Boolean(item.overnight),
        path: previous ?? "",
      });
    }
    await writeBoard(board);
    return presentBoard(board);
  });
}

// Replace a random item on one saved day with another file, and retime its block.
export function shuffleItem(date: string, itemId: string): Promise<TvBoard> {
  editableDay(date);
  return exclusive(async () => {
    const board = await syncBoard(true);
    const rundown = board.days.find((day) => day.date === date);
    const item = rundown?.items.find((entry) => entry.id === itemId);
    if (!rundown || !item) throw new Error("Item not found");
    if (dateOffset(dateKey(), date) < 0) throw new Error("Cannot shuffle a playing or finished item");
    if (item.mode !== "random-file") throw new Error("Only random items can be shuffled");
    const live = date === dateKey();
    const playing = item.status === "playing";
    if (item.status === "done" || item.status === "skipped") {
      throw new Error("Cannot shuffle a playing or finished item");
    }
    if (!playing && live && itemHasPassed(item, nowSec())) {
      throw new Error("Cannot shuffle a playing or finished item");
    }

    const schedule = await loadSchedule();
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block) throw new Error("Block missing from schedule");

    const folder = sourceFolder(item, block);
    const files = await videosIn(folder);
    const used = rundown.items
      .filter(
        (entry) =>
          entry.blockId === item.blockId &&
          entry.id !== item.id &&
          sourceFolder(entry, block) === folder,
      )
      .map((entry) => entry.path);
    const progress = await loadProgress();
    const recent = progress.recentRandom[folder] ?? [];
    const next = randomFile(files, [...recent, ...used, item.path]);
    if (!next || next === item.path) throw new Error("No other files in this folder");

    item.path = next;
    item.title = titleFromPath(next);
    item.durationSec = await probeDuration(next);
    item.status = playing ? "playing" : "planned";
    recomputeBlockTimes(rundown, block);
    await writeBoard(board);
    return presentBoard(board);
  });
}

// Move a next-episode item to the previous or next file, and keep later episodes in order.
export function stepEpisode(date: string, itemId: string, direction: -1 | 1): Promise<TvBoard> {
  editableDay(date);
  return exclusive(async () => {
    const board = await syncBoard(true);
    const rundown = board.days.find((day) => day.date === date);
    const item = rundown?.items.find((entry) => entry.id === itemId);
    if (!rundown || !item) throw new Error("Item not found");
    if (item.mode !== "next-episode") throw new Error("Only next-episode items can change episode");
    const live = date === dateKey();
    const now = nowSec();
    const finished =
      dateOffset(dateKey(), date) < 0 ||
      item.status === "done" ||
      item.status === "skipped" ||
      (live && item.status !== "playing" && itemHasPassed(item, now));
    if (finished) throw new Error("Cannot change a finished episode");

    const schedule = await loadSchedule();
    const block = schedule.blocks.find((entry) => entry.id === item.blockId);
    if (!block) throw new Error("Slot missing from schedule");

    const folder = sourceFolder(item, block);
    const files = await videosIn(folder);
    const index = files.indexOf(item.path);
    if (index === -1) throw new Error("Episode is no longer in this folder");
    const startIndex = index + direction;
    if (startIndex < 0) throw new Error("No previous episode");
    if (startIndex >= files.length) throw new Error("No next episode");

    const tail = rundown.items.filter((row) => {
      if (row.blockId !== item.blockId || Boolean(row.overnight) !== Boolean(item.overnight)) return false;
      if (row.mode !== "next-episode") return false;
      if (sourceFolder(row, block) !== folder) return false;
      if (row.id === item.id) return true;
      if (parseHm(row.start) <= parseHm(item.start)) return false;
      if (row.status !== "planned") return false;
      if (live && itemHasPassed(row, now)) return false;
      return true;
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
      if (row.id === item.id) row.chosen = true;
      else delete row.chosen;
      cursor += 1;
    }
    if (drop.size > 0) rundown.items = rundown.items.filter((row) => !drop.has(row.id));

    recomputeBlockTimes(rundown, block);
    const remaining = tail.filter((row) => !drop.has(row.id));
    const last = remaining[remaining.length - 1] ?? item;
    await continueShowAfter(board, schedule, folder, files, {
      date,
      start: last.start,
      overnight: Boolean(last.overnight),
      path: last.path,
    });
    await writeBoard(board);
    return presentBoard(board);
  });
}

// Recalculate start and end times for every item in a block.
function recomputeBlockTimes(rundown: DayRundown, block: ScheduleBlock): void {
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
function tightestSlotSec(block: ScheduleBlock): number {
  return lengthMinutes(block) * 60;
}

// Schedule block with the given id.
export function findBlock(schedule: Schedule, blockId: string): ScheduleBlock | undefined {
  return schedule.blocks.find((b) => b.id === blockId);
}
