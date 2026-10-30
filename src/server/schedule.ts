import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  DAYS,
  isBlockMode,
  isIntermissionKind,
  type Day,
  type IntermissionItem,
  type Schedule,
  type ScheduleBlock,
} from "../shared/types.ts";
import { DAY_MINUTES, clockOf, minutesOf, segmentsOf, windowOn } from "../shared/window.ts";
import { canonicalYoutubeIntermission, isYoutubeLink, parseYoutubeUrl } from "../shared/youtube.ts";
import { parseHm, isHm } from "./clock.ts";
import { assertVideo, isDir } from "./files.ts";
import { schedulePath } from "./paths.ts";
import { readJson, writeJson } from "./store.ts";

const empty: Schedule = {
  blocks: [],
  intermissions: [],
  activeIntermission: "",
  intermissionRandomStart: false,
};

type StoredSchedule = {
  blocks?: ScheduleBlock[];
  fallbackFolder?: unknown;
  intermissions?: unknown;
  activeIntermission?: unknown;
  intermissionRandomStart?: unknown;
};

// Read the weekly schedule from disk.
export async function loadSchedule(): Promise<Schedule> {
  const data = await readJson<StoredSchedule>(schedulePath, empty);
  const schedule = scheduleFrom(data);
  if (!Array.isArray(data.intermissions)) await writeJson(schedulePath, schedule);
  return schedule;
}

// Validate the schedule and write it to disk.
export async function saveSchedule(schedule: StoredSchedule): Promise<Schedule> {
  const normalized = validateSchedule(schedule);
  await assertIntermissions(normalized.intermissions);
  await writeJson(schedulePath, normalized);
  return normalized;
}

// The intermission the player should fill gaps with.
export function playingIntermission(schedule: Schedule): IntermissionItem | null {
  if (!schedule.activeIntermission) return null;
  return schedule.intermissions.find((item) => item.id === schedule.activeIntermission) ?? null;
}

// True when this block is new, or its folder, file, or mode changed.
// A slot whose show was deleted can stay until it is removed, and can be removed
// without the missing folder blocking the save.
export function sourceChanged(before: ScheduleBlock[], block: ScheduleBlock): boolean {
  const old = before.find((item) => item.id === block.id);
  if (!old) return true;
  return (
    old.mode !== block.mode ||
    old.folder.trim() !== (block.folder ?? "").trim() ||
    (old.file ?? "").trim() !== (block.file ?? "").trim()
  );
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
export function validateSchedule(input: StoredSchedule): Schedule {
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
  const { intermissions, activeIntermission } = intermissionsFrom(input, true);
  return {
    blocks,
    intermissions,
    activeIntermission,
    intermissionRandomStart: input.intermissionRandomStart === true,
  };
}

// Blocks plus the intermission list, without rejecting a saved block.
function scheduleFrom(data: StoredSchedule): Schedule {
  return {
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
    ...intermissionsFrom(data, false),
    intermissionRandomStart: data.intermissionRandomStart === true,
  };
}

// A folder path, a canonical YouTube video or playlist URL, or empty.
function fallbackFolderOf(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return canonicalYoutubeIntermission(trimmed) ?? trimmed;
}

// The saved list, or one item made from an older fallbackFolder.
function intermissionsFrom(
  data: StoredSchedule,
  strict: boolean,
): { intermissions: IntermissionItem[]; activeIntermission: string } {
  if (Array.isArray(data.intermissions)) {
    const seen = new Set<string>();
    const intermissions = data.intermissions.flatMap((raw) => {
      const item = normalizeIntermission(raw, seen, strict);
      return item ? [item] : [];
    });
    const wanted = typeof data.activeIntermission === "string" ? data.activeIntermission : "";
    const activeIntermission = intermissions.some((item) => item.id === wanted) ? wanted : "";
    return { intermissions, activeIntermission };
  }
  const source = fallbackFolderOf(data.fallbackFolder);
  if (!source) return { intermissions: [], activeIntermission: "" };
  const item: IntermissionItem = {
    id: randomUUID(),
    kind: isYoutubeLink(source) ? "youtube" : "folder",
    source,
  };
  return { intermissions: [item], activeIntermission: item.id };
}

// Keep a usable list entry. Saving rejects a bad one; loading skips it.
function normalizeIntermission(raw: unknown, seen: Set<string>, strict: boolean): IntermissionItem | null {
  const fail = (message: string): null => {
    if (strict) throw new Error(message);
    return null;
  };
  if (!raw || typeof raw !== "object") return fail("Invalid intermission");
  const item = raw as { id?: unknown; kind?: unknown; source?: unknown };
  const source = typeof item.source === "string" ? item.source.trim() : "";
  const kind = typeof item.kind === "string" && isIntermissionKind(item.kind) ? item.kind : "";
  if (!kind) return fail("Invalid intermission");
  if (kind === "youtube") {
    const url = canonicalYoutubeIntermission(source);
    if (!url) return fail("Not a YouTube video or playlist URL");
    return { id: freshId(item.id, seen), kind, source: url };
  }
  if (!source || isYoutubeLink(source)) {
    return fail(
      isYoutubeLink(source)
        ? "That is a YouTube link. Choose YouTube, then add it."
        : kind === "video"
          ? "Type the video path."
          : "Type the folder path.",
    );
  }
  return { id: freshId(item.id, seen), kind, source };
}

function freshId(id: unknown, seen: Set<string>): string {
  let next = typeof id === "string" && id.trim() ? id.trim() : randomUUID();
  if (seen.has(next)) next = randomUUID();
  seen.add(next);
  return next;
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

// Each list entry is a folder, a video file, or a YouTube video or playlist. Live streams are allowed.
export async function assertIntermissions(items: IntermissionItem[]): Promise<void> {
  for (const item of items) {
    if (item.kind === "youtube") continue;
    if (item.kind === "video") await assertVideo(item.source);
    else await assertFolder(item.source);
  }
}
