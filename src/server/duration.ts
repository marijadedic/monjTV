import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FALLBACK_SEC = 45 * 60;
const exact = new Map<string, number>();
const failed = new Set<string>();

// Measured length in seconds. Null when ffprobe cannot read the file.
export async function measureDuration(file: string): Promise<number | null> {
  const hit = exact.get(file);
  if (hit) return hit;
  if (failed.has(file)) return null;
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
      exact.set(file, rounded);
      return rounded;
    }
  } catch {
    // ffprobe missing or file unreadable
  }
  failed.add(file);
  return null;
}

// Video length in seconds, cached, with a fallback when probing fails.
export async function probeDuration(file: string): Promise<number> {
  return (await measureDuration(file)) ?? FALLBACK_SEC;
}
