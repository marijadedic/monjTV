import path from "node:path";
import type { Progress, RecentPlays, ScheduleBlock } from "../shared/types.ts";
import { canonicalPlaylistUrl, isYoutubeUrl, youtubeLabel } from "../shared/youtube.ts";
import { foldersOf } from "./schedule.ts";
import { titleFromPath, listVideos } from "./files.ts";
import { progressPath } from "./paths.ts";
import { readJson, writeJson } from "./store.ts";
import { cachedYoutubeTitle, loadYoutubePlaylist } from "./youtube.ts";

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

// Move a pick to the front of this folder's pass.
export function noteRandom(recent: string[], file: string): string[] {
  return [file, ...recent.filter((entry) => entry !== file)];
}

// Remember a play. A finished pass keeps every file, and the next play opens a new pass.
export function rememberRandom(recent: string[], file: string, files: readonly string[]): string[] {
  const live = new Set(files);
  const previous = new Set(recent.filter((entry) => live.size === 0 || live.has(entry)));
  if (live.size > 0 && files.every((entry) => previous.has(entry))) return [file];
  const kept = recent.filter((entry) => entry !== file && (live.size === 0 || live.has(entry)));
  return [file, ...kept];
}

// Record a random play through the whole folder before anything in it repeats.
export async function markRandomPlayed(folder: string, filePath: string): Promise<void> {
  const progress = await loadProgress();
  const files = await filesForProgress(folder);
  const prev = progress.recentRandom[folder] ?? [];
  progress.recentRandom[folder] = files.includes(filePath)
    ? rememberRandom(prev, filePath, files)
    : noteRandom(prev, filePath);
  await saveProgress(progress);
}

// Videos in this folder, or in this YouTube playlist. An unread playlist is empty.
async function filesForProgress(folder: string): Promise<string[]> {
  if (canonicalPlaylistUrl(folder)) {
    try {
      const playlist = await loadYoutubePlaylist(folder);
      return playlist.videos.map((video) => video.url);
    } catch {
      return [];
    }
  }
  return listVideos(folder);
}

// Recently played random files, grouped by folder. Newest file is first.
export async function recentPlays(): Promise<RecentPlays> {
  return presentRecent(await loadProgress());
}

// Drop this file from every recently played list.
export async function forgetRandomPath(filePath: string): Promise<RecentPlays> {
  const progress = await loadProgress();
  let changed = false;
  for (const [folder, files] of Object.entries(progress.recentRandom)) {
    if (!files.includes(filePath)) continue;
    const next = files.filter((entry) => entry !== filePath);
    if (next.length === 0) delete progress.recentRandom[folder];
    else progress.recentRandom[folder] = next;
    changed = true;
  }
  if (changed) await saveProgress(progress);
  return presentRecent(progress);
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
  const names = entries.map(([folder]) => recentFolderName(folder));
  const folders = entries
    .map(([folder, files], index) => {
      const name = names[index] ?? folder;
      const shared = names.filter((item) => item === name).length > 1;
      return {
        folder,
        name: shared ? folder : name,
        videos: files.map((filePath) => {
          if (isYoutubeUrl(filePath)) {
            return {
              path: filePath,
              title: cachedYoutubeTitle(filePath) ?? youtubeLabel(filePath),
              place: "",
            };
          }
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

// Playlist title, or the last part of a local folder path.
function recentFolderName(folder: string): string {
  if (canonicalPlaylistUrl(folder)) return cachedYoutubeTitle(folder) ?? youtubeLabel(folder);
  return path.basename(folder) || folder;
}
