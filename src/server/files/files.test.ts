// The video name, and which files in a folder are videos.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { listVideos, titleFromPath } from "./files.ts";

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
