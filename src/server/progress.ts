import { RECENT_RANDOM_LIMIT } from "../shared/constants.ts";
import type { Progress } from "../shared/types.ts";
import { progressPath } from "./paths.ts";
import { readJson, writeJson } from "./store.ts";

const empty: Progress = { lastCompleted: {}, recentRandom: {} };

export async function loadProgress(): Promise<Progress> {
  const data = await readJson<Progress>(progressPath, empty);
  return {
    lastCompleted: data.lastCompleted ?? {},
    recentRandom: data.recentRandom ?? {},
  };
}

export async function saveProgress(progress: Progress): Promise<void> {
  await writeJson(progressPath, progress);
}

export async function markEpisodeDone(folder: string, filePath: string): Promise<void> {
  const progress = await loadProgress();
  progress.lastCompleted[folder] = filePath;
  await saveProgress(progress);
}

export async function markRandomPlayed(folder: string, filePath: string): Promise<void> {
  const progress = await loadProgress();
  const prev = progress.recentRandom[folder] ?? [];
  progress.recentRandom[folder] = [
    filePath,
    ...prev.filter((p) => p !== filePath),
  ].slice(0, RECENT_RANDOM_LIMIT);
  await saveProgress(progress);
}
