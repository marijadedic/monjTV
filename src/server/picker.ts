import type { BlockMode } from "../shared/types.ts";
import { isVideoFile, listVideos } from "./files.ts";
import { loadProgress } from "./progress.ts";

// Sorted video paths in a folder.
export async function videosIn(folder: string): Promise<string[]> {
  return listVideos(folder);
}

// File after the last completed one, wrapping to the start.
export function nextEpisode(files: string[], lastCompleted?: string): string | null {
  if (files.length === 0) return null;
  if (!lastCompleted) return files[0]!;
  const idx = files.indexOf(lastCompleted);
  if (idx === -1) return files[0]!;
  return files[(idx + 1) % files.length]!;
}

// A random file, preferring ones not in the exclude list.
export function randomFile(files: string[], exclude: string[]): string | null {
  const pool = files.filter((f) => !exclude.includes(f));
  const source = pool.length > 0 ? pool : files;
  if (source.length === 0) return null;
  return source[Math.floor(Math.random() * source.length)]!;
}

// Next episode, a random file, or the chosen video, based on the block mode.
export async function pick(opts: {
  folder: string;
  mode: BlockMode;
  file?: string;
  exclude?: string[];
  lastCompletedOverride?: string;
}): Promise<string | null> {
  if (opts.mode === "youtube") {
    return opts.file?.trim() || null;
  }
  if (opts.mode === "specific-file") {
    if (!opts.file || !(await isVideoFile(opts.file))) return null;
    return opts.file;
  }
  const files = await videosIn(opts.folder);
  if (opts.mode === "next-episode") {
    const progress = await loadProgress();
    const last =
      opts.lastCompletedOverride ?? progress.lastCompleted[opts.folder];
    return nextEpisode(files, last);
  }
  const progress = await loadProgress();
  const recent = progress.recentRandom[opts.folder] ?? [];
  return randomFile(files, [...recent, ...(opts.exclude ?? [])]);
}
