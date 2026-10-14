import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cache = new Map<string, number>();

export async function probeDuration(file: string): Promise<number> {
  const hit = cache.get(file);
  if (hit) return hit;
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { timeout: 15_000 },
    );
    const n = Number.parseFloat(stdout.trim());
    if (Number.isFinite(n) && n > 1) {
      const rounded = Math.round(n);
      cache.set(file, rounded);
      return rounded;
    }
  } catch {
    // ffprobe missing or file unreadable
  }
  const fallback = 45 * 60;
  cache.set(file, fallback);
  return fallback;
}
