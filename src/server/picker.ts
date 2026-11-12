import { randomInt } from "node:crypto";
import type { ItemMode } from "../shared/types.ts";
import { canonicalPlaylistUrl, parseYoutubePlaylist, parseYoutubeUrl } from "../shared/youtube.ts";
import { isVideoFile, listVideos } from "./files.ts";
import { loadProgress, rememberRandom } from "./progress.ts";
import { loadYoutubePlaylist } from "./youtube.ts";

// Sorted video paths in a folder.
export async function videosIn(folder: string): Promise<string[]> {
  return listVideos(folder);
}

// Episode order for a folder, or the videos in a YouTube playlist.
export async function episodePaths(folder: string): Promise<string[]> {
  if (!parseYoutubePlaylist(folder)) return videosIn(folder);
  const playlist = await loadYoutubePlaylist(folder);
  return playlist.videos.map((video) => video.url);
}

// File after the last completed one, wrapping to the start.
export function nextEpisode(files: string[], lastCompleted?: string): string | null {
  if (files.length === 0) return null;
  if (!lastCompleted) return files[0]!;
  const idx = files.indexOf(lastCompleted);
  if (idx === -1) return files[0]!;
  return files[(idx + 1) % files.length]!;
}

// Plays remembered under other folders, so the same file is not chosen from two places.
export function otherFolderPlays(recentRandom: Record<string, string[]>, folder: string): string[] {
  const held: string[] = [];
  for (const [key, paths] of Object.entries(recentRandom)) {
    if (key === folder) continue;
    held.push(...paths);
  }
  return held;
}

// One file from this pass. Unplayed files come first, then a new pass that leaves out the newest.
export function takeRandom(
  files: string[],
  recent: string[],
  opts?: { avoid?: string[]; block?: string[]; all?: readonly string[] },
): { path: string; recent: string[] } | null {
  const universe = opts?.all && opts.all.length > 0 ? opts.all : files;
  if (files.length === 0) return null;
  const liveRecent = recent.filter((file) => universe.includes(file));
  const seen = new Set(liveRecent);
  const avoided = new Set(opts?.avoid ?? []);
  const blocked = new Set(opts?.block ?? []);
  const open = (file: string) => !blocked.has(file);
  const picked = (pool: string[]) => {
    const path = pool[randomInt(pool.length)]!;
    return { path, recent: rememberRandom(liveRecent, path, universe) };
  };

  const fresh = files.filter((file) => open(file) && !seen.has(file) && !avoided.has(file));
  if (fresh.length > 0) return picked(fresh);

  const unseen = files.filter((file) => open(file) && !seen.has(file));
  if (unseen.length > 0) return picked(unseen);

  const reusable = files.filter((file) => open(file));
  if (reusable.length === 0) return null;
  const newest = liveRecent.find((file) => reusable.includes(file));
  const withoutNewest = newest ? reusable.filter((file) => file !== newest) : reusable;
  const spread = withoutNewest.filter((file) => !avoided.has(file));
  const pool = spread.length > 0 ? spread : withoutNewest.length > 0 ? withoutNewest : reusable;
  return picked(pool);
}

// Next episode, a random file, or the chosen video, based on the block mode.
export async function pick(opts: {
  folder: string;
  mode: ItemMode;
  file?: string;
  exclude?: string[];
  lastCompletedOverride?: string;
}): Promise<string | null> {
  if (opts.mode === "specific-file") {
    const youtube = parseYoutubeUrl(opts.file ?? "");
    if (youtube) return youtube;
    if (!opts.file || !(await isVideoFile(opts.file))) return null;
    return opts.file;
  }
  if (opts.mode === "next-episode") {
    const files = await episodePaths(opts.folder);
    const progress = await loadProgress();
    const series = canonicalPlaylistUrl(opts.folder) ?? opts.folder;
    const last = opts.lastCompletedOverride ?? progress.lastCompleted[series];
    return nextEpisode(files, last);
  }
  const files = await episodePaths(opts.folder);
  const series = canonicalPlaylistUrl(opts.folder) ?? opts.folder;
  const progress = await loadProgress();
  const recent = progress.recentRandom[series] ?? [];
  return takeRandom(files, recent, {
    avoid: otherFolderPlays(progress.recentRandom, series),
    block: opts.exclude,
  })?.path ?? null;
}
