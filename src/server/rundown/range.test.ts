// Yesterday through six days ahead.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shiftDateKey } from "../../shared/dates.ts";
import type { BoardFile } from "./boardFile.ts";
import { inWindow, windowReady } from "./range.ts";

const today = "2026-11-26";

function span(from: number, to: number): BoardFile {
  const days = [];
  for (let offset = from; offset <= to; offset++) {
    days.push({ date: shiftDateKey(today, offset), items: [] });
  }
  return { carriedInto: today, days };
}

describe("the TV schedule window", () => {
  it("keeps yesterday through six days ahead", () => {
    assert.equal(inWindow(today, shiftDateKey(today, -1)), true);
    assert.equal(inWindow(today, today), true);
    assert.equal(inWindow(today, shiftDateKey(today, 6)), true);
  });

  it("drops a day older than yesterday, and the day after six days ahead", () => {
    assert.equal(inWindow(today, shiftDateKey(today, -2)), false);
    assert.equal(inWindow(today, shiftDateKey(today, 7)), false);
  });

  it("is ready when every date in that span is saved", () => {
    assert.equal(windowReady(span(-1, 6), today, true), true);
  });

  it("is not ready when one of those dates is missing", () => {
    const board = span(-1, 6);
    board.days = board.days.filter(
      (day) => day.date !== shiftDateKey(today, 6),
    );
    assert.equal(windowReady(board, today, true), false);
  });

  it("is not ready when a day older than yesterday is still on the week", () => {
    const board = span(-1, 6);
    board.days.push({ date: shiftDateKey(today, -2), items: [] });
    assert.equal(windowReady(board, today, true), false);
  });

  it("is ready for today alone when later days are not being filled", () => {
    assert.equal(
      windowReady(
        { carriedInto: today, days: [{ date: today, items: [] }] },
        today,
        false,
      ),
      true,
    );
  });

  it("is not ready when the saved week was built for another day", () => {
    const board = span(-1, 6);
    board.carriedInto = shiftDateKey(today, -1);
    assert.equal(windowReady(board, today, true), false);
  });
});
