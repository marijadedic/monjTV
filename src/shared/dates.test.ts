// Calendar dates stay on the civil day, including across a month boundary.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateOffset, shiftDateKey, weekdayOfKey } from "./dates.ts";

describe("a calendar date", () => {
  it("counts whole days, including into the next month", () => {
    assert.equal(dateOffset("2026-11-26", "2026-12-02"), 6);
    assert.equal(dateOffset("2026-11-26", "2026-11-24"), -2);
    assert.equal(shiftDateKey("2026-11-26", 6), "2026-12-02");
  });

  it("names the weekday of that date", () => {
    assert.equal(weekdayOfKey("2026-11-26"), "thu");
    assert.equal(weekdayOfKey("2026-11-22"), "sun");
  });
});
