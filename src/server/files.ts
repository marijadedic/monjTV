import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { VIDEO_EXT } from "../shared/constants.ts";
import type { BrowseResult } from "../shared/types.ts";

const MAX_DEPTH = 5;
const MAX_VIDEOS = 2000;
const execFileAsync = promisify(execFile);

// Filename without its extension.
export function titleFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

// Video files under a folder, sorted by path.
export async function listVideos(folder: string): Promise<string[]> {
  const out: string[] = [];
  await walk(folder, 0, out);
  out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  return out;
}

// Collect videos, stopping at the depth and count limits.
async function walk(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_VIDEOS) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, depth + 1, out);
    } else if (VIDEO_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
      if (out.length >= MAX_VIDEOS) return;
    }
  }
}

// Folders and videos in one directory, for the folder picker.
export async function browse(rawPath?: string): Promise<BrowseResult> {
  const resolved = path.resolve(rawPath && rawPath.length > 0 ? rawPath : os.homedir());
  let entries;
  try {
    entries = await readdir(resolved, { withFileTypes: true });
  } catch {
    throw new Error(`Cannot read folder: ${resolved}`);
  }

  const dirs: BrowseResult["dirs"] = [];
  const videos: BrowseResult["videos"] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(resolved, entry.name);
    if (entry.isDirectory()) {
      dirs.push({ name: entry.name, path: full });
    } else if (VIDEO_EXT.has(path.extname(entry.name).toLowerCase())) {
      videos.push({ name: entry.name, path: full });
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  videos.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const parent = path.dirname(resolved);
  return {
    path: resolved,
    parent: parent !== resolved ? parent : null,
    dirs,
    videos,
  };
}

type PickerFailure = "cancel" | "missing" | "error";

const SUGGEST_LIMIT = 12;

// Child folders that continue a path being typed.
export async function suggestFolders(raw: string): Promise<{ name: string; path: string }[]> {
  const typed = raw.trim();
  if (!typed) return [];
  const { dir, prefix } = splitTypedPath(typed);
  const dirs = await childDirs(dir);
  const needle = prefix.toLowerCase();
  let matches = needle ? dirs.filter((dir) => dir.name.toLowerCase().startsWith(needle)) : dirs;
  const exact =
    matches.length === 1 && matches[0]!.name.toLowerCase() === needle && !/[\\/]$/.test(typed);
  if (exact) {
    const nested = await childDirs(matches[0]!.path);
    if (nested.length > 0) matches = nested;
  }
  const current = typed.replace(/[\\/]+$/, "");
  return matches.filter((dir) => dir.path !== current).slice(0, SUGGEST_LIMIT);
}

// Directory to list, and the incomplete last segment.
function splitTypedPath(typed: string): { dir: string; prefix: string } {
  const slash = Math.max(typed.lastIndexOf("/"), typed.lastIndexOf("\\"));
  if (slash < 0) return { dir: os.homedir(), prefix: typed };
  const prefix = typed.slice(slash + 1);
  if (!prefix) return { dir: typed, prefix: "" };
  const dir = typed.slice(0, slash) || typed.slice(0, slash + 1);
  return { dir, prefix };
}

// Directories in one folder, skipping hidden names.
async function childDirs(dir: string): Promise<{ name: string; path: string }[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs: { name: string; path: string }[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || !entry.isDirectory()) continue;
    dirs.push({ name: entry.name, path: path.join(dir, entry.name) });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return dirs;
}

// Open the system folder picker and return the chosen path. Null when canceled.
export async function pickFolder(): Promise<string | null> {
  if (process.platform === "darwin") {
    return runPicker("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Choose a folder for this block")',
    ]);
  }
  if (process.platform === "linux") return pickOnLinux();
  throw new Error("The folder picker is only available on macOS and Linux.");
}

// Folder dialogs that print the chosen directory. First match on PATH wins.
function linuxPickers(): { bin: string; args: string[] }[] {
  const start = os.homedir();
  const filename = start.endsWith("/") ? start : `${start}/`;
  const title = "Choose a folder for this block";
  return [
    { bin: "zenity", args: ["--file-selection", "--directory", `--title=${title}`, `--filename=${filename}`] },
    { bin: "kdialog", args: ["--getexistingdirectory", start, title] },
    { bin: "qarma", args: ["--file-selection", "--directory", `--title=${title}`, `--filename=${filename}`] },
    { bin: "yad", args: ["--file", "--directory", `--title=${title}`, `--filename=${filename}`] },
  ];
}

// Open the first installed Linux folder dialog.
async function pickOnLinux(): Promise<string | null> {
  let sawPicker = false;
  let lastError: Error | null = null;
  for (const picker of linuxPickers()) {
    if (!(await onPath(picker.bin))) continue;
    sawPicker = true;
    try {
      return await runPicker(picker.bin, picker.args);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  if (!sawPicker) {
    throw new Error(
      "Type the folder path.",
    );
  }
  throw new Error(
    `Could not open a folder picker. Type the folder path.${lastError ? ` ${lastError.message}` : ""}`,
  );
}

// Run one picker. Null when the user cancels or the result is not a directory.
async function runPicker(bin: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(bin, args);
    const picked = cleanPicked(stdout);
    if (!picked || !(await isDir(picked))) return null;
    return picked;
  } catch (err) {
    if (classifyPickerError(err) === "cancel") return null;
    throw err instanceof Error ? err : new Error(String(err));
  }
}

// True when bin is an executable somewhere on PATH.
async function onPath(bin: string): Promise<boolean> {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    try {
      await access(path.join(dir, bin), constants.X_OK);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

// A local directory path from picker stdout.
function cleanPicked(stdout: string): string {
  let picked = stdout.trim();
  if (picked.startsWith("file://")) {
    try {
      picked = decodeURIComponent(picked.slice("file://".length));
    } catch {
      picked = picked.slice("file://".length);
    }
  }
  if (picked.length > 1) picked = picked.replace(/\/+$/, "");
  return picked;
}

// Cancel, a missing binary, or a real failure.
function classifyPickerError(err: unknown): PickerFailure {
  const record =
    err && typeof err === "object" ? (err as { code?: unknown; stderr?: unknown }) : {};
  if (record.code === "ENOENT") return "missing";
  const stderr = typeof record.stderr === "string" ? record.stderr : "";
  const message = err instanceof Error ? err.message : String(err);
  const text = `${message}\n${stderr}`;
  if (/user canceled|user cancelled|-128/i.test(text)) return "cancel";
  if (/cannot open display|no display/i.test(text)) return "error";
  if (record.code === 1 || record.code === 252) return "cancel";
  return "error";
}

// True when the path is a directory.
export async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
