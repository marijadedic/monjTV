// How long a new slot is, and which files do not fit.
import type { ItemMode, Progress, ScheduleBlock, SlotLength, SlotMiss } from "../../shared/types.ts";
import { canonicalPlaylistUrl, parseYoutubeUrl } from "../../shared/youtube.ts";
import { isDir, isVideoFile } from "../files/files.ts";
import { episodePaths, nextEpisode, videosIn } from "../files/picker.ts";
import { loadProgress } from "../schedule/progress.ts";
import { probeYoutube, youtubePlaylistTimed } from "../youtube/youtube.ts";
import { itemFits, maxPlayableSec, nextFrom, tightestSlotSec } from "./item.ts";
import { lengthOf, nameOf, seriesFiles, tryLength } from "./media.ts";

// Length of the file a new slot will play. A random folder uses its longest video.
export async function slotLength(opts: {
  mode: ItemMode;
  folder: string;
  file?: string;
  /** Cap in minutes. A random folder then uses the longest file that still fits. */
  maxMin?: number;
}): Promise<SlotLength | null> {
  if (opts.mode === "specific-file") {
    const youtube = parseYoutubeUrl(opts.file ?? "");
    if (youtube) {
      const meta = await probeYoutube(youtube);
      return {
        title: meta.title,
        path: meta.url,
        durationSec: meta.durationSec,
        kind: "video",
      };
    }
    const file = opts.file?.trim() ?? "";
    if (!file || !(await isVideoFile(file))) return null;
    return {
      title: nameOf(file),
      path: file,
      durationSec: await lengthOf(file),
      kind: "video",
    };
  }

  const folder = opts.folder.trim();
  const playlist = canonicalPlaylistUrl(folder);
  if (playlist) {
    if (opts.mode === "next-episode") {
      const files = await episodePaths(playlist);
      const progress = await loadProgress();
      const file = nextEpisode(files, progress.lastCompleted[playlist]);
      if (!file) return null;
      const meta = await probeYoutube(file);
      return {
        title: meta.title,
        path: meta.url,
        durationSec: meta.durationSec,
        kind: "episode",
      };
    }
    const timed = await youtubePlaylistTimed(playlist);
    return scanTimedPool(timed, opts.maxMin);
  }
  if (!folder || !(await isDir(folder))) return null;
  const files = await videosIn(folder);
  if (files.length === 0) return null;

  if (opts.mode === "next-episode") {
    const progress = await loadProgress();
    const file = nextEpisode(files, progress.lastCompleted[folder]);
    if (!file) return null;
    return {
      title: nameOf(file),
      path: file,
      durationSec: await lengthOf(file),
      kind: "episode",
    };
  }

  return scanRandomPool(files, opts.maxMin);
}

// Longest video in this pool, or the longest that still fits a cap.
async function scanRandomPool(files: string[], maxMin?: number): Promise<SlotLength | null> {
  const timed: { url: string; title: string; durationSec: number }[] = [];
  for (const file of files) {
    const durationSec = await tryLength(file);
    if (durationSec == null) continue;
    timed.push({ url: file, title: nameOf(file), durationSec });
  }
  return scanTimedPool(timed, maxMin);
}

// Longest and shortest from lengths already known, with no extra probe.
function scanTimedPool(
  timed: readonly { url: string; title: string; durationSec: number }[],
  maxMin?: number,
): SlotLength | null {
  const remaining = maxMin && maxMin > 0 ? maxMin * 60 : null;
  if (timed.length === 0) return null;
  let longest: { url: string; title: string; durationSec: number } | null = null;
  let shortest: { url: string; title: string; durationSec: number } | null = null;
  for (const video of timed) {
    if (remaining != null && !itemFits(video.durationSec, remaining)) continue;
    if (!longest || video.durationSec > longest.durationSec) longest = video;
    if (!shortest || video.durationSec < shortest.durationSec) shortest = video;
  }
  if (!longest || !shortest) return null;
  return {
    title: longest.title,
    path: longest.url,
    durationSec: longest.durationSec,
    kind: "random",
    fileCount: timed.length,
    shortest: {
      title: shortest.title,
      path: shortest.url,
      durationSec: shortest.durationSec,
    },
  };
}

// How many videos a folder holds, without timing them.
export async function videoCount(folder: string): Promise<number> {
  const trimmed = folder.trim();
  if (canonicalPlaylistUrl(trimmed)) {
    try {
      return (await episodePaths(trimmed)).length;
    } catch {
      return 0;
    }
  }
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
      const miss = await missForRandomFolder(
        block.id,
        canonicalPlaylistUrl(entry.folder) ?? entry.folder,
        entry.lengthMin * 60,
      );
      if (miss) return miss;
    }
    return null;
  }

  const slotSec = tightestSlotSec(block);
  const limitSec = maxPlayableSec(slotSec);
  if (block.mode === "specific-file") {
    const youtube = parseYoutubeUrl(block.file ?? "");
    if (youtube) {
      try {
        const meta = await probeYoutube(youtube);
        if (itemFits(meta.durationSec, slotSec)) return null;
        return {
          blockId: block.id,
          kind: "video",
          title: meta.title,
          durationSec: meta.durationSec,
          limitSec,
        };
      } catch {
        return null;
      }
    }
    const file = block.file;
    if (!file || !(await isVideoFile(file))) return null;
    const durationSec = await lengthOf(file);
    if (itemFits(durationSec, slotSec)) return null;
    return { blockId: block.id, kind: "video", title: nameOf(file), durationSec, limitSec };
  }

  const series = canonicalPlaylistUrl(block.folder) ?? block.folder;
  const files = await seriesFiles(series);
  if (files.length === 0) return null;
  if (block.mode === "next-episode") {
    const file = nextFrom(files, progress.lastCompleted[series]);
    if (!file) return null;
    const durationSec = await lengthOf(file);
    if (itemFits(durationSec, slotSec)) return null;
    return { blockId: block.id, kind: "episode", title: nameOf(file), durationSec, limitSec };
  }

  return missForRandomFolder(block.id, series, slotSec);
}

// True when every file in a random folder is too long for this window.
async function missForRandomFolder(blockId: string, folder: string, slotSec: number): Promise<SlotMiss | null> {
  const playlist = canonicalPlaylistUrl(folder);
  const timed: { url: string; title: string; durationSec: number }[] = playlist
    ? await youtubePlaylistTimed(playlist)
    : [];
  if (!playlist) {
    for (const file of await seriesFiles(folder)) {
      const durationSec = await tryLength(file);
      if (durationSec == null) continue;
      timed.push({ url: file, title: nameOf(file), durationSec });
    }
  }
  if (timed.length === 0) return null;

  const limitSec = maxPlayableSec(slotSec);
  let shortest: { title: string; durationSec: number } | null = null;
  for (const video of timed) {
    if (itemFits(video.durationSec, slotSec)) return null;
    if (!shortest || video.durationSec < shortest.durationSec) {
      shortest = { title: video.title, durationSec: video.durationSec };
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
