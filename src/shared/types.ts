export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

export type BlockMode = "next-episode" | "random-file";
export type ItemStatus = "planned" | "playing" | "done" | "skipped";

export interface ScheduleBlock {
  id: string;
  days: Day[];
  start: string;
  end: string;
  folder: string;
  mode: BlockMode;
}

export interface Schedule {
  blocks: ScheduleBlock[];
  fallbackFolder: string;
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
}

export interface TodayRundown {
  date: string;
  items: RundownItem[];
}

export interface PlayerStatus {
  running: boolean;
  waitingUntil: string | null;
  error: string | null;
  currentItemId: string | null;
  fallbackTitle: string | null;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
  videos: { name: string; path: string }[];
}
