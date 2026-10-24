import { randomUUID } from "node:crypto";
import path from "node:path";
import { DAYS, isBlockMode, type Day, type Schedule, type ScheduleBlock } from "../shared/types.ts";
import { DAY_MINUTES, clockOf, minutesOf, segmentsOf, windowOn } from "../shared/window.ts";
import { isYoutubeUrl, parseYoutubeUrl } from "../shared/youtube.ts";
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

// Blocks that were added or whose window, folder, file, or mode changed.
export function changedBlocks(before: ScheduleBlock[], after: ScheduleBlock[]): ScheduleBlock[] {
  return after.filter((block) => {
    const old = before.find((item) => item.id === block.id);
    if (!old) return true;
    return (
      old.start !== block.start ||
      old.end !== block.end ||
      (old.lengthMin ?? 0) !== (block.lengthMin ?? 0) ||
      !sameDays(old.days, block.days) ||
      !sameStarts(old.starts, block.starts) ||
      old.folder !== block.folder ||
      (old.file ?? "") !== (block.file ?? "") ||
      old.mode !== block.mode
    );
  });
}

// Blocks that air on a day, ordered by start time.
export function blocksForDay(schedule: Schedule, day: Day): ScheduleBlock[] {
  return schedule.blocks
    .filter((b) => b.days.includes(day))
    .sort((a, b) => parseHm(windowOn(a, day).start) - parseHm(windowOn(b, day).start));
}

// Normalize blocks and reject overlaps, including leftovers that run past midnight.
export function validateSchedule(input: Schedule): Schedule {
  if (!input || !Array.isArray(input.blocks)) {
    throw new Error("Schedule must have a blocks array");
  }
  const blocks = input.blocks.map(normalizeBlock);
  for (const day of DAYS) {
    const ofDay = blocks
      .flatMap((block) =>
        segmentsOf(block)
          .filter((seg) => seg.day === day)
          .map((seg) => ({ start: seg.start, end: seg.end, label: `${clockOf(seg.start)}–${clockOf(seg.end)}` })),
      )
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < ofDay.length; i++) {
      const prev = ofDay[i - 1]!;
      const cur = ofDay[i]!;
      if (cur.start < prev.end) {
        throw new Error(`Overlapping blocks on ${day}: ${prev.label} and ${cur.label}`);
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
  if (!isHm(raw.start)) throw new Error("start and end must be HH:mm");
  const lengthMin = cleanLength(raw);
  const starts = cleanStarts(days, raw.starts);
  const end = lengthMin ? clockOf(minutesOf(raw.start) + lengthMin) : raw.end;
  if (!isHm(end)) throw new Error("start and end must be HH:mm");
  if (!lengthMin && minutesOf(end) === minutesOf(raw.start)) {
    throw new Error("Block must be shorter than 24 hours");
  }
  if (!isBlockMode(raw.mode)) {
    throw new Error("mode must be next-episode, random-file, specific-file, or youtube");
  }
  if (raw.mode === "youtube") {
    const file = parseYoutubeUrl(raw.file ?? "") ?? "";
    if (!file) throw new Error("Each YouTube slot needs a YouTube video URL");
    return {
      id,
      days,
      start: raw.start,
      end,
      ...(lengthMin ? { lengthMin } : {}),
      ...(starts ? { starts } : {}),
      folder: "",
      file,
      mode: raw.mode,
    };
  }
  if (raw.mode === "specific-file") {
    const file = (raw.file ?? "").trim();
    if (!file) throw new Error("Each specific-file block needs a video");
    return {
      id,
      days,
      start: raw.start,
      end,
      ...(lengthMin ? { lengthMin } : {}),
      ...(starts ? { starts } : {}),
      folder: path.dirname(file),
      file,
      mode: raw.mode,
    };
  }
  const folder = (raw.folder ?? "").trim();
  if (!folder) throw new Error("Each block needs a folder");
  return {
    id,
    days,
    start: raw.start,
    end,
    ...(lengthMin ? { lengthMin } : {}),
    ...(starts ? { starts } : {}),
    folder,
    mode: raw.mode,
  };
}

// Keep starts that name a selected day.
function cleanStarts(
  days: Day[],
  raw: ScheduleBlock["starts"],
): Partial<Record<Day, string>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const starts: Partial<Record<Day, string>> = {};
  for (const day of days) {
    const value = raw[day];
    if (value == null || value === "") continue;
    if (typeof value !== "string" || !isHm(value)) throw new Error("start and end must be HH:mm");
    starts[day] = value;
  }
  return Object.keys(starts).length ? starts : undefined;
}

// Whole minutes, when the block stores its length.
function cleanLength(raw: ScheduleBlock): number | undefined {
  if (raw.lengthMin == null) return undefined;
  if (typeof raw.lengthMin !== "number" || !Number.isInteger(raw.lengthMin) || raw.lengthMin < 1) {
    throw new Error("start and end must be HH:mm");
  }
  if (raw.lengthMin >= DAY_MINUTES) throw new Error("Block must be shorter than 24 hours");
  return raw.lengthMin;
}

// True when both lists name the same days.
function sameDays(a: Day[], b: Day[]): boolean {
  return [...a].sort().join() === [...b].sort().join();
}

// True when both maps name the same per-day starts.
function sameStarts(
  a: ScheduleBlock["starts"],
  b: ScheduleBlock["starts"],
): boolean {
  const days = new Set<string>([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const day of days) {
    if ((a?.[day as Day] ?? "") !== (b?.[day as Day] ?? "")) return false;
  }
  return true;
}

// Throw if the path is not a directory.
export async function assertFolder(folder: string): Promise<void> {
  if (!(await isDir(folder))) {
    throw new Error(`Folder does not exist: ${folder}`);
  }
}

// A folder on disk, or a YouTube URL for intermission.
export async function assertFallback(source: string): Promise<void> {
  const trimmed = source.trim();
  if (!trimmed) return;
  if (isYoutubeUrl(trimmed)) return;
  await assertFolder(trimmed);
}
