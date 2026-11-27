// Mark done, mark skipped, shuffle, and step an episode.
import { dateOffset } from "../../shared/dates.ts";
import type { RundownItem, TvBoard } from "../../shared/types.ts";
import { itemHasPassed } from "../../shared/window.ts";
import { dateKey, nowSec, parseHm } from "../clock/clock.ts";
import { episodePaths, otherFolderPlays, takeRandom } from "../files/picker.ts";
import {
  forgetRandomPath,
  loadProgress,
  markEpisodeDone,
  markRandomPlayed,
  saveProgress,
} from "../schedule/progress.ts";
import { loadSchedule } from "../schedule/schedule.ts";
import { writeBoard } from "./boardFile.ts";
import { presentBoard, syncBoard } from "./board.ts";
import { nextFrom, recomputeBlockTimes, sourceFolder } from "./item.ts";
import { exclusive } from "./lock.ts";
import { lengthOf, nameOf } from "./media.ts";
import { TV_AHEAD } from "./range.ts";
import { continueShowAfter, scheduledRandomPaths } from "./series.ts";

// Refuse a date the TV week does not keep.
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
        const files = await episodePaths(folder);
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
        const choice = takeRandom(files, recent, {
          avoid: [...otherFolderPlays(progress.recentRandom, folder), ...scheduledRandomPaths(board.days, item.id)],
          block: [...used, marked],
        });
        next = choice?.path ?? null;
        if (playingMovie && (!next || next === marked)) throw new Error("No other files in this folder");
      }

      await markRandomPlayed(folder, marked);
      if (replace && next && next !== marked) {
        item.path = next;
        item.title = nameOf(next);
        item.durationSec = await lengthOf(next);
        item.status = playingMovie ? "playing" : "planned";

        recomputeBlockTimes(rundown, block);
        await writeBoard(board);
      }
      return presentBoard(board);
    }

    const files = await episodePaths(folder);
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
      item.title = nameOf(next);
      item.durationSec = await lengthOf(next);
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

    const files = await episodePaths(folder);
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
    const files = await episodePaths(folder);
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
    const choice = takeRandom(files, recent, {
      avoid: [...otherFolderPlays(progress.recentRandom, folder), ...scheduledRandomPaths(board.days, item.id)],
      block: [...used, item.path],
    });
    const next = choice?.path ?? null;
    if (!next || next === item.path) throw new Error("No other files in this folder");

    item.path = next;
    item.title = nameOf(next);
    item.durationSec = await lengthOf(next);
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
    const files = await episodePaths(folder);
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
    const startFile = files[startIndex];
    if (locked.has(startFile)) {
      throw new Error(direction < 0 ? "No previous episode" : "No next episode");
    }

    const drop = new Set<string>();
    let cursor = startIndex;
    for (const row of tail) {
      while (cursor < files.length && locked.has(files[cursor])) cursor += 1;
      const file = files[cursor];
      if (!file) {
        drop.add(row.id);
        continue;
      }

      row.path = file;
      row.title = nameOf(file);
      row.durationSec = await lengthOf(file);
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
