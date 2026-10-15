import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VIDEO_EXT } from "../shared/constants.ts";
import type { BrowseResult } from "../shared/types.ts";

const MAX_DEPTH = 5;
const MAX_VIDEOS = 2000;

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

// True when the path is a directory.
export async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
