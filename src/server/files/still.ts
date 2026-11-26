// Posters and frames for the TV schedule.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { youtubeId } from "../../shared/youtube.ts";
import { probeDuration } from "./duration.ts";
import { dataDir } from "../data/paths.ts";
import { ensureYtdlp, ytdlpRuntimeArgs } from "../youtube/ytdlp.ts";

const execFileAsync = promisify(execFile);
const stillDir = path.join(dataDir, "stills");
const pending = new Map<string, Promise<string | null>>();
let searchTail: Promise<void> = Promise.resolve();

const YOUTUBE_POSTERS = [
  "maxresdefault.jpg",
  "hq720.jpg",
  "sddefault.jpg",
  "hqdefault.jpg",
  "mqdefault.jpg",
];

const STOP = new Set([
  "the",
  "and",
  "for",
  "you",
  "from",
  "with",
  "that",
  "this",
  "episode",
  "season",
  "sezona",
  "of",
  "in",
  "to",
  "je",
  "li",
  "na",
  "po",
  "za",
  "od",
  "iz",
]);

const JUNK = new Set([
  "dsnp",
  "amzn",
  "atvp",
  "hmax",
  "aac",
  "hevc",
  "blurayrip",
  "webrip",
  "vialle",
  "pipi",
  "rakija",
  "jatt",
  "g3ms",
  "shaanig",
  "mkv",
  "mp4",
  "avi",
  "hd",
  "tv",
  "md",
]);

const GENERIC_DIR = new Set([
  "shows",
  "vids",
  "videos",
  "anime",
  "cartoons",
  "documentary",
  "family",
  "movies",
  "movie",
  "tv",
  "series",
  "prime time",
  "late night",
]);

type PosterQuery = {
  query: string;
  year: string;
  episode: string;
  anchors: string[];
  /** The filename does not name the show, so an old search hit for it is not the poster. */
  borrowed: boolean;
};

function cachePath(file: string): string {
  const name = createHash("sha256").update(`poster:${file}`).digest("hex").slice(0, 24);
  return path.join(stillDir, `${name}.jpg`);
}

function stampOf(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

function tokens(value: string, min = 2): string[] {
  return fold(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(
      (word) =>
        word.length >= min &&
        !STOP.has(word) &&
        !JUNK.has(word) &&
        !/^\d+$/.test(word) &&
        !/^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/.test(word),
    );
}

// Show-name words. Short pieces like Yu, Gi, and Oh stay when the name has no longer word.
function nameTokens(value: string): string[] {
  const words = tokens(value, 3);
  if (words.length >= 2) return words;
  const short = tokens(value, 2);
  return short.length > 0 ? short : words;
}

function unique(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

// Search after the previous search, even when that search failed.
async function afterSearch<T>(task: () => Promise<T>): Promise<T> {
  try {
    await searchTail;
  } catch {
    // The previous search failed. This one still runs.
  }
  return task();
}

// Keep the search queue from rejecting, so the next card is not skipped.
async function quietSearch(run: Promise<unknown>): Promise<void> {
  try {
    await run;
  } catch {
    // The caller of exclusiveSearch still sees this failure.
  }
}

// One yt-dlp search at a time so a day of cards cannot flood the Pi.
function exclusiveSearch<T>(task: () => Promise<T>): Promise<T> {
  const run = afterSearch(task);
  searchTail = quietSearch(run);
  return run;
}

function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: bytes.readUInt16BE(i + 5),
        width: bytes.readUInt16BE(i + 7),
      };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const length = bytes.readUInt16BE(i + 2);
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

// Drop release tags, group names, and bracket notes. Keep a 4-digit year.
function cleanRelease(raw: string): string {
  let text = raw.replace(/\[[^\]]*\]/g, " ");
  text = text.replace(/\(((?:19|20)\d{2})[^)]*\)/g, " $1 ");
  text = text.replace(/\([^)]*\)/g, " ");
  text = text.replace(/\b(ddp|dd\+)\d(?:\.\d)?\b/gi, " ");
  text = text.replace(/\bh\.?26[45]\b/gi, " ");
  text = text.replace(/\b10bit\b/gi, " ");
  text = text.replace(/\bac3(?:\.\d+)+\b/gi, " ");
  text = text.replace(/\b\d\.\d\b/g, " ");
  text = text.replace(/[._]+/g, " ");
  while (/(\S)-(\S)/.test(text)) text = text.replace(/(\S)-(\S)/g, "$1 $2");
  text = text.replace(
    /\b(web\s?dl|blu\s?ray|blurayrip|bdrip|brrip|webrip|dvdrip|tvrip|pdtv|hdtv|hdrip|x264|x265|h\s?26[45]|hevc|10\s?bit|dual\s?audio|aac|dts|ac3|hrsink|skst|1080p|720p|480p|2160p|4k|serija|dsnp)\b/gi,
    " ",
  );
  return text.replace(/\s+/g, " ").trim();
}

// Drop leftover group names after the title has been chosen.
function filterWords(text: string): string {
  const words = text
    .split(" ")
    .map((word) => word.replace(/^[-–—]+|[-–—]+$/g, ""))
    .filter((word) => word && word !== "-" && !JUNK.has(word.toLowerCase()) && !/^0+$/.test(word));
  while (words.length > 1) {
    const last = words[words.length - 1] ?? "";
    if (/^com$/i.test(last)) {
      words.pop();
      continue;
    }
    if (/^(ii|iii|iv|vi|vii|viii|ix|xi)$/i.test(last)) break;
    if (/^S\d{1,2}E\d{1,3}$/i.test(last) || /^EP?\d{1,3}$/i.test(last)) break;
    if (JUNK.has(last.toLowerCase())) {
      words.pop();
      continue;
    }
    if (/^(?=.*[A-Z])[A-Z0-9]{2,8}$/.test(last)) {
      words.pop();
      continue;
    }
    if (/[a-z]/.test(last) && /[A-Z]/.test(last.slice(1))) {
      words.pop();
      continue;
    }
    break;
  }
  return words.join(" ");
}

function episodeOf(base: string): string {
  const flat = base.replace(/[._]/g, " ");
  const season = flat.match(/\bS\s*(\d{1,2})\s*E\s*(\d{1,3})\b/i);
  if (season) return `S${season[1]!.padStart(2, "0")}E${season[2]!.padStart(2, "0")}`;
  const episode = flat.match(/\b(?:Episode|EP|E)\s*(\d{1,3})\b/i);
  if (episode) return `episode ${Number(episode[1])}`;
  if (/\b(?:19|20)\d{2}\b/.test(flat)) return "";
  const lead = flat.match(/^\s*(\d{1,3})\b/);
  if (lead && Number(lead[1]) > 0 && Number(lead[1]) < 100) return `episode ${Number(lead[1])}`;
  const tail = flat.match(/\s(\d{1,3})\s*$/);
  if (tail && Number(tail[1]) > 0 && Number(tail[1]) < 100) return `episode ${Number(tail[1])}`;
  const paren = base.match(/\((\d{1,2})\)\s*$/);
  if (paren) return `episode ${Number(paren[1])}`;
  return "";
}

// English title before " - ", when the other side is a translation.
function preferSide(cleaned: string, year: string): string {
  const parts = cleaned
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return cleaned;
  const rest = parts.slice(1).join(" ");
  const first = parts[0] ?? cleaned;
  if (/[čćžšđČĆŽŠĐ]/.test(rest) || (year && nameTokens(first).length >= 1 && nameTokens(rest).length >= 1)) {
    return first;
  }
  return parts.join(" ");
}

function skipFolder(name: string): boolean {
  const cleaned = cleanRelease(name.replace(/^\+/, "")).replace(/\s+-\s+/g, " ").toLowerCase();
  if (!cleaned) return true;
  if (GENERIC_DIR.has(cleaned)) return true;
  if (/\d+\s*min\b/.test(cleaned)) return true;
  if (/pack\d*/i.test(cleaned)) return true;
  if (/^(season|sezona)\b/.test(cleaned)) return true;
  if (/^\d+\s+(sezona|season)$/.test(cleaned)) return true;
  return false;
}

// Nearest folder that names the show, skipping seasons, packs, and library buckets.
function showFolder(file: string): string {
  let dir = path.dirname(file);
  for (let depth = 0; depth < 6; depth += 1) {
    const base = path.basename(dir);
    const parent = path.dirname(dir);
    if (!base || parent === dir) break;
    if (!skipFolder(base)) {
      const name = filterWords(
        cleanRelease(base.replace(/^\+/, ""))
          .replace(/\s+-\s+/g, " ")
          .replace(/\b(kolekcija|komplet)\b/gi, " "),
      );
      if (nameTokens(name).length > 0) return name;
    }
    dir = parent;
  }
  return "";
}

// Search text for a local file: the movie, or the show plus episode. Not the raw dump name.
export function posterQuery(file: string): PosterQuery {
  const base = path.basename(file, path.extname(file));
  const year = base.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? "";
  const episode = episodeOf(base);
  const cleaned = filterWords(preferSide(cleanRelease(base), year));
  const marker = /\bS\s*\d{1,2}\s*E\s*\d{1,3}\b|\b(?:Episode|EP|E)\s*\d{1,3}\b|^\s*\d{1,3}\b/i;
  const before = episode ? (cleaned.split(marker)[0] ?? "") : cleaned;
  const folder = showFolder(file);
  const own = nameTokens(before);
  const borrowed = own.length === 0;
  const rest = borrowed ? cleaned.replace(marker, " ").replace(/\s+/g, " ").trim() : "";
  const after = episode ? cleaned.split(marker).slice(1).join(" ") : "";
  const showTokens = borrowed
    ? unique([...nameTokens(folder), ...nameTokens(rest)])
    : unique([...own, ...nameTokens(after)]);
  let phrase = cleaned;
  if (borrowed) phrase = [folder, rest, episode].filter(Boolean).join(" ");
  else if (episode) phrase = `${before.trim()} ${episode}`;
  if (episode && !fold(phrase).includes(fold(episode)) && !/s\d{2}e\d{2}/i.test(phrase)) phrase = `${phrase} ${episode}`;
  if (year && !phrase.includes(year)) phrase = `${phrase} ${year}`;
  phrase = phrase.replace(/\s+/g, " ").trim();
  return {
    query: phrase,
    year,
    episode,
    anchors: unique(showTokens),
    borrowed,
  };
}

function scoreTitle(spec: PosterQuery, title: string): number {
  if (spec.anchors.length === 0) return -1;
  const folded = fold(title);
  const words = new Set(tokens(title));
  const hit = spec.anchors.filter(
    (anchor) => words.has(anchor) || (anchor.length >= 5 && folded.includes(anchor)),
  );
  const need = spec.anchors.length <= 3 ? spec.anchors.length : Math.ceil(spec.anchors.length * 0.75);
  if (hit.length < need) return -1;
  if (spec.year && /\b(?:19|20)\d{2}\b/.test(title) && !title.includes(spec.year)) return -1;
  let score = hit.length * 10;
  if (spec.year && title.includes(spec.year)) score += 12;
  const season = spec.episode.match(/^S(\d+)E(\d+)$/i);
  const compact = folded.replace(/[^a-z0-9]/g, "");
  let episodeHit = false;
  if (season) {
    const s = String(Number(season[1]));
    const e = String(Number(season[2]));
    episodeHit =
      compact.includes(`s${s.padStart(2, "0")}e${e.padStart(2, "0")}`) ||
      compact.includes(`s${s}e${e}`) ||
      compact.includes(`s${s}ep${e}`) ||
      new RegExp(`\\b(?:episode|ep)\\s*0*${Number(e)}\\b`, "i").test(title);
    if (episodeHit) score += 18;
  } else if (spec.episode) {
    const n = Number(spec.episode.match(/(\d+)$/)?.[1] ?? "");
    if (n && new RegExp(`\\b(episode|ep|e|epizoda|dio)\\s*0*${n}\\b`, "i").test(title)) {
      episodeHit = true;
      score += 10;
    }
  }
  if (spec.episode && !episodeHit) return -1;
  if (/\b(reaction|reacts|abridged)\b/i.test(title)) return -1;
  if (/\b(review|explained|gameplay|lyrics|karaoke|music video|official audio|theme song|dubbed|tagalog|recap|commentary)\b/i.test(title)) {
    score -= 40;
  }
  if (!spec.anchors.includes("holmes") && /\bholmes\b/i.test(title)) score -= 40;
  const anchorAt = spec.anchors
    .map((anchor) => folded.indexOf(anchor))
    .filter((index) => index >= 0);
  if (anchorAt.length && Math.min(...anchorAt) > 18) return -1;
  return score < 8 ? -1 : score;
}

// First YouTube video whose title matches this poster query.
async function youtubeMatch(spec: PosterQuery): Promise<string | null> {
  if (!spec.query || spec.anchors.length === 0) return null;
  try {
    const ytdlp = await ensureYtdlp();
    const { stdout } = await execFileAsync(
      ytdlp,
      [
        "--ignore-config",
        "--flat-playlist",
        "--skip-download",
        "--no-warnings",
        "--socket-timeout",
        "30",
        ...ytdlpRuntimeArgs(),
        "--print",
        "%(id)s\t%(title)s",
        `ytsearch8:${spec.query}`,
      ],
      { timeout: 45_000, maxBuffer: 2_000_000 },
    );
    let best: { id: string; score: number } | null = null;
    for (const line of stdout.split("\n")) {
      const tab = line.indexOf("\t");
      if (tab < 1) continue;
      const id = line.slice(0, tab).trim();
      const title = line.slice(tab + 1).trim();
      if (!/^[\w-]{11}$/.test(id)) continue;
      const score = scoreTitle(spec, title);
      if (score < 0) continue;
      if (!best || score > best.score) best = { id, score };
    }
    return best?.id ?? null;
  } catch {
    return null;
  }
}

async function imageSize(file: string): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
        file,
      ],
      { timeout: 10_000 },
    );
    const [width, height] = stdout
      .trim()
      .split("x")
      .map((part) => Number(part));
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

// Cut the black bars YouTube bakes into a 4:3 thumbnail.
async function trimBars(dest: string): Promise<void> {
  const size = await imageSize(dest);
  if (!size) return;
  const { width, height } = size;
  let raw: Buffer;
  try {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      ["-v", "error", "-i", dest, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
      { timeout: 20_000, encoding: "buffer", maxBuffer: 20_000_000 },
    );
    raw = stdout as unknown as Buffer;
  } catch {
    return;
  }
  if (raw.length < width * height * 3) return;
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 3;
    return raw[i]! < 18 && raw[i + 1]! < 18 && raw[i + 2]! < 18;
  };
  const rowBar = (y: number) => {
    let darkCount = 0;
    for (let x = 0; x < width; x += 1) if (dark(x, y)) darkCount += 1;
    return darkCount / width > 0.97;
  };
  const colBar = (x: number) => {
    let darkCount = 0;
    for (let y = 0; y < height; y += 1) if (dark(x, y)) darkCount += 1;
    return darkCount / height > 0.97;
  };
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  while (top < bottom && rowBar(top)) top += 1;
  while (bottom > top && rowBar(bottom)) bottom -= 1;
  while (left < right && colBar(left)) left += 1;
  while (right > left && colBar(right)) right -= 1;
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  if (cropW < width * 0.55 || cropH < height * 0.55) return;
  if (width - cropW < width * 0.04 && height - cropH < height * 0.04) return;
  const x = left - (left % 2);
  const y = top - (top % 2);
  const w = cropW - (cropW % 2);
  const h = cropH - (cropH % 2);
  if (w < 64 || h < 64) return;
  const tmp = `${dest}.crop.jpg`;
  try {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", dest, "-vf", `crop=${w}:${h}:${x}:${y}`, "-q:v", "3", tmp],
      { timeout: 20_000 },
    );
    await rename(tmp, dest);
  } catch {
    await rm(tmp, { force: true });
  }
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

// Official YouTube poster for this watch URL. Not a frame from the stream.
async function writeYoutubeThumb(file: string, dest: string): Promise<string | null> {
  const id = youtubeId(file);
  if (!id) return null;
  await mkdir(stillDir, { recursive: true });
  for (const name of YOUTUBE_POSTERS) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}`, {
        headers: { Accept: "image/jpeg,image/*;q=0.8" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      if (type && !type.startsWith("image/")) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length < 2000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) continue;
      const size = jpegSize(bytes);
      const last = name === YOUTUBE_POSTERS[YOUTUBE_POSTERS.length - 1];
      if (size && size.width < 480 && size.height < 480 && !last) continue;
      await writeFile(dest, bytes);
      await trimBars(dest);
      return dest;
    } catch {
      /* try a smaller poster */
    }
  }
  await rm(dest, { force: true });
  return null;
}

// Matching YouTube poster, then a frame from the file.
async function writeLocalStill(file: string, dest: string): Promise<string | null> {
  const spec = posterQuery(file);
  const id = await exclusiveSearch(() => youtubeMatch(spec));
  if (id) {
    const poster = await writeYoutubeThumb(`https://www.youtube.com/watch?v=${id}`, dest);
    if (poster) return poster;
  }
  return writeFrame(file, dest);
}

// Replace this cached still. A borrowed filename with no match becomes a frame from the file.
export async function refreshFrame(file: string): Promise<string | null> {
  const dest = cachePath(file);
  const tmp = `${dest.slice(0, -4)}.new.jpg`;
  await mkdir(stillDir, { recursive: true });
  if (youtubeId(file)) {
    const poster = await writeYoutubeThumb(file, tmp);
    if (!poster) {
      await rm(tmp, { force: true });
      return null;
    }
    await rename(tmp, dest);
    return dest;
  }
  const spec = posterQuery(file);
  const id = await exclusiveSearch(() => youtubeMatch(spec));
  if (id) {
    const poster = await writeYoutubeThumb(`https://www.youtube.com/watch?v=${id}`, tmp);
    if (poster) {
      await rename(tmp, dest);
      return dest;
    }
  }
  await rm(tmp, { force: true });
  const frame = await writeFrame(file, tmp);
  if (!frame) {
    try {
      const info = await stat(dest);
      if (info.size > 100 && !spec.borrowed) return dest;
    } catch {
      /* no earlier poster */
    }
    await rm(dest, { force: true });
    return null;
  }
  await rename(tmp, dest);
  return dest;
}

// Use the cached still when it is there. Otherwise make one, and try once more if that fails.
async function loadFrame(file: string): Promise<string | null> {
  const dest = cachePath(file);
  const make = () => (youtubeId(file) ? writeYoutubeThumb(file, dest) : writeLocalStill(file, dest));
  try {
    try {
      const info = await stat(dest);
      if (info.size > 100) return dest;
      return await make();
    } catch {
      return await make();
    }
  } finally {
    pending.delete(file);
  }
}

// One cached still: a YouTube poster, or a local frame, or null.
export function frameOf(file: string): Promise<string | null> {
  const running = pending.get(file);
  if (running) return running;
  const job = loadFrame(file);
  pending.set(file, job);
  return job;
}
