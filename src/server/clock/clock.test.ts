// Wall-clock arithmetic. The numbers are the clock contract, not a reading of the function.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateKey,
  formatHm,
  isHm,
  msUntil,
  nowSec,
  parseHm,
  weekday,
} from "./clock.ts";

describe("wall clock", () => {
  it("reads 17:12 as twelve minutes past five in the evening", () => {
    assert.equal(parseHm("17:12"), 17 * 3600 + 12 * 60);
  });

  it("rejects a clock that is not a time of day", () => {
    assert.throws(() => parseHm("24:00"));
    assert.throws(() => parseHm("17:60"));
  });

  it("formats a time past midnight as the morning clock", () => {
    assert.equal(formatHm(24 * 3600 + 60 * 60), "01:00");
    assert.equal(formatHm(26 * 3600 + 15 * 60), "02:15");
  });

  it("waits until tomorrow when the target is already earlier today", () => {
    const now = new Date(2026, 10, 26, 18, 0, 0, 0);
    const until = msUntil(17 * 3600 + 12 * 60, now);
    assert.equal(until, (23 * 60 + 12) * 60 * 1000);
  });

  it("names the weekday and the calendar date", () => {
    const thursday = new Date(2026, 10, 26, 17, 12, 5);
    assert.equal(weekday(thursday), "thu");
    assert.equal(weekday(new Date(2026, 10, 22, 12)), "sun");
    assert.equal(dateKey(thursday), "2026-11-26");
    assert.equal(nowSec(thursday), 17 * 3600 + 12 * 60 + 5);
  });

  it("accepts a time of day and rejects a clock that is not one", () => {
    assert.equal(isHm("00:00"), true);
    assert.equal(isHm("17:12"), true);
    assert.equal(isHm("23:59"), true);
    assert.equal(isHm("9:00"), false);
    assert.equal(isHm("24:00"), false);
    assert.equal(isHm("17:60"), false);
    assert.equal(isHm("17:12:00"), false);
  });
});
