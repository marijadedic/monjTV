export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

export const BLOCK_MODES = ["next-episode", "random-file", "specific-file", "youtube"] as const;
export type BlockMode = (typeof BLOCK_MODES)[number];

export function isBlockMode(value: string | undefined): value is BlockMode {
  return BLOCK_MODES.includes(value as BlockMode);
}
export type ItemStatus = "planned" | "playing" | "done" | "skipped";

export interface ScheduleBlock {
  id: string;
  days: Day[];
  start: string;
  end: string;
  /** Slot length in minutes. Other days end this long after their own start. */
  lengthMin?: number;
  /** Start time for an extra day. A missing day uses `start`. */
  starts?: Partial<Record<Day, string>>;
  folder: string;
  file?: string;
  mode: BlockMode;
}

export const INTERMISSION_KINDS = ["folder", "video", "youtube"] as const;
export type IntermissionKind = (typeof INTERMISSION_KINDS)[number];

export function isIntermissionKind(value: string | undefined): value is IntermissionKind {
  return INTERMISSION_KINDS.includes(value as IntermissionKind);
}

/** One thing that can fill the gaps between slots. */
export interface IntermissionItem {
  id: string;
  kind: IntermissionKind;
  /** Folder path, video path, or a canonical YouTube watch URL. */
  source: string;
}

export interface Schedule {
  blocks: ScheduleBlock[];
  intermissions: IntermissionItem[];
  /** Id of the intermission that plays. Empty when none is selected. */
  activeIntermission: string;
}

export interface Progress {
  lastCompleted: Record<string, string>;
  recentRandom: Record<string, string[]>;
}

export interface RundownItem {
  id: string;
  blockId: string;
  path: string;
  title: string;
  mode: BlockMode;
  start: string;
  end: string;
  durationSec: number;
  status: ItemStatus;
  /** Leftover of yesterday’s slot that is still on after midnight. */
  overnight?: boolean;
}

export interface TodayRundown {
  date: string;
  items: RundownItem[];
}

export interface SlotMiss {
  blockId: string;
  kind: "video" | "episode" | "folder";
  title: string;
  durationSec: number;
  limitSec: number;
}

export interface SlotLength {
  title: string;
  path: string;
  durationSec: number;
  kind: "video" | "episode" | "random";
  shortest?: { title: string; path: string; durationSec: number };
  fileCount?: number;
}

export interface PlayerStatus {
  running: boolean;
  waitingUntil: string | null;
  error: string | null;
  currentItemId: string | null;
  willStartItemId: string | null;
  fallbackTitle: string | null;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
  videos: { name: string; path: string }[];
}
