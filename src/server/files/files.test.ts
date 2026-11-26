// The video name, and which files in a folder are videos.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { browse, isDir, isVideoFile, listVideos, suggestPaths, titleFromPath } from "./files.ts";

const dir = await mkdtemp(path.join(os.tmpdir(), "monjtv-"));
after(() => rm(dir, { recursive: true, force: true }));

describe("videos in a folder", () => {
  it("uses the filename without its extension", () => {
    assert.equal(titleFromPath("/films/Night.mkv"), "Night");
  });

  it("lists video files in episode order and skips anything else", async () => {
    const show = path.join(dir, "serial");
    await mkdir(path.join(show, "extra"), { recursive: true });
    await writeFile(path.join(show, "10.mkv"), "");
    await writeFile(path.join(show, "2.mkv"), "");
    await writeFile(path.join(show, "notes.txt"), "");
    await writeFile(path.join(show, ".hidden.mkv"), "");
    await writeFile(path.join(show, "extra", "3.mp4"), "");
    const videos = await listVideos(show);
    const names = videos.map((file) => path.basename(file));
    assert.deepEqual(
      names.filter((name) => name.endsWith(".mkv")),
      ["2.mkv", "10.mkv"],
    );
    assert.ok(names.includes("3.mp4"));
    assert.equal(names.includes("notes.txt"), false);
    assert.equal(names.includes(".hidden.mkv"), false);
  });
});

describe("the folder picker", () => {
  it("lists the folders and videos in one directory and skips hidden names", async () => {
    const library = path.join(dir, "library");
    await mkdir(path.join(library, "shows"), { recursive: true });
    await writeFile(path.join(library, "Night.mkv"), "");
    await writeFile(path.join(library, "notes.txt"), "");
    await writeFile(path.join(library, ".hidden.mkv"), "");
    const listed = await browse(library);
    assert.equal(listed.path, library);
    assert.equal(listed.parent, dir);
    assert.deepEqual(
      listed.dirs.map((entry) => entry.name),
      ["shows"],
    );
    assert.deepEqual(
      listed.videos.map((entry) => entry.name),
      ["Night.mkv"],
    );
    await assert.rejects(() => browse(path.join(library, "Night.mkv")));
  });

  it("continues a path being typed and suggests nothing for an empty one", async () => {
    const shows = path.join(dir, "library", "shows");
    await mkdir(path.join(shows, "serial"), { recursive: true });
    const hits = await suggestPaths(path.join(shows, "se"), "folder");
    assert.deepEqual(
      hits.dirs.map((entry) => entry.name),
      ["serial"],
    );
    assert.deepEqual(hits.videos, []);
    assert.deepEqual(await suggestPaths("  ", "folder"), { dirs: [], videos: [] });
    const videos = await suggestPaths(path.join(dir, "library", "Ni"), "video");
    assert.deepEqual(
      videos.videos.map((entry) => entry.name),
      ["Night.mkv"],
    );
  });

  it("recognises a video file and a directory", async () => {
    const file = path.join(dir, "library", "Night.mkv");
    const library = path.join(dir, "library");
    assert.equal(await isVideoFile(file), true);
    assert.equal(await isVideoFile(path.join(library, "notes.txt")), false);
    assert.equal(await isVideoFile(path.join(library, "missing.mkv")), false);
    assert.equal(await isDir(library), true);
    assert.equal(await isDir(file), false);
    assert.equal(await isDir(path.join(library, "missing")), false);
  });
});
