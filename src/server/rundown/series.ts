// Keep next-episode slots in order across the week.
import { shiftDateKey } from "../../shared/dates.ts";
import type { DayRundown, Progress, RundownItem, Schedule } from "../../shared/types.ts";
import { DAY_SECONDS, itemHasPassed } from "../../shared/window.ts";
import { dateKey, nowSec, parseHm } from "../clock/clock.ts";
import { loadProgress } from "../schedule/progress.ts";
import { loadSchedule } from "../schedule/schedule.ts";
import type { BoardFile } from "./boardFile.ts";
import { nextFrom, recomputeBlockTimes, seriesFolder, sortRundown } from "./item.ts";
import { lengthOf, nameOf, seriesFiles } from "./media.ts";
import { inWindow } from "./range.ts";

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
      item.title = nameOf(episode);
      item.durationSec = await lengthOf(episode);
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
      const source = sources[index];
      const target = targets[index];
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

// A next-episode slot uses its episode up only when it plays. A skip, and every
// next-episode row on yesterday, leaves that episode for the next time the show airs.
// A row picked with Previous or Next keeps its file across that refresh.
export async function reflowSeries(board: BoardFile): Promise<boolean> {
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
    const files = await seriesFiles(folder);
    filesCache.set(folder, files);
    return files;
  }

  async function place(item: RundownItem, file: string, date: string, blockId: string): Promise<void> {
    if (item.path === file) return;
    delete item.chosen;
    item.path = file;
    item.title = nameOf(file);
    item.durationSec = await lengthOf(file);
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

// Random movies already on the week, so a new pick does not land on one of them.
export function scheduledRandomPaths(days: DayRundown[], exceptId: string): string[] {
  const paths: string[] = [];
  for (const day of days) {
    for (const entry of day.items) {
      if (entry.id === exceptId || entry.mode !== "random-file" || !entry.path) continue;
      paths.push(entry.path);
    }
  }
  return paths;
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

// Later slots of this show follow the episode that was just chosen.
export async function continueShowAfter(
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
        item.title = nameOf(episode);
        item.durationSec = await lengthOf(episode);
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
  await mirrorYesterdaySkips(days, schedule, await loadProgress(), () => Promise.resolve(files), touched, folder);
  applyTouched(days, schedule, touched);
}
