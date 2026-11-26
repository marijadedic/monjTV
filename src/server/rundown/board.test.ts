// The week shown on the TV schedule: yesterday through six days ahead.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateKey } from "../clock/clock.ts";
import { shiftDateKey } from "../../shared/dates.ts";
import { clearBuilding, markBuilding, noteSaveMisses } from "./lock.ts";
import { presentBoard } from "./board.ts";

describe("the week on the TV schedule", () => {
  it("keeps yesterday through six days ahead and drops anything older", () => {
    const today = dateKey();
    const shown = presentBoard({
      carriedInto: today,
      days: [
        { date: shiftDateKey(today, -2), items: [] },
        { date: shiftDateKey(today, -1), items: [] },
        { date: shiftDateKey(today, 6), items: [] },
        { date: shiftDateKey(today, 7), items: [] },
      ],
    });
    const dates = shown.days.map((day) => day.date);
    assert.equal(shown.today, today);
    assert.equal(dates.includes(shiftDateKey(today, -2)), false);
    assert.equal(dates.includes(shiftDateKey(today, 7)), false);
    assert.ok(dates.includes(shiftDateKey(today, -1)));
    assert.ok(dates.includes(today));
    assert.ok(dates.includes(shiftDateKey(today, 6)));
  });

  it("shows the spinner and the latest fit warning", () => {
    markBuilding(["evening"]);
    noteSaveMisses([
      { blockId: "film", kind: "video", title: "Night", durationSec: 3 * 3600, limitSec: 3600 },
    ]);
    const shown = presentBoard({ carriedInto: dateKey(), days: [] });
    assert.deepEqual(shown.building, ["evening"]);
    assert.equal(shown.misses?.[0]?.title, "Night");
    clearBuilding();
    noteSaveMisses([]);
  });
});
