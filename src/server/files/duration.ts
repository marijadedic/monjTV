// Probe how long a local file is.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FALLBACK_SEC = 45 * 60;
const exact = new Map<string, number>();
const failed = new Set<string>();
let probeTail: Promise<void> = Promise.resolve();

// Probe this file after the previous probe, even when that probe failed.
async function afterProbe<T>(task: () => Promise<T>): Promise<T> {
  try {
    await probeTail;
  } catch {
    // The previous probe failed. This one still runs.
  }
  return task();
}

// Keep the probe queue from rejecting, so the next file is not skipped.
async function quietProbe(run: Promise<unknown>): Promise<void> {
  try {
    await run;
  } catch {
    // The caller of enqueueProbe still sees this failure.
  }
}

// One ffprobe at a time so a playlist open cannot flood the machine.
function enqueueProbe<T>(task: () => Promise<T>): Promise<T> {
  const run = afterProbe(task);
  probeTail = quietProbe(run);
  return run;
}

async function probeFile(file: string): Promise<number | null> {
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

// Measured length in seconds. Null when ffprobe cannot read the file.
export async function measureDuration(file: string): Promise<number | null> {
  const hit = exact.get(file);
  if (hit) return hit;
  if (failed.has(file)) return null;
  return enqueueProbe(async () => {
    const cached = exact.get(file);
    if (cached) return cached;
    if (failed.has(file)) return null;
    return probeFile(file);
  });
}

// Video length in seconds, cached, with a fallback when probing fails.
export async function probeDuration(file: string): Promise<number> {
  return (await measureDuration(file)) ?? FALLBACK_SEC;
}
