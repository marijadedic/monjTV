import type { PlayerStatus, RundownItem, ScheduleBlock, TodayRundown } from "../shared/types.ts";
import { msUntil, nowSec, parseHm, weekday } from "./clock.ts";
import { titleFromPath } from "./files.ts";
import { Mpv } from "./mpv.ts";
import { pick } from "./picker.ts";
import { markEpisodeDone, markRandomPlayed } from "./progress.ts";
import { ensureToday, itemFits, loadToday, saveToday } from "./rundown.ts";
import { blocksForDay, loadSchedule } from "./schedule.ts";

const mpv = new Mpv();
let waitingUntil: string | null = null;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let lastError: string | null = null;
let handlingEnd = false;
let replacing = false;
let stopping = false;
let fallbackPlay: { folder: string; path: string } | null = null;
let provisionalSkips: string[] = [];

mpv.onEndFile = (reason) => {
  void onEndFile(reason);
};
mpv.onExit = () => {
  if (stopping) return;
  waitingUntil = null;
  fallbackPlay = null;
  clearWait();
  void releaseQuit();
};

// Current player state for the API.
export async function getStatus(): Promise<PlayerStatus> {
  const today = await loadToday();
  const current = today.items.find((i) => i.status === "playing");
  let willStartItemId: string | null = null;
  if (!current && !fallbackPlay) {
    const schedule = await loadSchedule();
    const blocks = blocksForDay(schedule, weekday());
    willStartItemId = previewStart(today, blocks, nowSec())?.id ?? null;
  }
  return {
    running: mpv.running,
    waitingUntil,
    error: lastError,
    currentItemId: current?.id ?? null,
    willStartItemId,
    fallbackTitle: current || !fallbackPlay ? null : titleFromPath(fallbackPlay.path),
  };
}

// Start mpv and begin today's rundown.
export async function startPlayer(): Promise<PlayerStatus> {
  lastError = null;
  await ensureToday();
  try {
    await mpv.start();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastError = /ENOENT|not found/i.test(message)
      ? "mpv is not installed or not on PATH"
      : message;
    throw new Error(lastError);
  }
  await playNow();
  return getStatus();
}

// Quit mpv and exit playback so the process can stop.
export async function shutdownPlayer(): Promise<void> {
  stopping = true;
  replacing = true;
  clearWait();
  waitingUntil = null;
  fallbackPlay = null;
  await mpv.quit();
  await releaseQuit();
}

let releasing: Promise<void> | null = null;

// Put this start back to planned. A quit does not skip the file.
function releaseQuit(): Promise<void> {
  if (releasing) return releasing;
  releasing = revertQuit().finally(() => {
    releasing = null;
  });
  return releasing;
}

// Write the quit back onto today's rundown.
async function revertQuit(): Promise<void> {
  fallbackPlay = null;
  clearWait();
  waitingUntil = null;
  const undo = new Set(provisionalSkips);
  provisionalSkips = [];
  const today = await loadToday();
  let changed = false;
  for (const item of today.items) {
    if (item.status === "playing" || (item.status === "skipped" && undo.has(item.id))) {
      item.status = "planned";
      changed = true;
    }
  }
  if (changed) await saveToday(today);
}

// Mark the finished item done and start the next one. Quit leaves it planned.
async function onEndFile(reason: string): Promise<void> {
  if (reason === "quit") {
    if (handlingEnd) return;
    handlingEnd = true;
    try {
      await releaseQuit();
    } finally {
      handlingEnd = false;
    }
    return;
  }
  if (replacing || handlingEnd) return;
  if (reason !== "eof") return;
  handlingEnd = true;
  try {
    provisionalSkips = [];
    const today = await loadToday();
    const current = today.items.find((i) => i.status === "playing");
    const finishedIntermission = current ? null : fallbackPlay;
    if (current) {
      current.status = "done";
      await saveToday(today);
      const schedule = await loadSchedule();
      const block = schedule.blocks.find((b) => b.id === current.blockId);
      if (block) {
        if (current.mode === "next-episode") {
          await markEpisodeDone(block.folder, current.path);
        } else if (current.mode === "random-file") {
          await markRandomPlayed(block.folder, current.path);
        }
      }
    } else if (finishedIntermission) {
      await markEpisodeDone(finishedIntermission.folder, finishedIntermission.path);
    }
    await playNow();
  } finally {
    handlingEnd = false;
  }
}

// Play the next item that fits, or wait for the next block.
async function playNow(): Promise<void> {
  clearWait();
  waitingUntil = null;
  const today = await ensureToday();
  const schedule = await loadSchedule();
  const dayBlocks = blocksForDay(schedule, weekday());
  const now = nowSec();

  for (const item of today.items) {
    if (item.status !== "planned") continue;
    const block = dayBlocks.find((b) => b.id === item.blockId);
    if (!block) continue;
    if (now >= parseHm(block.end)) {
      item.status = "skipped";
      provisionalSkips.push(item.id);
    }
  }
  await saveToday(today);

  const currentBlock = dayBlocks.find(
    (b) => parseHm(b.start) <= now && now < parseHm(b.end),
  );
  if (currentBlock) {
    const picked = await firstFitting(today, currentBlock, now);
    if (picked) {
      await playItem(picked);
      return;
    }
    if (holdsFinishedVideo(today, currentBlock)) {
      await stopIntermission();
      armWaitForNext(dayBlocks, currentBlock.end);
      return;
    }
    const later = dayBlocks.filter((b) => parseHm(b.start) >= parseHm(currentBlock.end));
    for (const block of later) {
      const item = await firstFitting(today, block, now);
      if (item) {
        await playItem(item);
        return;
      }
    }
    await stopIntermission();
    armWaitForNext(dayBlocks, currentBlock.end);
    return;
  }

  const next = dayBlocks.find((b) => parseHm(b.start) > now);
  if (next) {
    waitingUntil = next.start;
    waitTimer = setTimeout(() => {
      void playNow();
    }, msUntil(parseHm(next.start)));
  }
  if (schedule.fallbackFolder) await playFallback(schedule.fallbackFolder);
}

// Cut off an intermission file so the scheduled block has the screen.
async function stopIntermission(): Promise<void> {
  if (!fallbackPlay) return;
  fallbackPlay = null;
  replacing = true;
  try {
    await mpv.stopPlayback();
  } finally {
    replacing = false;
  }
}

// Play the next episode from the intermission folder. The next block cuts it off.
async function playFallback(folder: string): Promise<void> {
  try {
    const file = await pick({ folder, mode: "next-episode" });
    if (!file) return;
    fallbackPlay = { folder, path: file };
    replacing = true;
    await mpv.loadFile(file);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    fallbackPlay = null;
  } finally {
    replacing = false;
  }
}

// Mark earlier planned items that do not fit as skipped, then return the one that does.
async function firstFitting(
  today: TodayRundown,
  block: ScheduleBlock,
  now: number,
): Promise<RundownItem | null> {
  const remaining = parseHm(block.end) - now;
  let changed = false;
  for (const item of today.items) {
    if (item.blockId !== block.id || item.status !== "planned") continue;
    if (!itemFits(item.durationSec, remaining)) {
      item.status = "skipped";
      provisionalSkips.push(item.id);
      changed = true;
      continue;
    }
    break;
  }
  if (changed) await saveToday(today);
  return nextStartable(today, block, now);
}

// Same file playNow would start, without marking anything skipped.
function previewStart(today: TodayRundown, blocks: ScheduleBlock[], now: number): RundownItem | null {
  const currentBlock = blocks.find((b) => parseHm(b.start) <= now && now < parseHm(b.end));
  if (!currentBlock) return null;
  const picked = nextStartable(today, currentBlock, now);
  if (picked) return picked;
  if (holdsFinishedVideo(today, currentBlock)) return null;
  const later = blocks.filter((b) => parseHm(b.start) >= parseHm(currentBlock.end));
  for (const block of later) {
    const item = nextStartable(today, block, now);
    if (item) return item;
  }
  return null;
}

// First planned item in the block that still fits the remaining time.
function nextStartable(today: TodayRundown, block: ScheduleBlock, now: number): RundownItem | null {
  const remaining = parseHm(block.end) - now;
  for (const item of today.items) {
    if (item.blockId !== block.id || item.status !== "planned") continue;
    if (!itemFits(item.durationSec, remaining)) continue;
    return item;
  }
  return null;
}

// Load an item in mpv and mark it playing. This replaces an intermission file mid-play.
async function playItem(item: RundownItem): Promise<void> {
  fallbackPlay = null;
  const today = await loadToday();
  for (const row of today.items) {
    if (row.id === item.id) row.status = "playing";
    else if (row.status === "playing") row.status = "planned";
  }
  await saveToday(today);
  replacing = true;
  try {
    await mpv.loadFile(item.path);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    replacing = false;
    if (stopping || !mpv.running) {
      await releaseQuit();
      return;
    }
    const again = await loadToday();
    const row = again.items.find((i) => i.id === item.id);
    if (row && row.status === "playing") {
      row.status = "skipped";
      await saveToday(again);
    }
    await playNow();
    return;
  }
  replacing = false;
}

// True when this block's chosen video has already finished and nothing else is queued.
function holdsFinishedVideo(today: TodayRundown, block: ScheduleBlock): boolean {
  if (block.mode !== "specific-file") return false;
  const owned = today.items.filter((item) => item.blockId === block.id);
  return (
    owned.some((item) => item.status === "done") &&
    !owned.some((item) => item.status === "planned" || item.status === "playing")
  );
}

// Wake when this block ends. The label names the next block, which still waits for its start.
function armWaitForNext(blocks: ScheduleBlock[], afterEnd: string): void {
  const endSec = parseHm(afterEnd);
  if (endSec <= nowSec()) return;
  const next = blocks.find((block) => parseHm(block.start) >= endSec);
  waitingUntil = next?.start ?? null;
  waitTimer = setTimeout(() => {
    void playNow();
  }, msUntil(endSec));
}

// Cancel the timer waiting for the next block.
function clearWait(): void {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}
