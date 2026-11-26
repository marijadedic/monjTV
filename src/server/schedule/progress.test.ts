// A finished random pass, and the play that opens the next one.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noteRandom, rememberRandom } from "./progress.ts";

const movie = (name: string) => `/films/${name}.mkv`;
const files = [movie("a"), movie("b")];

describe("recently played", () => {
  it("adds a movie to recently played, newest first", () => {
    assert.deepEqual(noteRandom([movie("a")], movie("b")), [movie("b"), movie("a")]);
  });

  it("keeps every file when the pass finishes", () => {
    assert.deepEqual(rememberRandom([movie("a")], movie("b"), files), [movie("b"), movie("a")]);
  });

  it("opens a new pass on the play after every file has been used", () => {
    assert.deepEqual(rememberRandom([movie("b"), movie("a")], movie("a"), files), [movie("a")]);
  });
});
