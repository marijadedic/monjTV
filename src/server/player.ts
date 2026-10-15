import type { PlayerStatus, RundownItem, ScheduleBlock, TodayRundown } from "../shared/types.ts";
import { msUntil, nowSec, parseHm, weekday } from "./clock.ts";
import { titleFromPath } from "./files.ts";
import { Mpv } from "./mpv.ts";
import { randomFile, videosIn } from "./picker.ts";
import { loadProgress, markEpisodeDone, markRandomPlayed } from "./progress.ts";
import { ensureToday, itemFits, loadToday, saveToday } from "./rundown.ts";
import { blocksForDay, loadSchedule } from "./schedule.ts";

const mpv = new Mpv();
let waitingUntil: string | null = null;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let lastError: string | null = null;
let handlingEnd = false;
let replacing = false;
let fallbackPath: string | null = null;

mpv.onEndFile = (reason) => {
  void onEndFile(reason);
};
mpv.onExit = () => {
  waitingUntil = null;
  fallbackPath = null;
  clearWait();
  void markPlayingAsPlanned();
};

// Current player state for the API.
export async function getStatus(): Promise<PlayerStatus> {
  const today = await loadToday();
  const current = today.items.find((i) => i.status === "playing");
  return {
    running: mpv.running,
    waitingUntil,
    error: lastError,
    currentItemId: current?.id ?? null,
    fallbackTitle: current || !fallbackPath ? null : titleFromPath(fallbackPath),
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

// Put a playing item back to planned when mpv exits.
async function markPlayingAsPlanned(): Promise<void> {
  const today = await loadToday();
  let changed = false;
  for (const item of today.items) {
    if (item.status === "playing") {
      item.status = "planned";
      changed = true;
    }
  }
  if (changed) await saveToday(today);
}

// Mark the finished item done and start the next one.
async function onEndFile(reason: string): Promise<void> {
  if (replacing || handlingEnd) return;
  if (reason !== "eof") return;
  handlingEnd = true;
  try {
    const today = await loadToday();
    const current = today.items.find((i) => i.status === "playing");
    if (current) {
      current.status = "done";
      await saveToday(today);
      const schedule = await loadSchedule();
      const block = schedule.blocks.find((b) => b.id === current.blockId);
      if (block) {
        if (current.mode === "next-episode") {
          await markEpisodeDone(block.folder, current.path);
        } else {
          await markRandomPlayed(block.folder, current.path);
        }
      }
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
    if (now >= parseHm(block.end)) item.status = "skipped";
  }
  await saveToday(today);

  const currentBlock = dayBlocks.find(
    (b) => parseHm(b.start) <= now && now < parseHm(b.end),
  );
  if (currentBlock) {
    fallbackPath = null;
    const picked = await firstFitting(today, currentBlock, now);
    if (picked) {
      await playItem(picked);
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

// Play a random file from the default folder until the next block.
async function playFallback(folder: string): Promise<void> {
  try {
    const files = await videosIn(folder);
    const progress = await loadProgress();
    const file = randomFile(files, progress.recentRandom[folder] ?? []);
    if (!file) return;
    fallbackPath = file;
    replacing = true;
    await mpv.loadFile(file);
    await markRandomPlayed(folder, file);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    fallbackPath = null;
  } finally {
    replacing = false;
  }
}

// First planned item in the block that still fits the remaining time.
async function firstFitting(
  today: TodayRundown,
  block: ScheduleBlock,
  now: number,
): Promise<RundownItem | null> {
  const remaining = parseHm(block.end) - now;
  let changed = false;
  let picked: RundownItem | null = null;
  for (const item of today.items) {
    if (item.blockId !== block.id) continue;
    if (item.status !== "planned") continue;
    if (!itemFits(item.durationSec, remaining)) {
      item.status = "skipped";
      changed = true;
      continue;
    }
    picked = item;
    break;
  }
  if (changed) await saveToday(today);
  return picked;
}

// Load an item in mpv and mark it playing.
async function playItem(item: RundownItem): Promise<void> {
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
    const again = await loadToday();
    const row = again.items.find((i) => i.id === item.id);
    if (row) row.status = "skipped";
    await saveToday(again);
    replacing = false;
    await playNow();
    return;
  }
  replacing = false;
}

// Cancel the timer waiting for the next block.
function clearWait(): void {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}
