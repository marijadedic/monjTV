import { randomUUID } from "node:crypto";
import { DAYS, type Day, type Schedule, type ScheduleBlock } from "../shared/types.ts";
import { parseHm, isHm } from "./clock.ts";
import { isDir } from "./files.ts";
import { schedulePath } from "./paths.ts";
import { readJson, writeJson } from "./store.ts";

const empty: Schedule = { blocks: [], fallbackFolder: "" };

// Read the weekly schedule from disk.
export async function loadSchedule(): Promise<Schedule> {
  const data = await readJson<Schedule>(schedulePath, empty);
  return {
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    fallbackFolder: fallbackFolderOf(data.fallbackFolder),
  };
}

// Validate the schedule and write it to disk.
export async function saveSchedule(schedule: Schedule): Promise<Schedule> {
  const normalized = validateSchedule(schedule);
  await writeJson(schedulePath, normalized);
  return normalized;
}

// Blocks that air on a day, ordered by start time.
export function blocksForDay(schedule: Schedule, day: Day): ScheduleBlock[] {
  return schedule.blocks
    .filter((b) => b.days.includes(day))
    .sort((a, b) => parseHm(a.start) - parseHm(b.start));
}

// Normalize blocks and reject same-day overlaps.
export function validateSchedule(input: Schedule): Schedule {
  if (!input || !Array.isArray(input.blocks)) {
    throw new Error("Schedule must have a blocks array");
  }
  const blocks = input.blocks.map(normalizeBlock);
  for (const day of DAYS) {
    const ofDay = blocks
      .filter((b) => b.days.includes(day))
      .sort((a, b) => parseHm(a.start) - parseHm(b.start));
    for (let i = 1; i < ofDay.length; i++) {
      const prev = ofDay[i - 1]!;
      const cur = ofDay[i]!;
      if (parseHm(cur.start) < parseHm(prev.end)) {
        throw new Error(
          `Overlapping blocks on ${day}: ${prev.start}–${prev.end} and ${cur.start}–${cur.end}`,
        );
      }
    }
  }
  return { blocks, fallbackFolder: fallbackFolderOf(input.fallbackFolder) };
}

// A folder path, or empty when no default is set.
function fallbackFolderOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Fill defaults and reject an invalid block.
function normalizeBlock(raw: ScheduleBlock): ScheduleBlock {
  if (!raw || typeof raw !== "object") throw new Error("Invalid block");
  const id = raw.id?.trim() || randomUUID();
  const days = [...new Set((raw.days ?? []).filter((d): d is Day => DAYS.includes(d as Day)))];
  if (days.length === 0) throw new Error("Each block needs at least one day");
  if (!isHm(raw.start) || !isHm(raw.end)) throw new Error("start and end must be HH:mm");
  if (parseHm(raw.end) <= parseHm(raw.start)) {
    throw new Error(`Block ${raw.start}–${raw.end} must end after it starts (same day)`);
  }
  if (raw.mode !== "next-episode" && raw.mode !== "random-file") {
    throw new Error("mode must be next-episode or random-file");
  }
  const folder = (raw.folder ?? "").trim();
  if (!folder) throw new Error("Each block needs a folder");
  return { id, days, start: raw.start, end: raw.end, folder, mode: raw.mode };
}

// Throw if the path is not a directory.
export async function assertFolder(folder: string): Promise<void> {
  if (!(await isDir(folder))) {
    throw new Error(`Folder does not exist: ${folder}`);
  }
}
