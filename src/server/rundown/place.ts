// Choose the file a slot plays.
import type { PlaylistEntry, Progress, RundownItem, ScheduleBlock } from "../../shared/types.ts";
import { canonicalPlaylistUrl, parseYoutubeUrl } from "../../shared/youtube.ts";
import { formatHm } from "../clock/clock.ts";
import { isVideoFile } from "../files/files.ts";
import { otherFolderPlays, takeRandom } from "../files/picker.ts";
import { noteRandom } from "../schedule/progress.ts";
import { probeYoutube } from "../youtube/youtube.ts";
import { itemFits, makeItem, nextFrom } from "./item.ts";
import { lengthOf, nameOf, seriesFiles, tryLength } from "./media.ts";
import { cloneProgress } from "./picks.ts";

// Pull the saved row for this stacked video, if this day already had it.
function takeKeptEntry(unused: RundownItem[], entry: PlaylistEntry): RundownItem | undefined {
  const byId = unused.findIndex((item) => item.entryId === entry.id);
  if (byId >= 0) return unused.splice(byId, 1)[0];
  const byShape = unused.findIndex((item) => {
    if (item.entryId) return false;
    const itemMode = (item.mode as string) === "youtube" ? "specific-file" : item.mode;
    if (itemMode !== entry.mode) return false;
    if (entry.mode === "specific-file") {
      const url = parseYoutubeUrl(entry.file ?? "");
      return item.path === (url ?? (entry.file ?? "").trim());
    }
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

  const files = await seriesFiles(canonicalPlaylistUrl(entry.folder) ?? entry.folder);
  if (!files.includes(item.path)) return false;

  const durationSec = item.durationSec > 0 ? item.durationSec : await lengthOf(item.path);
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
  reserved: readonly string[] = [],
): Promise<{ path: string; durationSec: number; title: string } | null> {
  if (entry.mode === "specific-file") {
    const youtube = parseYoutubeUrl(entry.file ?? "");
    if (youtube) {
      try {
        const meta = await probeYoutube(youtube);
        return { path: meta.url, durationSec: meta.durationSec, title: meta.title };
      } catch {
        return null;
      }
    }
    const file = entry.file;
    if (!file || !(await isVideoFile(file))) return null;

    return { path: file, durationSec: await lengthOf(file), title: nameOf(file) };
  }

  if (entry.mode === "next-episode") {
    const series = canonicalPlaylistUrl(entry.folder) ?? entry.folder;
    const episodes = await seriesFiles(series);
    const file = nextFrom(episodes, progress.lastCompleted[series]);
    if (!file) return null;

    const durationSec = await lengthOf(file);
    return { path: file, durationSec, title: nameOf(file) };
  }

  const series = canonicalPlaylistUrl(entry.folder) ?? entry.folder;
  const files = await seriesFiles(series);
  if (files.length === 0) return null;

  const recent = progress.recentRandom[series] ?? [];
  const remaining = entry.lengthMin ? entry.lengthMin * 60 : null;
  const passed = new Set<string>();

  while (true) {
    const pool = files.filter((candidate) => !passed.has(candidate) && !used.includes(candidate));
    if (pool.length === 0) return null;

    const choice = takeRandom(pool, recent, {
      avoid: [...otherFolderPlays(progress.recentRandom, series), ...reserved],
      block: used,
      all: files,
    });
    if (!choice) return null;

    const durationSec = await tryLength(choice.path);
    if (durationSec != null && (remaining == null || itemFits(durationSec, remaining))) {
      progress.recentRandom[series] = choice.recent;
      return { path: choice.path, durationSec, title: nameOf(choice.path) };
    }

    passed.add(choice.path);
  }
}

// One file per stacked entry, with optional pauses between them.
async function itemsForPlaylist(
  block: ScheduleBlock,
  cursorStart: number,
  progress: Progress,
  kept: RundownItem[] = [],
  reserved: readonly string[] = [],
): Promise<RundownItem[]> {
  const items: RundownItem[] = [];
  const shadow = cloneProgress(progress);
  const usedByFolder = new Map<string, string[]>();
  const unused = kept.slice();
  const pickedList: {
    entry: PlaylistEntry;
    prev: RundownItem | undefined;
    picked: { path: string; durationSec: number; title: string };
  }[] = [];
  for (const entry of block.items ?? []) {
    const used = usedByFolder.get(entry.folder) ?? [];
    const prev = takeKeptEntry(unused, entry);
    let picked: { path: string; durationSec: number; title: string } | null = null;

    if (entry.mode === "random-file" && prev && (await randomPickStillValid(entry, prev, used))) {
      picked = { path: prev.path, durationSec: prev.durationSec, title: prev.title };
    } else if (entry.mode === "next-episode" && prev?.chosen) {
      picked = { path: prev.path, durationSec: prev.durationSec, title: prev.title };
    } else {
      picked = await pickEntry(entry, shadow, used, reserved);
    }
    if (!picked) continue;

    pickedList.push({ entry, prev, picked });
    if (entry.folder) {
      usedByFolder.set(entry.folder, [...used, picked.path]);
      if (entry.mode === "next-episode") shadow.lastCompleted[entry.folder] = picked.path;
      else if (entry.mode === "random-file") {
        const recent = shadow.recentRandom[entry.folder] ?? [];
        shadow.recentRandom[entry.folder] = noteRandom(recent, picked.path);
      }
    }
  }

  let cursor = cursorStart;
  for (let i = 0; i < pickedList.length; i++) {
    const { entry, prev, picked } = pickedList[i]!;
    items.push(placePlaylistItem(block, entry, prev, picked, cursor));
    cursor += picked.durationSec;

    if (i < pickedList.length - 1) {
      const gap = entry.gapAfterMin ?? 0;
      if (gap > 0) cursor += gap * 60;
    }
  }
  return items;
}

// Files that fit this slot, from its start until the block ends.
export async function itemsForWindow(
  block: ScheduleBlock,
  cursorStart: number,
  blockEnd: number,
  progress: Progress,
  kept: RundownItem[] = [],
  reserved: readonly string[] = [],
): Promise<RundownItem[]> {
  if (block.mode === "playlist") {
    return itemsForPlaylist(block, cursorStart, progress, kept, reserved);
  }

  const items: RundownItem[] = [];

  if (block.mode === "specific-file") {
    const youtube = parseYoutubeUrl(block.file ?? "");
    if (youtube) {
      try {
        const meta = await probeYoutube(youtube);
        if (!itemFits(meta.durationSec, blockEnd - cursorStart)) return items;

        items.push(makeItem(block, meta.url, cursorStart, meta.durationSec, { title: meta.title }));
      } catch {
        return items;
      }
      return items;
    }

    const file = block.file;
    if (!file || !(await isVideoFile(file))) return items;

    const durationSec = await lengthOf(file);
    if (!itemFits(durationSec, blockEnd - cursorStart)) return items;

    items.push(makeItem(block, file, cursorStart, durationSec));
    return items;
  }

  const series = canonicalPlaylistUrl(block.folder) ?? block.folder;
  const files = await seriesFiles(series);
  if (files.length === 0) return items;
  const used: string[] = [];
  const passed = new Set<string>();
  let lastCompleted = progress.lastCompleted[series];
  let cursor = cursorStart;

  while (true) {
    const remaining = blockEnd - cursor;
    if (remaining <= 0) break;

    let picked: string | null = null;
    let durationSec = 0;
    if (block.mode === "next-episode") {
      const file = nextFrom(files, lastCompleted);
      if (!file) break;

      durationSec = await lengthOf(file);
      if (!itemFits(durationSec, remaining)) break;

      picked = file;
    } else {
      const recent = progress.recentRandom[series] ?? [];
      const pool = files.filter((candidate) => !passed.has(candidate) && !used.includes(candidate));
      if (pool.length === 0) break;

      const choice = takeRandom(pool, recent, {
        avoid: [...otherFolderPlays(progress.recentRandom, series), ...reserved],
        block: used,
        all: files,
      });
      if (!choice) break;

      const timed = await tryLength(choice.path);
      if (timed == null || !itemFits(timed, remaining)) {
        passed.add(choice.path);
        continue;
      }

      durationSec = timed;
      picked = choice.path;
      progress.recentRandom[series] = choice.recent;
    }

    if (!picked) break;

    items.push(makeItem(block, picked, cursor, durationSec));
    used.push(picked);
    if (block.mode === "next-episode") lastCompleted = picked;

    cursor += durationSec;
  }

  return items;
}
