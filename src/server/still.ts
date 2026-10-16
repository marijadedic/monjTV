import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { probeDuration } from "./duration.ts";
import { dataDir } from "./paths.ts";

const execFileAsync = promisify(execFile);
const stillDir = path.join(dataDir, "stills");
const pending = new Map<string, Promise<string | null>>();

function cachePath(file: string): string {
  const name = createHash("sha256").update(file).digest("hex").slice(0, 24);
  return path.join(stillDir, `${name}.jpg`);
}

function stampOf(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function writeFrame(file: string, dest: string): Promise<string | null> {
  const duration = await probeDuration(file);
  const scene = duration > 20 * 60 ? 18 * 60 + 40 : Math.max(8, Math.floor(duration * 0.2));
  const stamps = [stampOf(scene), "0:00:08"];
  await mkdir(stillDir, { recursive: true });
  for (const stamp of stamps) {
    try {
      await execFileAsync(
        "ffmpeg",
        ["-y", "-ss", stamp, "-i", file, "-frames:v", "1", "-vf", "scale=720:-1", dest],
        { timeout: 20_000 },
      );
      const info = await stat(dest);
      if (info.size > 100) return dest;
    } catch {
      /* try an earlier scene */
    }
  }
  await rm(dest, { force: true });
  return null;
}

// One cached frame from a video, or null when ffmpeg cannot make it.
export function frameOf(file: string): Promise<string | null> {
  const dest = cachePath(file);
  const running = pending.get(file);
  if (running) return running;
  const job = stat(dest)
    .then((info) => (info.size > 100 ? dest : writeFrame(file, dest)))
    .catch(() => writeFrame(file, dest))
    .finally(() => pending.delete(file));
  pending.set(file, job);
  return job;
}
