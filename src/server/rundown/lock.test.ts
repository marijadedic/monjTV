// One board write at a time, and the spinner while a save is still timing slots.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearBuilding,
  exclusive,
  listedBuildingIds,
  listedSaveMisses,
  markBuilding,
  noteSaveMisses,
  stillBuilding,
} from "./lock.ts";

describe("a save times its slots without dropping another write", () => {
  it("runs the next write only after the previous one finishes", async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = exclusive(async () => {
      order.push("first");
      await gate;
      return "first";
    });
    const second = exclusive(async () => {
      order.push("second");
      return "second";
    });
    await Promise.resolve();
    assert.deepEqual(order, ["first"]);
    releaseFirst();
    assert.equal(await first, "first");
    assert.equal(await second, "second");
    assert.deepEqual(order, ["first", "second"]);
  });

  it("still runs the next write when the previous one failed", async () => {
    const failed = exclusive(async () => {
      throw new Error("disk");
    });
    const next = exclusive(async () => "kept");
    await assert.rejects(failed);
    assert.equal(await next, "kept");
  });
});

describe("the week spinner and the fit warning", () => {
  it("shows a spinner while slots are still being timed", () => {
    markBuilding(["evening", "late"]);
    assert.equal(stillBuilding(), true);
    assert.deepEqual(new Set(listedBuildingIds()), new Set(["evening", "late"]));
    clearBuilding();
    assert.equal(stillBuilding(), false);
    assert.deepEqual(listedBuildingIds(), []);
  });

  it("shows no spinner when nothing is left to time", () => {
    markBuilding([]);
    assert.equal(stillBuilding(), false);
  });

  it("replaces the fit warnings and marks the check finished, including an empty list", () => {
    const before = listedSaveMisses().missToken;
    noteSaveMisses([
      { blockId: "film", kind: "video", title: "Night", durationSec: 3 * 3600, limitSec: 2 * 3600 },
    ]);
    const warned = listedSaveMisses();
    assert.equal(warned.missToken, before + 1);
    assert.equal(warned.misses[0]?.title, "Night");
    noteSaveMisses([]);
    const cleared = listedSaveMisses();
    assert.equal(cleared.missToken, before + 2);
    assert.deepEqual(cleared.misses, []);
  });
});
