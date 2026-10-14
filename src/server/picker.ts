import type { BlockMode } from "../shared/types.ts";
import { listVideos } from "./files.ts";
import { loadProgress } from "./progress.ts";

export async function videosIn(folder: string): Promise<string[]> {
  return listVideos(folder);
}

export function nextEpisode(files: string[], lastCompleted?: string): string | null {
  if (files.length === 0) return null;
  if (!lastCompleted) return files[0]!;
  const idx = files.indexOf(lastCompleted);
  if (idx === -1) return files[0]!;
  return files[(idx + 1) % files.length]!;
}

export function randomFile(files: string[], exclude: string[]): string | null {
  const pool = files.filter((f) => !exclude.includes(f));
  const source = pool.length > 0 ? pool : files;
  if (source.length === 0) return null;
  return source[Math.floor(Math.random() * source.length)]!;
}

export async function pick(opts: {
  folder: string;
  mode: BlockMode;
  exclude?: string[];
  lastCompletedOverride?: string;
}): Promise<string | null> {
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
