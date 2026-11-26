// Episode order and a random pass. One eligible file makes the pick determined.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { noteRandom } from "../schedule/progress.ts";
import { episodePaths, nextEpisode, otherFolderPlays, pick, takeRandom, videosIn } from "./picker.ts";

const episode = (name: string) => `/shows/serial/${name}.mkv`;
const movie = (name: string) => `/films/${name}.mkv`;

describe("next episode walks the folder", () => {
  const files = [episode("01"), episode("02"), episode("03")];

  it("starts at the first file when nothing in the folder has finished", () => {
    assert.equal(nextEpisode(files), episode("01"));
    assert.equal(nextEpisode(files, "/shows/serial/missing.mkv"), episode("01"));
  });

  it("plays the file after the last completed one", () => {
    assert.equal(nextEpisode(files, episode("01")), episode("02"));
  });

  it("wraps to the first file after the last one", () => {
    assert.equal(nextEpisode(files, episode("03")), episode("01"));
  });

  it("has nothing to play from an empty folder", () => {
    assert.equal(nextEpisode([]), null);
  });
});

describe("a random folder plays each file once", () => {
  const files = [movie("a"), movie("b"), movie("c")];

  it("skips a file already played this pass while another is still waiting", () => {
    const pick = takeRandom([movie("a"), movie("b")], [movie("a")]);
    assert.equal(pick?.path, movie("b"));
  });

  it("skips a file already used from another folder while this folder still has another", () => {
    const pick = takeRandom(files, [], { avoid: [movie("a"), movie("b")] });
    assert.equal(pick?.path, movie("c"));
  });

  it("plays the only file even when another folder already used it", () => {
    const only = [movie("a")];
    const pick = takeRandom(only, [], { avoid: [movie("a")] });
    assert.equal(pick?.path, movie("a"));
  });

  it("skips a file that does not fit and places another that does", () => {
    const pick = takeRandom(files, [], { block: [movie("a"), movie("b")] });
    assert.equal(pick?.path, movie("c"));
  });

  it("places nothing when every file that is left does not fit", () => {
    assert.equal(takeRandom(files, [], { block: files }), null);
  });

  it("starts again and leaves out the file just used", () => {
    let recent: string[] = [];
    for (const name of ["c", "b", "a"]) recent = noteRandom(recent, movie(name));
    const pick = takeRandom(files, recent, { block: [movie("c")] });
    assert.equal(pick?.path, movie("b"));
    assert.deepEqual(pick?.recent, [movie("b")]);
  });

  it("leaves out the file just used even when every file was also used elsewhere", () => {
    let recent: string[] = [];
    recent = noteRandom(recent, movie("b"));
    recent = noteRandom(recent, movie("a"));
    const pick = takeRandom([movie("a"), movie("b")], recent, { avoid: [movie("a"), movie("b")] });
    assert.equal(pick?.path, movie("b"));
  });

  it("plays a one-file folder again once that file has already been used", () => {
    const pick = takeRandom([movie("a")], [movie("a")]);
    assert.equal(pick?.path, movie("a"));
    assert.deepEqual(pick?.recent, [movie("a")]);
  });

  it("names files remembered under other folders", () => {
    const held = otherFolderPlays(
      {
        "/films": [movie("a")],
        "/shows/other": [episode("01"), movie("b")],
      },
      "/films",
    );
    assert.deepEqual(new Set(held), new Set([episode("01"), movie("b")]));
  });
});

describe("a chosen local file", () => {
  let dir = "";
  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "monjtv-"));
  });
  after(() => rm(dir, { recursive: true, force: true }));

  it("walks the video files in episode order", async () => {
    const show = path.join(dir, "serial");
    await mkdir(show, { recursive: true });
    await writeFile(path.join(show, "10.mkv"), "");
    await writeFile(path.join(show, "2.mkv"), "");
    const listed = await videosIn(show);
    assert.deepEqual(
      listed.map((file) => path.basename(file)),
      ["2.mkv", "10.mkv"],
    );
    assert.deepEqual(await episodePaths(show), listed);
  });

  it("plays that file, or one YouTube video", async () => {
    const file = path.join(dir, "Night.mkv");
    await writeFile(file, "");
    assert.equal(await pick({ folder: dir, mode: "specific-file", file }), file);
    assert.equal(await pick({ folder: dir, mode: "specific-file", file: path.join(dir, "missing.mkv") }), null);
    assert.equal(
      await pick({ folder: "", mode: "specific-file", file: "https://youtu.be/dQw4w9WgXcQ" }),
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
});
