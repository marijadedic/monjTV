// Load, save, and rebuild the saved week.
import { stat } from "node:fs/promises";
import { shiftDateKey, weekdayOfKey } from "../../shared/dates.ts";
import type {
  DayRundown,
  RundownItem,
  TodayRundown,
  TvBoard,
} from "../../shared/types.ts";
import { itemHasPassed } from "../../shared/window.ts";
import { dateKey, nowSec } from "../clock/clock.ts";
import { schedulePath, tvPath } from "../data/paths.ts";
import { loadProgress } from "../schedule/progress.ts";
import { loadSchedule } from "../schedule/schedule.ts";
import { readBoard, writeBoard, type BoardFile } from "./boardFile.ts";
import { buildOwnItems, buildRundown, rebuildLiveDay } from "./compose.ts";
import {
  leftoverCarry,
  mergeOvernight,
  plannedSpill,
  sortRundown,
} from "./item.ts";
import {
  clearBuilding,
  exclusive,
  listedBuildingIds,
  listedSaveMisses,
  markBuilding,
  stillBuilding,
} from "./lock.ts";
import { notePicks } from "./picks.ts";
import { TV_AHEAD, TV_PAST, inWindow, windowReady } from "./range.ts";
import { reflowSeries, scheduledRandomPaths } from "./series.ts";

let filling: Promise<void> | null = null;
let boardWait: Promise<TvBoard> | null = null;
let rebuildingAhead = 0;
let aheadChain: Promise<void> = Promise.resolve();

// Yesterday through six days ahead, with the spinner and the latest save warnings.
export function presentBoard(board: BoardFile): TvBoard {
  const today = dateKey();
  const days: DayRundown[] = [];

  for (let offset = -TV_PAST; offset <= TV_AHEAD; offset++) {
    const date = shiftDateKey(today, offset);
    const saved = board.days.find((day) => day.date === date);
    if (saved) days.push(saved);
    else if (date === today) days.push({ date, items: [] });
  }

  const misses = listedSaveMisses();
  return {
    today,
    days,
    building: listedBuildingIds(),
    missToken: misses.missToken,
    misses: misses.misses,
  };
}

// Keep saved days, drop anything older than yesterday, and fill days that are missing.
export async function syncBoard(fillAhead: boolean): Promise<BoardFile> {
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
  const carriedInto = board.carriedInto;
  const savedYesterday = savedDates.has(yesterday)
    ? byDate.get(yesterday)
    : undefined;
  const existingToday = byDate.get(today);
  if (existingToday && carriedInto !== today && savedYesterday) {
    const stripped = existingToday.items.filter((item) => !item.overnight);
    const carry = leftoverCarry(
      savedYesterday.items,
      schedule,
      weekdayOfKey(yesterday),
      nowSec(),
    );
    byDate.set(today, {
      date: today,
      items: sortRundown([...carry, ...stripped]),
    });
  }

  if (!byDate.has(today)) {
    const built = await buildRundown(
      today,
      undefined,
      undefined,
      scheduledRandomPaths(board.days, ""),
    );
    if (savedYesterday) {
      const carry = leftoverCarry(
        savedYesterday.items,
        schedule,
        weekdayOfKey(yesterday),
        nowSec(),
      );
      byDate.set(today, {
        date: today,
        items: mergeOvernight(built.items, carry),
      });
    } else {
      byDate.set(today, built);
    }
  }

  if (fillAhead && !byDate.has(yesterday)) {
    const own = await buildOwnItems(
      yesterday,
      await loadProgress(),
      undefined,
      undefined,
      scheduledRandomPaths(board.days, ""),
    );
    byDate.set(yesterday, { date: yesterday, items: sortRundown(own.items) });
  }

  if (fillAhead) {
    let progress = notePicks(
      await loadProgress(),
      byDate.get(today)!.items,
      schedule,
      true,
    );
    let previous = byDate.get(today)!;
    for (let offset = 1; offset <= TV_AHEAD; offset++) {
      const date = shiftDateKey(today, offset);
      let day = byDate.get(date);
      if (!day) {
        const own = await buildOwnItems(
          date,
          progress,
          undefined,
          undefined,
          scheduledRandomPaths(board.days, ""),
        );
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

// Fill the later days without failing the read that already returned Today.
async function fillMissingDays(): Promise<void> {
  try {
    await exclusive(() => syncBoard(true));
  } catch {
    // A failed fill leaves the saved week. The next read can try again.
  } finally {
    filling = null;
  }
}

// Probe a missing later day after Today has already been sent.
function scheduleFill(): void {
  if (filling) return;
  filling = fillMissingDays();
}

// The live day as last written, without waiting for a rebuild.
export async function savedToday(): Promise<TodayRundown> {
  const board = await readBoard();
  const today = dateKey();
  return (
    board.days.find((day) => day.date === today) ?? { date: today, items: [] }
  );
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

// Write the live day back without dropping the other saved days.
export function saveToday(rundown: TodayRundown): Promise<void> {
  return exclusive(async () => {
    const board = await readBoard();
    const today = dateKey();
    const days = board.days.filter(
      (day) => day.date !== rundown.date && inWindow(today, day.date),
    );
    days.push(rundown);

    await writeBoard({ carriedInto: board.carriedInto, days });
  });
}

// A rundown row from any saved day. Overnight copies share an id and the same file.
export async function findRundownItem(
  id: string,
): Promise<RundownItem | undefined> {
  const board = await readBoard();
  for (const day of board.days) {
    const item = day.items.find((entry) => entry.id === id);
    if (item) return item;
  }
  return undefined;
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

// Files and times that identify a day, so a play or a skip does not drop the later days.
function dayFiles(day: DayRundown): string {
  return day.items
    .map(
      (item) =>
        `${item.blockId}|${item.path}|${item.start}|${item.durationSec}|${item.overnight ? 1 : 0}`,
    )
    .join("\n");
}

// Rebuild the days after today without holding the TV schedule read.
function scheduleAheadRebuild(changedIds?: Set<string>): void {
  aheadChain = rebuildAfter(aheadChain, changedIds);
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
    const savedYesterday = board.days.find(
      (day) => day.date === shiftDateKey(today, -1),
    );
    if (savedYesterday) days.push(savedYesterday);
    days.push(live);

    for (let offset = 1; offset <= TV_AHEAD; offset++) {
      const date = shiftDateKey(today, offset);
      const saved = board.days.find((day) => day.date === date);
      const own = await buildOwnItems(
        date,
        progress,
        saved,
        changedIds,
        scheduledRandomPaths(board.days, ""),
      );
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

      const yesterday = latest.days.find(
        (day) => day.date === shiftDateKey(today, -1),
      );
      const kept: DayRundown[] = [];
      if (yesterday) kept.push(yesterday);
      kept.push(current);
      kept.push(...next.days.filter((day) => day.date > today));

      await writeBoard({ carriedInto: today, days: kept });
    });
  } catch (err) {
    console.error("rundown rebuild failed", err);
  } finally {
    rebuildingAhead -= 1;
    if (rebuildingAhead === 0) clearBuilding();
  }
}

// Run this rebuild after the previous one, even when that rebuild failed.
async function rebuildAfter(
  previous: Promise<void>,
  changedIds?: Set<string>,
): Promise<void> {
  try {
    await previous;
  } catch {
    // The previous rebuild failed. This one still runs.
  }
  await rebuildDaysAfterToday(changedIds);
}

// Time today's files, then queue the later days.
async function rebuildTodayPreservingPlaybackBody(
  changedIds?: Set<string>,
): Promise<TodayRundown> {
  const board = await syncBoard(false);
  const today = dateKey();
  const current = board.days.find((day) => day.date === today) ?? {
    date: today,
    items: [],
  };
  const rebuilt = await rebuildLiveDay(
    current,
    changedIds,
    scheduledRandomPaths(board.days, ""),
  );

  const savedYesterday = board.days.find(
    (day) => day.date === shiftDateKey(today, -1),
  );
  const head: DayRundown[] = [];
  if (savedYesterday) head.push(savedYesterday);
  head.push(rebuilt);

  const drafted: BoardFile = { carriedInto: today, days: head };
  await reflowSeries(drafted);

  const later = board.days.filter(
    (day) => day.date > today && inWindow(today, day.date),
  );
  await writeBoard({ carriedInto: today, days: [...drafted.days, ...later] });
  scheduleAheadRebuild(changedIds);

  return rebuilt;
}

async function rebuildTodayPreservingPlaybackLocked(
  changedIds?: Set<string>,
): Promise<TodayRundown> {
  if (changedIds?.size) markBuilding(changedIds);
  else markBuilding((await loadSchedule()).blocks.map((block) => block.id));

  try {
    return await rebuildTodayPreservingPlaybackBody(changedIds);
  } catch (err) {
    if (rebuildingAhead === 0) clearBuilding();
    throw err;
  }
}

// The live day, rolling the saved schedule forward when the date has changed.
export function loadToday(): Promise<TodayRundown> {
  return exclusive(async () => {
    if (await scheduleAheadOfBoard()) {
      return rebuildTodayPreservingPlaybackLocked();
    }
    const board = await syncBoard(false);
    const today = dateKey();
    return (
      board.days.find((day) => day.date === today) ?? { date: today, items: [] }
    );
  });
}

// The live day. Same read as loadToday.
export function ensureToday(): Promise<TodayRundown> {
  return loadToday();
}

// The saved week. A later-day rebuild does not hold this up, and a failed rebuild still returns the last save.
async function ensureBoardBody(): Promise<TvBoard> {
  if (stillBuilding()) return presentBoard(await readBoard());
  if (rebuildingAhead > 0 && !(await scheduleAheadOfBoard())) {
    return presentBoard(
      await exclusive(async () => settlePassed(await readBoard())),
    );
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

// Yesterday through the next six days. Today is returned as saved; a missing later day is filled afterwards.
export function ensureBoard(): Promise<TvBoard> {
  if (boardWait) return boardWait;

  const run = ensureBoardBody().finally(() => {
    if (boardWait === run) boardWait = null;
  });
  boardWait = run;
  return run;
}

// Rebuild today around playback, then rebuild the days after it. Yesterday stays as it was.
export function rebuildTodayPreservingPlayback(
  changedIds?: string[],
): Promise<TodayRundown> {
  return exclusive(() =>
    rebuildTodayPreservingPlaybackLocked(
      changedIds ? new Set(changedIds) : undefined,
    ),
  );
}
