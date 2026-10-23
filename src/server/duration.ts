import { execFile } from "node:child_process";
import { open, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { durationsPath } from "./paths.ts";
import { readJson, writeJson } from "./store.ts";

const execFileAsync = promisify(execFile);
// Length used when the file is missing or its duration cannot be read. Not saved.
const FALLBACK_SEC = 45 * 60;
// How far into a Matroska segment to look for Info before the picture data.
const HEADER_SCAN = 32 * 1024 * 1024;
// A Pi 5 has four cores, and mpv may be playing. Two probes leave a core free.
const AT_ONCE = 2;
// Linux probes run under nice so mpv keeps the core. Turned off when nice is missing.
let niceProbe = process.platform === "linux";

type Saved = { size: number; mtimeMs: number; durationSec: number };
type DiskCache = Record<string, Saved>;

const memory = new Map<string, number>();
const inflight = new Map<string, Promise<number>>();
let disk: DiskCache | null = null;
let loading: Promise<DiskCache> | null = null;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Memory key of path, size, and mtime. A moved file is a different key.
function cacheKey(file: string, size: number, mtimeMs: number): string {
  return `${file}\0${size}\0${mtimeMs}`;
}

// Raised when a folder measure is no longer needed.
function abortError(): Error {
  const err = new Error("The measure was cancelled");
  err.name = "AbortError";
  return err;
}

// Load the duration cache, or an empty one when the file is missing.
async function loadDisk(): Promise<DiskCache> {
  if (disk) return disk;
  if (!loading) {
    loading = readJson<DiskCache>(durationsPath, {}).then((value) => {
      disk = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      return disk;
    });
  }
  return loading;
}

// Write durations.json shortly after a length changes. Old paths stay in the file.
function scheduleSave(): void {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty || !disk) return;
    dirty = false;
    const snapshot = { ...disk };
    void writeJson(durationsPath, snapshot).catch(() => {
      dirty = true;
    });
  }, 200);
}

// Store a measured length for this path. A missing file is not written here.
function remember(file: string, size: number, mtimeMs: number, durationSec: number): void {
  memory.set(cacheKey(file, size, mtimeMs), durationSec);
  if (!disk) disk = {};
  const prev = disk[file];
  if (prev && prev.size === size && prev.mtimeMs === mtimeMs && prev.durationSec === durationSec) return;
  disk[file] = { size, mtimeMs, durationSec };
  scheduleSave();
}

// Saved length when this path's size and mtime still match.
function savedDuration(file: string, size: number, mtimeMs: number): number | null {
  const saved = disk?.[file];
  if (!saved || saved.size !== size || saved.mtimeMs !== mtimeMs) return null;
  if (typeof saved.durationSec !== "number" || !(saved.durationSec > 1)) return null;
  return saved.durationSec;
}

// Video length in seconds. A saved length applies only when the path, size, and mtime still match.
export async function probeDuration(file: string): Promise<number> {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return FALLBACK_SEC;
  const mtimeMs = Math.round(info.mtimeMs);
  const key = cacheKey(file, info.size, mtimeMs);
  const hit = memory.get(key);
  if (hit) return hit;

  await loadDisk();
  const saved = savedDuration(file, info.size, mtimeMs);
  if (saved) {
    memory.set(key, saved);
    return saved;
  }

  const pending = inflight.get(key);
  if (pending) return pending;
  const job = measure(file)
    .then((seconds) => {
      if (seconds == null) {
        memory.set(key, FALLBACK_SEC);
        return FALLBACK_SEC;
      }
      const rounded = Math.round(seconds);
      remember(file, info.size, mtimeMs, rounded);
      return rounded;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, job);
  return job;
}

// Lengths for many files, two at a time. Stops taking new files when the signal aborts.
export async function probeDurations(
  files: string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (files.length === 0) return out;
  let next = 0;
  let stop = false;
  const workers = Math.min(AT_ONCE, files.length);
  async function run(): Promise<void> {
    while (!stop && next < files.length) {
      if (signal?.aborted) {
        stop = true;
        throw abortError();
      }
      const file = files[next];
      next += 1;
      if (!file) return;
      out.set(file, await probeDuration(file));
    }
  }
  await Promise.all(Array.from({ length: workers }, () => run()));
  return out;
}

// Header length when the container stores one, otherwise ffprobe.
async function measure(file: string): Promise<number | null> {
  const fromHeader = await headerDuration(file).catch(() => null);
  if (fromHeader && fromHeader > 1) return fromHeader;
  return ffprobeDuration(file);
}

// Length from ffprobe when the container header has none.
async function ffprobeDuration(file: string): Promise<number | null> {
  const args = [
    "-v",
    "error",
    "-threads",
    "1",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ];
  try {
    const n = Number.parseFloat((await runFfprobe(args)).trim());
    if (Number.isFinite(n) && n > 1) return n;
  } catch {
    // ffprobe missing or file unreadable
  }
  return null;
}

// One ffprobe, niced on Linux so playback keeps the core.
async function runFfprobe(args: string[]): Promise<string> {
  const command = niceProbe ? "nice" : "ffprobe";
  const commandArgs = niceProbe ? ["-n", "19", "ffprobe", ...args] : args;
  try {
    const { stdout } = await execFileAsync(command, commandArgs, { timeout: 15_000 });
    return stdout;
  } catch (err) {
    if (!niceProbe || !missingCommand(err)) throw err;
    niceProbe = false;
    const { stdout } = await execFileAsync("ffprobe", args, { timeout: 15_000 });
    return stdout;
  }
}

// True when the command is not installed.
function missingCommand(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

// Length stored in an mp4 or Matroska header.
async function headerDuration(file: string): Promise<number | null> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".mkv" || ext === ".webm") return matroskaDuration(file);
  if (ext === ".mp4" || ext === ".m4v" || ext === ".mov") return mp4Duration(file);
  return null;
}

// Bytes at a position in an open file.
async function readAt(fh: FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

type Atom = { type: string; headerLen: number; size: number };

// Size and type of one ISO BMFF atom.
function atomOf(buf: Buffer, parentEnd: number, offset: number): Atom | null {
  if (buf.length < 8) return null;
  let size = buf.readUInt32BE(0);
  const type = buf.toString("latin1", 4, 8);
  let headerLen = 8;
  if (size === 1) {
    if (buf.length < 16) return null;
    size = Number(buf.readBigUInt64BE(8));
    headerLen = 16;
  } else if (size === 0) {
    size = parentEnd - offset;
  }
  if (!Number.isSafeInteger(size) || size < headerLen) return null;
  return { type, headerLen, size };
}

// Seconds from an mvhd or mehd atom. Fragmented files often store 0 here.
async function mp4Duration(file: string): Promise<number | null> {
  const fh = await open(file, "r");
  try {
    const info = await fh.stat();
    let offset = 0;
    let guard = 0;
    while (offset + 8 <= info.size && guard < 64) {
      guard += 1;
      const atom = atomOf(await readAt(fh, offset, 16), info.size, offset);
      if (!atom) return null;
      if (atom.type === "moov") {
        return await moovDuration(fh, offset + atom.headerLen, offset + atom.size);
      }
      const next = offset + atom.size;
      if (next <= offset || next > info.size) return null;
      offset = next;
    }
    return null;
  } finally {
    await fh.close();
  }
}

// Seconds from the movie header inside moov.
async function moovDuration(fh: FileHandle, start: number, end: number): Promise<number | null> {
  let offset = start;
  let scale = 0;
  let ticks = 0;
  let mehdTicks = 0;
  let guard = 0;
  while (offset + 8 <= end && guard < 256) {
    guard += 1;
    const atom = atomOf(await readAt(fh, offset, 16), end, offset);
    if (!atom) break;
    const body = offset + atom.headerLen;
    if (atom.type === "mvhd") {
      const parsed = mvhdOf(await readAt(fh, body, 32));
      if (parsed) {
        scale = parsed.scale;
        ticks = parsed.ticks;
      }
    } else if (atom.type === "mvex") {
      mehdTicks = (await mehdTicksOf(fh, body, offset + atom.size)) || mehdTicks;
    }
    const next = offset + atom.size;
    if (next <= offset || next > end) break;
    offset = next;
  }
  if (scale > 0 && ticks > scale) return ticks / scale;
  if (scale > 0 && mehdTicks > scale) return mehdTicks / scale;
  return null;
}

// Timescale and duration ticks from an mvhd body.
function mvhdOf(body: Buffer): { scale: number; ticks: number } | null {
  if (body.length < 20) return null;
  const version = body[0];
  if (version === 0) return { scale: body.readUInt32BE(12), ticks: body.readUInt32BE(16) };
  if (version === 1 && body.length >= 32) {
    return { scale: body.readUInt32BE(20), ticks: Number(body.readBigUInt64BE(24)) };
  }
  return null;
}

// Duration ticks from a fragmented movie's mehd atom.
async function mehdTicksOf(fh: FileHandle, start: number, end: number): Promise<number> {
  let offset = start;
  let guard = 0;
  while (offset + 8 <= end && guard < 32) {
    guard += 1;
    const atom = atomOf(await readAt(fh, offset, 16), end, offset);
    if (!atom) return 0;
    if (atom.type === "mehd") {
      const body = await readAt(fh, offset + atom.headerLen, 12);
      if (body.length < 8) return 0;
      if (body[0] === 1 && body.length >= 12) return Number(body.readBigUInt64BE(4));
      return body.readUInt32BE(4);
    }
    const next = offset + atom.size;
    if (next <= offset || next > end) return 0;
    offset = next;
  }
  return 0;
}

// Matroska element ids used to find Duration without reading picture data.
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const CLUSTER = 0x1f43b675;
const SCALE = 0x2ad7b1;
const DURATION = 0x4489;

type Element = { id: number; data: number; size: number; unknown: boolean };

// Element id and its width at this offset.
function ebmlId(buf: Buffer, offset: number): { id: number; len: number } | null {
  if (offset >= buf.length || buf[offset] === 0) return null;
  const first = buf[offset]!;
  let len = 1;
  let mask = 0x80;
  while (len <= 4 && (first & mask) === 0) {
    len += 1;
    mask >>= 1;
  }
  if (len > 4 || offset + len > buf.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + buf[offset + i]!;
  return { id, len };
}

// Element size and its width. Unknown means the size runs to the parent end.
function ebmlSize(buf: Buffer, offset: number): { value: number; len: number; unknown: boolean } | null {
  if (offset >= buf.length || buf[offset] === 0) return null;
  const first = buf[offset]!;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && (first & mask) === 0) {
    len += 1;
    mask >>= 1;
  }
  if (len > 8 || offset + len > buf.length) return null;
  const dataMask = len >= 8 ? 0 : (1 << (8 - len)) - 1;
  let value = first & dataMask;
  for (let i = 1; i < len; i++) value = value * 256 + buf[offset + i]!;
  if (!Number.isSafeInteger(value)) return null;
  const bits = 7 * len;
  const unknown = bits < 53 && value === 2 ** bits - 1;
  return { value, len, unknown };
}

// Next Matroska element header at this offset.
async function readElement(fh: FileHandle, offset: number): Promise<Element | null> {
  const buf = await readAt(fh, offset, 16);
  const id = ebmlId(buf, 0);
  if (!id) return null;
  const size = ebmlSize(buf, id.len);
  if (!size) return null;
  return { id: id.id, data: offset + id.len + size.len, size: size.value, unknown: size.unknown };
}

// Seconds from the Matroska Info element. Stops before the picture data.
async function matroskaDuration(file: string): Promise<number | null> {
  const fh = await open(file, "r");
  try {
    const info = await fh.stat();
    let offset = 0;
    let guard = 0;
    const limit = Math.min(info.size, 1024 * 1024);
    while (offset + 2 < limit && guard < 32) {
      guard += 1;
      const el = await readElement(fh, offset);
      if (!el) return null;
      if (el.id === SEGMENT) {
        const end = el.unknown ? info.size : Math.min(info.size, el.data + el.size);
        return await segmentDuration(fh, el.data, end);
      }
      if (el.unknown) return null;
      const next = el.data + el.size;
      if (next <= offset || next > info.size) return null;
      offset = next;
    }
    return null;
  } finally {
    await fh.close();
  }
}

// Seconds from the Info element, stopping at the first cluster.
async function segmentDuration(fh: FileHandle, start: number, end: number): Promise<number | null> {
  let offset = start;
  const limit = Math.min(end, start + HEADER_SCAN);
  let guard = 0;
  while (offset + 2 <= limit && guard < 10_000) {
    guard += 1;
    const el = await readElement(fh, offset);
    if (!el) return null;
    if (el.id === CLUSTER) return null;
    if (el.id === INFO) {
      const body = await readAt(fh, el.data, Math.min(el.size, 64 * 1024));
      return infoDuration(body);
    }
    if (el.unknown) return null;
    const next = el.data + el.size;
    if (next <= offset) return null;
    offset = next;
  }
  return null;
}

// Seconds from TimecodeScale and Duration in an Info body.
function infoDuration(buf: Buffer): number | null {
  let offset = 0;
  let scale = 1_000_000;
  let duration: number | null = null;
  while (offset + 2 <= buf.length) {
    const id = ebmlId(buf, offset);
    if (!id) break;
    const size = ebmlSize(buf, offset + id.len);
    if (!size || size.unknown) break;
    const data = offset + id.len + size.len;
    const next = data + size.value;
    if (next > buf.length || next <= offset) break;
    if (id.id === SCALE) {
      let n = 0;
      for (let i = data; i < next; i++) n = n * 256 + buf[i]!;
      if (n > 0) scale = n;
    } else if (id.id === DURATION && (size.value === 4 || size.value === 8)) {
      duration = size.value === 4 ? buf.readFloatBE(data) : buf.readDoubleBE(data);
    }
    offset = next;
  }
  if (duration == null || scale <= 0) return null;
  return (duration * scale) / 1e9;
}
