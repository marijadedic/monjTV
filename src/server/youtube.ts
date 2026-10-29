import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  canonicalYoutubeIntermission,
  parseYoutubePlaylist,
  parseYoutubeUrl,
  youtubeId,
  youtubeLabel,
  type YoutubePlaylistRef,
} from "../shared/youtube.ts";
import { ensureYtdlp, ytdlpRuntimeArgs } from "./ytdlp.ts";

const execFileAsync = promisify(execFile);

export type YoutubeMeta = {
  url: string;
  title: string;
  durationSec: number;
  isLive: boolean;
};

const cache = new Map<string, YoutubeMeta>();
const extraTitles = new Map<string, string>();

const PLAYLIST_LIMIT = 500;

export type YoutubePlaylistVideo = {
  id: string;
  url: string;
  title: string;
};

export type YoutubePlaylist = {
  id: string;
  url: string;
  title: string;
  videos: YoutubePlaylistVideo[];
};

const playlists = new Map<string, YoutubePlaylist>();
const playlistLoads = new Map<string, Promise<YoutubePlaylist>>();

const LIVE_ERROR =
  "Live streams cannot be scheduled. Use a finished YouTube video, or put a live URL in Intermission.";

// Last successful yt-dlp read for this URL, if any.
export function cachedYoutube(raw: string): YoutubeMeta | undefined {
  const url = parseYoutubeUrl(raw);
  return url ? cache.get(url) : undefined;
}

// Title for a video or playlist, including names learned while listing a playlist.
export function cachedYoutubeTitle(raw: string): string | undefined {
  const video = parseYoutubeUrl(raw);
  if (video) return cache.get(video)?.title || extraTitles.get(video) || undefined;
  const playlist = parseYoutubePlaylist(raw);
  if (!playlist) return undefined;
  return playlists.get(playlist.id)?.title || extraTitles.get(playlist.url) || undefined;
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
        "--socket-timeout",
        "30",
        "--extractor-retries",
        "3",
        ...ytdlpRuntimeArgs(),
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

// Titles for timetable labels. A failed lookup is omitted so the id can stay.
export async function youtubeTitles(raws: string[]): Promise<Record<string, string>> {
  const urls = [...new Set(raws.map((raw) => raw.trim()).filter(Boolean))];
  const titles: Record<string, string> = {};
  await Promise.all(
    urls.map(async (raw) => {
      const key = canonicalYoutubeIntermission(raw) ?? parseYoutubeUrl(raw);
      if (!key) return;
      try {
        if (parseYoutubePlaylist(raw)) {
          const title = await youtubePlaylistTitle(raw);
          if (title) titles[key] = title;
          return;
        }
        const meta = await probeYoutube(key, { allowLive: true });
        if (meta.title) titles[key] = meta.title;
      } catch {
        /* keep the id on the timetable */
      }
    }),
  );
  return titles;
}

// Playlist title for the intermission chip. Does not list every video.
export async function youtubePlaylistTitle(raw: string): Promise<string> {
  const ref = parseYoutubePlaylist(raw);
  if (!ref) throw new Error("Not a YouTube playlist URL");
  const known = playlists.get(ref.id)?.title || extraTitles.get(ref.url);
  if (known) return known;
  const title = await readPlaylistTitle(ref);
  rememberTitle(ref.url, title);
  return title;
}

// Videos in playlist order. The same list is shared for the life of the process.
export function loadYoutubePlaylist(raw: string): Promise<YoutubePlaylist> {
  const ref = parseYoutubePlaylist(raw);
  if (!ref) return Promise.reject(new Error("Not a YouTube playlist URL"));
  const hit = playlists.get(ref.id);
  if (hit) return Promise.resolve(hit);
  const pending = playlistLoads.get(ref.id);
  if (pending) return pending;
  const job = readPlaylist(ref).finally(() => {
    playlistLoads.delete(ref.id);
  });
  playlistLoads.set(ref.id, job);
  return job;
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

function rememberTitle(url: string, title: string): void {
  const clean = title.trim();
  if (!clean || clean === "NA") return;
  extraTitles.set(url, clean);
}

async function readPlaylistTitle(ref: YoutubePlaylistRef): Promise<string> {
  const { stdout, stderr } = await runYtdlp(
    [
      "--flat-playlist",
      "--yes-playlist",
      "--playlist-items",
      "1",
      "--print",
      "%(playlist_title)s",
      ref.url,
    ],
    45_000,
  );
  const title = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && line !== "NA");
  if (title) return title;
  if (stderr.trim()) throw playlistReadError(stderr);
  return youtubeLabel(ref.url);
}

async function readPlaylist(ref: YoutubePlaylistRef): Promise<YoutubePlaylist> {
  const { stdout, stderr } = await runYtdlp(
    [
      "--flat-playlist",
      "--yes-playlist",
      "--playlist-end",
      String(PLAYLIST_LIMIT),
      "--dump-single-json",
      ref.url,
    ],
    90_000,
    8_000_000,
  );
  const dump = parseYoutubePrint(stdout) as { title?: string; entries?: unknown } | null;
  const videos = playlistVideos(dump?.entries);
  if (!videos.length) {
    if (stderr.trim() || stdout.trim().startsWith("ERROR")) throw playlistReadError(stderr || stdout);
    throw new Error("This YouTube playlist has no videos");
  }
  const title = (dump?.title ?? "").trim();
  const playlist: YoutubePlaylist = {
    id: ref.id,
    url: ref.url,
    title: title && title !== "NA" ? title : youtubeLabel(ref.url),
    videos,
  };
  rememberTitle(ref.url, playlist.title);
  for (const video of videos) rememberTitle(video.url, video.title);
  playlists.set(ref.id, playlist);
  return playlist;
}

function playlistVideos(entries: unknown): YoutubePlaylistVideo[] {
  if (!Array.isArray(entries)) return [];
  const videos: YoutubePlaylistVideo[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const id = videoIdFromEntry(entry as { id?: string; url?: string });
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = (entry as { title?: string }).title?.trim() ?? "";
    videos.push({
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: title && title !== "NA" ? title : `YouTube · ${id}`,
    });
    if (videos.length >= PLAYLIST_LIMIT) break;
  }
  return videos;
}

function videoIdFromEntry(entry: { id?: string; url?: string }): string | null {
  if (entry.id && /^[\w-]{11}$/.test(entry.id)) return entry.id;
  if (!entry.url) return null;
  return youtubeId(entry.url) ?? (/^[\w-]{11}$/.test(entry.url) ? entry.url : null);
}

async function runYtdlp(
  args: string[],
  timeout: number,
  maxBuffer = 2_000_000,
): Promise<{ stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  try {
    const ytdlp = await ensureYtdlp();
    const result = await execFileAsync(
      ytdlp,
      [
        "--ignore-config",
        "--skip-download",
        "--no-warnings",
        "--socket-timeout",
        "30",
        "--extractor-retries",
        "3",
        ...ytdlpRuntimeArgs(),
        ...args,
      ],
      { timeout, maxBuffer },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    const record = err as { message?: string; stderr?: string; stdout?: string };
    stdout = record.stdout ?? "";
    stderr = `${record.stderr ?? ""}\n${record.message ?? ""}`;
    if (!stdout.trim()) throw playlistReadError(stderr);
  }
  return { stdout, stderr };
}

function playlistReadError(detail: string): Error {
  if (/ENOENT|not found/i.test(detail)) {
    return new Error("yt-dlp is not installed or not on PATH");
  }
  if (/no videos|empty playlist|this playlist does not exist/i.test(detail)) {
    return new Error("This YouTube playlist has no videos");
  }
  return new Error("Could not read this YouTube playlist");
}
