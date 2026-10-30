import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const dataDir = path.join(rootDir, "data");
export const clientDir = path.join(rootDir, "dist/client");
export const schedulePath = path.join(dataDir, "schedule.json");
export const progressPath = path.join(dataDir, "progress.json");
export const tvPath = path.join(dataDir, "tv.json");
/** Previous single-day file. Read once when tv.json is not there yet. */
export const todayPath = path.join(dataDir, "today.json");
