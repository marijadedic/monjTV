// Read and write tv.json.
import { readFile } from "node:fs/promises";
import type { DayRundown, RundownItem } from "../../shared/types.ts";
import { todayPath, tvPath } from "../data/paths.ts";
import { writeJson } from "../data/store.ts";

export type BoardFile = {
  carriedInto?: string;
  days: DayRundown[];
};

function isDay(value: unknown): value is DayRundown {
  if (!value || typeof value !== "object") return false;
  const day = value as DayRundown;
  return typeof day.date === "string" && Array.isArray(day.items);
}

// A saved YouTube row is one video. The watch URL stays on the row.
function migrateItem(item: RundownItem): RundownItem {
  if ((item.mode as string) !== "youtube") return item;
  return { ...item, mode: "specific-file" };
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    const raw = await readFile(file, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// The saved TV schedule, or the old single-day file the first time.
export async function readBoard(): Promise<BoardFile> {
  const saved = await readJsonFile(tvPath);
  const legacy = await readJsonFile(todayPath);
  const legacyDay = isDay(legacy) && legacy.date ? legacy : null;
  if (
    saved &&
    typeof saved === "object" &&
    Array.isArray((saved as BoardFile).days)
  ) {
    const file = saved as BoardFile;
    const days = file.days
      .filter(isDay)
      .map((day) => ({ ...day, items: day.items.map(migrateItem) }));
    if (days.length > 0 || !legacyDay) {
      return {
        carriedInto:
          typeof file.carriedInto === "string" ? file.carriedInto : undefined,
        days,
      };
    }
  }
  return { days: legacyDay ? [legacyDay] : [] };
}

// Write the saved days in date order, one row per date.
export async function writeBoard(board: BoardFile): Promise<void> {
  const byDate = new Map<string, DayRundown>();
  for (const day of board.days) byDate.set(day.date, day);
  await writeJson(tvPath, {
    carriedInto: board.carriedInto,
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  });
}
