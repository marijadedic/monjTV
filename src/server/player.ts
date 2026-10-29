import type { IntermissionItem, PlayerStatus, RundownItem, TodayRundown } from "../shared/types.ts";
import { formatHm, msUntil, nowSec, parseHm, weekday } from "./clock.ts";
import { titleFromPath } from "./files.ts";
import { Mpv } from "./mpv.ts";
import { pick } from "./picker.ts";
import { markEpisodeDone, markRandomPlayed } from "./progress.ts";
import { ensureToday, joinOffset, loadToday, onAirItem, saveToday } from "./rundown.ts";
import { DAY_SECONDS, windowOn } from "../shared/window.ts";
import {
  isYoutubeUrl,
  parseYoutubePlaylist,
  parseYoutubeUrl,
  playlistStartIndex,
  youtubeLabel,
  type YoutubePlaylistRef,
} from "../shared/youtube.ts";
import { blocksForDay, loadSchedule, playingIntermission } from "./schedule.ts";
import { cachedYoutubeTitle, loadYoutubePlaylist } from "./youtube.ts";

const mpv = new Mpv();
let waitingUntil: string | null = null;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let lastError: string | null = null;
let handlingEnd = false;
let replacing = false;
let stopping = false;
type PlaylistCursor = {
  source: string;
  videos: string[];
  index: number;
  fails: number;
};

type FallbackPlay = {
  kind: IntermissionItem["kind"];
  folder: string;
  path: string;
  playlist?: PlaylistCursor;
  /** Path is the next video to load, not the one already on screen. */
  queued?: boolean;
};

let fallbackPlay: FallbackPlay | null = null;
let playlistFetch = 0;
let fallbackRetry: ReturnType<typeof setTimeout> | null = null;
let playEpoch = 0;
let provisionalSkips: string[] = [];

mpv.onEndFile = (reason) => {
  void onEndFile(reason);
};
mpv.onExit = () => {
  if (stopping) return;
  waitingUntil = null;
  fallbackPlay = null;
  clearWait();
  clearFallbackRetry();
  void releaseQuit();
};

// Current player state for the API.
export async function getStatus(): Promise<PlayerStatus> {
  const today = await loadToday();
  const current = today.items.find((i) => i.status === "playing");
  let willStartItemId: string | null = null;
  if (!current && !fallbackPlay) willStartItemId = onAirItem(today.items, nowSec())?.id ?? null;
  return {
    running: mpv.running,
    waitingUntil,
    error: lastError,
    currentItemId: current?.id ?? null,
    willStartItemId,
    fallbackTitle: current || !fallbackPlay ? null : fallbackTitleOf(fallbackPlay.path),
    fallbackPath: current || !fallbackPlay || isYoutubeUrl(fallbackPlay.path) ? null : fallbackPlay.path,
  };
}

// Local file filling a gap, if one is on screen.
export function intermissionFile(): string | null {
  if (!fallbackPlay || isYoutubeUrl(fallbackPlay.path)) return null;
  return fallbackPlay.path;
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
  playEpoch += 1;
  clearWait();
  clearFallbackRetry();
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
  if (reason !== "eof") {
    if (fallbackPlay?.playlist && reason === "error") {
      if (!queuePlaylist(fallbackPlay, true)) {
        lastError = "Could not play this YouTube playlist";
        retryYoutubeIntermission(20_000);
        return;
      }
      handlingEnd = true;
      try {
        await playNow();
      } finally {
        handlingEnd = false;
      }
      return;
    }
    if (fallbackPlay?.kind === "youtube" && reason !== "quit") {
      if (fallbackPlay.playlist) {
        fallbackPlay = { ...fallbackPlay, queued: true };
        scheduleIntermission(2000);
        return;
      }
      retryYoutubeIntermission();
    }
    return;
  }
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
      if (finishedIntermission.kind === "folder") {
        await markEpisodeDone(finishedIntermission.folder, finishedIntermission.path);
      }
      if (finishedIntermission.playlist) {
        if (!queuePlaylist(finishedIntermission, false)) fallbackPlay = null;
      } else {
        fallbackPlay = null;
      }
    }
    await playNow();
  } finally {
    handlingEnd = false;
  }
}

// Join the file the clock is inside, or wait for the next one.
async function playNow(): Promise<void> {
  clearWait();
  waitingUntil = null;
  const today = await ensureToday();
  const schedule = await loadSchedule();
  const day = weekday();
  const dayBlocks = blocksForDay(schedule, day);
  const now = nowSec();
  const air = onAirItem(today.items, now);

  let changed = false;
  for (const item of today.items) {
    if (item.status !== "planned" || item.id === air?.id) continue;
    if (!hasStarted(item, now)) continue;
    item.status = "skipped";
    provisionalSkips.push(item.id);
    changed = true;
  }
  if (changed) await saveToday(today);

  if (air) {
    const offset = joinOffset(air, nowSec());
    if (offset < air.durationSec) {
      await playItem(air, offset);
      return;
    }
  }

  const wake = nextPlannedStart(today, now);
  if (wake != null) {
    armWaitUntil(wake);
  } else {
    const next = dayBlocks.find((block) => parseHm(windowOn(block, day).start) > now);
    if (next) armWaitUntil(parseHm(windowOn(next, day).start));
  }
  await playActiveIntermission();
}

// Start the selected intermission, or stop it when nothing is selected.
async function playActiveIntermission(): Promise<void> {
  const item = playingIntermission(await loadSchedule());
  if (!item) {
    await stopIntermission();
    return;
  }
  await playFallback(item);
}

// Switch the gap filler when the selection changes. A scheduled show keeps the screen.
export async function syncIntermission(): Promise<void> {
  if (stopping || !mpv.running) return;
  const today = await loadToday();
  if (today.items.some((item) => item.status === "playing")) return;
  await playActiveIntermission();
}

// Cut off an intermission file so the scheduled block has the screen.
async function stopIntermission(): Promise<void> {
  clearFallbackRetry();
  playEpoch += 1;
  if (!fallbackPlay) return;
  fallbackPlay = null;
  replacing = true;
  try {
    await mpv.stopPlayback();
  } finally {
    replacing = false;
  }
}

// Play the selected YouTube video or playlist, a video file, or the next episode from a folder.
async function playFallback(item: IntermissionItem): Promise<void> {
  if (item.kind === "youtube") {
    await playYoutubeIntermission(item.source);
    return;
  }
  try {
    const file =
      item.kind === "video"
        ? await pick({ folder: "", mode: "specific-file", file: item.source })
        : await pick({ folder: item.source, mode: "next-episode" });
    if (!file) {
      lastError = item.kind === "video" ? `Video does not exist: ${item.source}` : null;
      if (fallbackPlay) {
        fallbackPlay = null;
        replacing = true;
        await mpv.stopPlayback();
      }
      return;
    }
    if (fallbackPlay?.path === file && fallbackPlay.kind === item.kind) return;
    const epoch = ++playEpoch;
    fallbackPlay = { kind: item.kind, folder: item.kind === "folder" ? item.source : file, path: file };
    replacing = true;
    await mpv.loadFile(file);
    if (epoch !== playEpoch) await restoreCurrentLoad();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    fallbackPlay = null;
  } finally {
    replacing = false;
  }
}

async function restoreCurrentLoad(): Promise<void> {
  if (stopping || !mpv.running) return;
  const epoch = playEpoch;
  const today = await loadToday();
  const current = today.items.find((i) => i.status === "playing");
  if (current) {
    const offset = joinOffset(current, nowSec());
    if (offset < current.durationSec) await mpv.loadFile(current.path, offset);
    return;
  }
  if (fallbackPlay && epoch === playEpoch) {
    await mpv.loadFile(fallbackPlay.path);
    return;
  }
  if (epoch === playEpoch) await mpv.stopPlayback().catch(() => undefined);
}

// One video loops. A playlist walks the list, then starts again at the beginning.
async function playYoutubeIntermission(source: string): Promise<void> {
  const playlist = parseYoutubePlaylist(source);
  if (playlist) {
    await playYoutubePlaylist(source, playlist);
    return;
  }
  const url = parseYoutubeUrl(source);
  if (!url) return;
  if (fallbackPlay?.path === url && fallbackPlay.folder === url && !fallbackPlay.queued) return;
  const epoch = ++playEpoch;
  try {
    fallbackPlay = { kind: "youtube", folder: url, path: url };
    replacing = true;
    await mpv.loadFile(url);
    if (epoch !== playEpoch) await restoreCurrentLoad();
  } catch (err) {
    if (epoch !== playEpoch) return;
    lastError = err instanceof Error ? err.message : String(err);
    fallbackPlay = null;
  } finally {
    replacing = false;
  }
}

async function playYoutubePlaylist(source: string, ref: YoutubePlaylistRef): Promise<void> {
  const same =
    fallbackPlay?.kind === "youtube" &&
    fallbackPlay.folder === source &&
    fallbackPlay.playlist?.source === source &&
    fallbackPlay.playlist.videos.length > 0;
  let videos = same ? fallbackPlay!.playlist!.videos : [];
  let index = same ? fallbackPlay!.playlist!.index : 0;
  let fails = same ? fallbackPlay!.playlist!.fails : 0;

  if (!videos.length) {
    const epoch = playEpoch;
    const token = ++playlistFetch;
    try {
      const loaded = await loadYoutubePlaylist(ref.url);
      if (token !== playlistFetch || epoch !== playEpoch || stopping) return;
      videos = loaded.videos.map((video) => video.url);
      index = playlistStartIndex(
        loaded.videos.map((video) => video.id),
        ref,
      );
      fails = 0;
    } catch (err) {
      if (token !== playlistFetch || epoch !== playEpoch || stopping) return;
      lastError = err instanceof Error ? err.message : String(err);
      fallbackPlay = null;
      return;
    }
  }

  if (!videos.length) {
    lastError = "This YouTube playlist has no videos";
    fallbackPlay = null;
    return;
  }
  index %= videos.length;
  const url = videos[index]!;
  if (fallbackPlay?.folder === source && fallbackPlay.path === url && !fallbackPlay.queued) return;

  const epoch = ++playEpoch;
  fallbackPlay = {
    kind: "youtube",
    folder: source,
    path: url,
    queued: true,
    playlist: { source, videos, index, fails },
  };
  try {
    replacing = true;
    await mpv.loadFile(url);
    if (epoch !== playEpoch) {
      await restoreCurrentLoad();
      return;
    }
    if (fallbackPlay?.folder === source) fallbackPlay.queued = false;
    lastError = null;
  } catch (err) {
    if (epoch !== playEpoch) return;
    lastError = err instanceof Error ? err.message : String(err);
    if (!fallbackPlay?.playlist || !queuePlaylist(fallbackPlay, true)) {
      lastError = "Could not play this YouTube playlist";
      retryYoutubeIntermission(20_000);
      return;
    }
    scheduleIntermission(1500);
  } finally {
    replacing = false;
  }
}

// Move to the next playlist video. A run of failures stops instead of spinning.
function queuePlaylist(play: FallbackPlay, failed: boolean): boolean {
  const list = play.playlist;
  if (!list || list.videos.length === 0) return false;
  const fails = failed ? list.fails + 1 : 0;
  if (failed && fails >= list.videos.length) {
    fallbackPlay = null;
    return false;
  }
  const index = (list.index + 1) % list.videos.length;
  const path = list.videos[index];
  if (!path) return false;
  fallbackPlay = {
    kind: "youtube",
    folder: list.source,
    path,
    queued: true,
    playlist: { ...list, index, fails },
  };
  return true;
}

function retryYoutubeIntermission(delayMs = 2000): void {
  clearFallbackRetry();
  fallbackPlay = null;
  scheduleIntermission(delayMs);
}

function scheduleIntermission(delayMs: number): void {
  clearFallbackRetry();
  fallbackRetry = setTimeout(() => {
    fallbackRetry = null;
    if (stopping || !mpv.running) return;
    void playActiveIntermission();
  }, delayMs);
}

function clearFallbackRetry(): void {
  if (!fallbackRetry) return;
  clearTimeout(fallbackRetry);
  fallbackRetry = null;
}

function fallbackTitleOf(filePath: string): string {
  if (!isYoutubeUrl(filePath)) return titleFromPath(filePath);
  return cachedYoutubeTitle(filePath) ?? youtubeLabel(filePath);
}

function hasStarted(item: RundownItem, now: number): boolean {
  const start = parseHm(item.start);
  if (item.overnight) {
    if (start + item.durationSec > DAY_SECONDS) return true;
    return now >= start;
  }
  return now >= start;
}

// Clock time of the next planned file that has not started.
function nextPlannedStart(today: TodayRundown, now: number): number | null {
  let wake: number | null = null;
  for (const item of today.items) {
    if (item.status !== "planned") continue;
    const start = parseHm(item.start);
    if (item.overnight && start + item.durationSec > DAY_SECONDS) continue;
    if (start <= now) continue;
    if (wake == null || start < wake) wake = start;
  }
  return wake;
}

// Start the episode that replaced the one on screen, from the beginning.
export async function replayItem(itemId: string): Promise<void> {
  if (stopping || !mpv.running) return;
  const today = await loadToday();
  const item = today.items.find((row) => row.id === itemId);
  if (!item || item.status !== "playing") return;
  await playItem(item, 0);
}

// Load an item in mpv at the clock offset and mark it playing.
async function playItem(item: RundownItem, offsetSec: number): Promise<void> {
  clearFallbackRetry();
  fallbackPlay = null;
  const epoch = ++playEpoch;
  const today = await loadToday();
  for (const row of today.items) {
    if (row.id === item.id) row.status = "playing";
    else if (row.status === "playing") row.status = "planned";
  }
  await saveToday(today);
  replacing = true;
  try {
    await mpv.loadFile(item.path, offsetSec);
    if (epoch !== playEpoch) await restoreCurrentLoad();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    replacing = false;
    if (epoch !== playEpoch) return;
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

// Wake at a clock time inside the current block, such as the next episode.
function armWaitUntil(atSec: number): void {
  if (atSec <= nowSec()) return;
  waitingUntil = formatHm(atSec);
  waitTimer = setTimeout(() => {
    void playNow();
  }, msUntil(atSec));
}

// Cancel the timer waiting for the next block.
function clearWait(): void {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}
