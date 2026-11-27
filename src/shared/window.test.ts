// Whether a row is still ahead, on now, or already over.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  itemCoversNow,
  itemHasPassed,
  itemProgress,
  itemStartsLater,
  lengthMinutes,
  nextDay,
  prevDay,
  segmentsOf,
} from "./window.ts";

const film = {
  start: "18:00",
  durationSec: 60 * 60,
};

describe("a file's place on the clock", () => {
  it("is still ahead only when it is planned and its start is later", () => {
    assert.equal(itemStartsLater(film, 17 * 3600), true);
    assert.equal(itemStartsLater(film, 18 * 3600), false);
    assert.equal(
      itemStartsLater({ ...film, status: "playing" }, 17 * 3600),
      false,
    );
    assert.equal(
      itemStartsLater({ ...film, status: "done" }, 17 * 3600),
      false,
    );
  });

  it("does not treat a film that started yesterday as still ahead", () => {
    const overnight = {
      start: "22:00",
      durationSec: 3 * 3600,
      overnight: true,
      status: "planned",
    };
    assert.equal(itemStartsLater(overnight, 30 * 60), false);
  });

  it("has passed when it is done, skipped, or its window has ended", () => {
    assert.equal(
      itemHasPassed({ ...film, status: "done" }, 18 * 3600 + 30 * 60),
      true,
    );
    assert.equal(
      itemHasPassed({ ...film, status: "skipped" }, 17 * 3600),
      true,
    );
    assert.equal(itemHasPassed(film, 19 * 3600), true);
  });

  it("has not passed while it is on screen or still ahead", () => {
    assert.equal(
      itemHasPassed({ ...film, status: "playing" }, 20 * 3600),
      false,
    );
    assert.equal(itemHasPassed(film, 18 * 3600 + 30 * 60), false);
    assert.equal(itemHasPassed(film, 17 * 3600), false);
  });
});

describe("a slot's length on the clock", () => {
  it("uses the stored length, and the clock window when none is stored", () => {
    assert.equal(
      lengthMinutes({ start: "18:00", end: "19:00", lengthMin: 90 }),
      90,
    );
    assert.equal(lengthMinutes({ start: "18:00", end: "20:00" }), 120);
    assert.equal(lengthMinutes({ start: "22:00", end: "01:00" }), 180);
  });

  it("puts the part after midnight on the next day, starting at 00:00", () => {
    assert.equal(nextDay("sun"), "mon");
    assert.equal(prevDay("mon"), "sun");
    const late = {
      id: "late",
      days: ["mon" as const],
      start: "22:00",
      end: "01:00",
      folder: "/films",
      mode: "specific-file" as const,
    };
    assert.deepEqual(segmentsOf(late), [
      { day: "mon", start: 22 * 60, end: 24 * 60 },
      { day: "tue", start: 0, end: 60 },
    ]);
  });

  it("reports how far the clock is through the file", () => {
    const film = { start: "18:00", durationSec: 2 * 3600 };
    assert.equal(itemProgress(film, 18 * 3600), 0);
    assert.equal(itemProgress(film, 19 * 3600), 0.5);
    assert.equal(itemProgress(film, 21 * 3600), 1);
    assert.equal(itemProgress({ ...film, durationSec: 0 }, 19 * 3600), 0);
    const overnight = { start: "00:10", durationSec: 20 * 60, overnight: true };
    assert.equal(itemCoversNow(overnight, 15 * 60), true);
    assert.equal(itemCoversNow(overnight, 40 * 60), false);
  });
});
