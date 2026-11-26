// One board write at a time, plus the spinner and save warnings.
import type { SlotMiss } from "../../shared/types.ts";

let tail: Promise<void> = Promise.resolve();
let buildingIds: Set<string> | null = null;
let saveMissToken = 0;
let saveMisses: SlotMiss[] = [];

// Run this write after the previous one, even when that write failed.
async function afterTail<T>(task: () => Promise<T>): Promise<T> {
  try {
    await tail;
  } catch {
    // The previous write failed. This one still runs.
  }
  return task();
}

// Keep the queue from rejecting, so the next write is not skipped.
async function quiet(run: Promise<unknown>): Promise<void> {
  try {
    await run;
  } catch {
    // The caller of exclusive still sees this failure.
  }
}

// One board write at a time, so a playback save cannot drop another day.
export function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = afterTail(task);
  tail = quiet(run);
  return run;
}

// Remember whether the latest save found a video that does not fit.
export function noteSaveMisses(misses: SlotMiss[]): void {
  saveMisses = misses;
  saveMissToken += 1;
}

// Mark these week slots as still being timed.
export function markBuilding(ids: Iterable<string>): void {
  buildingIds = new Set(ids);
}

// True while a rundown rebuild is still timing slots.
export function stillBuilding(): boolean {
  return buildingIds !== null && buildingIds.size > 0;
}

// Clear the week spinner once later days are written.
export function clearBuilding(): void {
  buildingIds = null;
}

// Ids the week spinner is still waiting on.
export function listedBuildingIds(): string[] {
  return buildingIds ? [...buildingIds] : [];
}

// Fit warnings from the latest save, with the token that advanced with them.
export function listedSaveMisses(): { missToken: number; misses: SlotMiss[] } {
  return { missToken: saveMissToken, misses: saveMisses };
}
