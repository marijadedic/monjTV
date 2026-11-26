// A row's title, and the files a local folder walks.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { nameOf, seriesFiles, tryLength } from "./media.ts";

describe("a file's name", () => {
  it("uses the filename of a local video", () => {
    assert.equal(nameOf("/films/Night.mkv"), "Night");
  });

  it("names an uncached YouTube video from its link", () => {
    assert.equal(nameOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "YouTube · dQw4w9WgXcQ");
  });
});

describe("files in a local folder", () => {
  let dir = "";
  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "monjtv-"));
  });
  after(() => rm(dir, { recursive: true, force: true }));

  it("walks the videos in episode order", async () => {
    const show = path.join(dir, "serial");
    await mkdir(show, { recursive: true });
    await writeFile(path.join(show, "10.mkv"), "");
    await writeFile(path.join(show, "2.mkv"), "");
    const files = await seriesFiles(show);
    assert.deepEqual(
      files.map((file) => path.basename(file)),
      ["2.mkv", "10.mkv"],
    );
  });

  it("still has a stand-in length when the file cannot be timed", async () => {
    const length = await tryLength(path.join(dir, "missing.mkv"));
    assert.equal(typeof length, "number");
    assert.ok(length && length > 0);
  });
});
