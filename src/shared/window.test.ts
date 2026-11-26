// Whether a row is still ahead, on now, or already over.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { itemHasPassed, itemStartsLater } from "./window.ts";

const film = {
  start: "18:00",
  durationSec: 60 * 60,
};

describe("a file's place on the clock", () => {
  it("is still ahead only when it is planned and its start is later", () => {
    assert.equal(itemStartsLater(film, 17 * 3600), true);
    assert.equal(itemStartsLater(film, 18 * 3600), false);
    assert.equal(itemStartsLater({ ...film, status: "playing" }, 17 * 3600), false);
    assert.equal(itemStartsLater({ ...film, status: "done" }, 17 * 3600), false);
  });

  it("does not treat a film that started yesterday as still ahead", () => {
    const overnight = { start: "22:00", durationSec: 3 * 3600, overnight: true, status: "planned" };
    assert.equal(itemStartsLater(overnight, 30 * 60), false);
  });

  it("has passed when it is done, skipped, or its window has ended", () => {
    assert.equal(itemHasPassed({ ...film, status: "done" }, 18 * 3600 + 30 * 60), true);
    assert.equal(itemHasPassed({ ...film, status: "skipped" }, 17 * 3600), true);
    assert.equal(itemHasPassed(film, 19 * 3600), true);
  });

  it("has not passed while it is on screen or still ahead", () => {
    assert.equal(itemHasPassed({ ...film, status: "playing" }, 20 * 3600), false);
    assert.equal(itemHasPassed(film, 18 * 3600 + 30 * 60), false);
    assert.equal(itemHasPassed(film, 17 * 3600), false);
  });
});
