// A row's title. A local file uses its name. An uncached YouTube video uses its link.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameOf } from "./media.ts";

describe("a file's name", () => {
  it("uses the filename of a local video", () => {
    assert.equal(nameOf("/films/Night.mkv"), "Night");
  });

  it("names an uncached YouTube video from its link", () => {
    assert.equal(nameOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "YouTube · dQw4w9WgXcQ");
  });
});
