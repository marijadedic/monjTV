import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseYoutubeUrl, youtubeLabel } from "../shared/youtube.ts";
import { ensureYtdlp } from "./ytdlp.ts";

const execFileAsync = promisify(execFile);

export type YoutubeMeta = {
  url: string;
  title: string;
  durationSec: number;
  isLive: boolean;
};

const cache = new Map<string, YoutubeMeta>();

const LIVE_ERROR =
  "Live streams cannot be scheduled. Use a finished YouTube video, or put a live URL in Intermission.";

// Last successful yt-dlp read for this URL, if any.
export function cachedYoutube(raw: string): YoutubeMeta | undefined {
  const url = parseYoutubeUrl(raw);
  return url ? cache.get(url) : undefined;
}

// Title, length, and live flag from yt-dlp. Live is rejected unless allowLive.
export async function probeYoutube(
  raw: string,
  opts?: { allowLive?: boolean },
): Promise<YoutubeMeta> {
  const url = parseYoutubeUrl(raw);
  if (!url) throw new Error("Not a YouTube video URL");
  const hit = cache.get(url);
  if (hit) {
    if (hit.isLive && !opts?.allowLive) throw new Error(LIVE_ERROR);
    return hit;
  }

  let stdout = "";
  let stderr = "";
  try {
    const ytdlp = await ensureYtdlp();
    const result = await execFileAsync(
      ytdlp,
      [
        "--ignore-config",
        "--no-playlist",
        "--skip-download",
        "--no-warnings",
        "--ignore-no-formats-error",
        "--print",
        "%(.{title,duration,is_live,live_status})j",
        url,
      ],
      { timeout: 45_000, maxBuffer: 2_000_000 },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    const record = err as { message?: string; stderr?: string; stdout?: string };
    stdout = record.stdout ?? "";
    stderr = `${record.stderr ?? ""}\n${record.message ?? ""}`;
    if (/ENOENT|not found/i.test(stderr)) {
      throw new Error("yt-dlp is not installed or not on PATH");
    }
  }

  const parsed = parseYoutubePrint(stdout);
  if (!parsed) throw youtubeReadError(stderr || stdout);

  const isLive =
    parsed.is_live === true ||
    parsed.live_status === "is_live" ||
    parsed.live_status === "is_upcoming";
  const durationSec = Math.round(Number(parsed.duration));
  const title = (parsed.title ?? "").trim() || youtubeLabel(url);
  const meta: YoutubeMeta = {
    url,
    title,
    durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
    isLive,
  };
  cache.set(url, meta);
  if (isLive && !opts?.allowLive) throw new Error(LIVE_ERROR);
  if (!isLive && meta.durationSec < 1) {
    throw new Error("Could not read this YouTube video's length");
  }
  return meta;
}

// Throw unless this is a finished YouTube video with a readable length.
export async function assertYoutubeVideo(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Each YouTube slot needs a YouTube video URL");
  await probeYoutube(trimmed);
}

// Throw unless this is a YouTube URL. Live is allowed.
export function assertYoutubeUrl(raw: string): string {
  const url = parseYoutubeUrl(raw);
  if (!url) throw new Error("Not a YouTube video URL");
  return url;
}

type YoutubePrint = {
  title?: string;
  duration?: number | null;
  is_live?: boolean;
  live_status?: string;
};

function parseYoutubePrint(stdout: string): YoutubePrint | null {
  const text = stdout.trim();
  if (!text || text.startsWith("ERROR")) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as YoutubePrint;
  } catch {
    return null;
  }
}

function youtubeReadError(detail: string): Error {
  if (/ENOENT|not found/i.test(detail)) {
    return new Error("yt-dlp is not installed or not on PATH");
  }
  return new Error("Could not read this YouTube video");
}
