import path from "node:path";
import { RECENT_RANDOM_LIMIT } from "../shared/constants.ts";
import type { Progress, RecentPlays, ScheduleBlock } from "../shared/types.ts";
import { foldersOf } from "./schedule.ts";
import { titleFromPath } from "./files.ts";
import { progressPath } from "./paths.ts";
import { readJson, writeJson } from "./store.ts";

const empty: Progress = { lastCompleted: {}, recentRandom: {} };

// Read playback progress from disk.
export async function loadProgress(): Promise<Progress> {
  const data = await readJson<Progress>(progressPath, empty);
  return {
    lastCompleted: data.lastCompleted ?? {},
    recentRandom: data.recentRandom ?? {},
  };
}

// Write playback progress to disk.
export async function saveProgress(progress: Progress): Promise<void> {
  await writeJson(progressPath, progress);
}

// Remember the last finished episode in a folder.
export async function markEpisodeDone(folder: string, filePath: string): Promise<void> {
  const progress = await loadProgress();
  progress.lastCompleted[folder] = filePath;
  await saveProgress(progress);
}

// Drop episode and random history for folders no block uses anymore.
export async function forgetUnusedFolders(
  before: ScheduleBlock[],
  after: ScheduleBlock[],
): Promise<void> {
  const used = new Set(after.flatMap(foldersOf));
  const drop = [...new Set(before.flatMap(foldersOf))].filter(
    (folder) => folder.length > 0 && !used.has(folder),
  );
  if (drop.length === 0) return;
  const progress = await loadProgress();
  let changed = false;
  for (const folder of drop) {
    if (folder in progress.lastCompleted) {
      delete progress.lastCompleted[folder];
      changed = true;
    }
    if (folder in progress.recentRandom) {
      delete progress.recentRandom[folder];
      changed = true;
    }
  }
  if (changed) await saveProgress(progress);
}

// Record a random play and keep only the recent list.
export async function markRandomPlayed(folder: string, filePath: string): Promise<void> {
  const progress = await loadProgress();
  const prev = progress.recentRandom[folder] ?? [];
  progress.recentRandom[folder] = [
    filePath,
    ...prev.filter((p) => p !== filePath),
  ].slice(0, RECENT_RANDOM_LIMIT);
  await saveProgress(progress);
}

// Recently played random files, grouped by folder. Newest file is first.
export async function recentPlays(): Promise<RecentPlays> {
  return presentRecent(await loadProgress());
}

// Drop one file from a folder's recent list so a random slot can pick it again.
export async function forgetRandomPlayed(folder: string, filePath: string): Promise<RecentPlays> {
  const progress = await loadProgress();
  const prev = progress.recentRandom[folder];
  if (prev?.includes(filePath)) {
    const next = prev.filter((entry) => entry !== filePath);
    if (next.length === 0) delete progress.recentRandom[folder];
    else progress.recentRandom[folder] = next;
    await saveProgress(progress);
  }
  return presentRecent(progress);
}

// Shape the saved skip lists for the options window.
function presentRecent(progress: Progress): RecentPlays {
  const entries = Object.entries(progress.recentRandom).filter(([, files]) => files.length > 0);
  const names = entries.map(([folder]) => path.basename(folder) || folder);
  const folders = entries
    .map(([folder, files], index) => {
      const name = names[index] ?? folder;
      const shared = names.filter((item) => item === name).length > 1;
      return {
        folder,
        name: shared ? folder : name,
        videos: files.map((filePath) => {
          const place = path.dirname(path.relative(folder, filePath));
          return {
            path: filePath,
            title: titleFromPath(filePath),
            place: place === "." ? "" : place,
          };
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  return { folders };
}
