// What a placed day counts as already chosen for the rest of the week.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Progress } from "../../shared/types.ts";
import { nextEpisode } from "../files/picker.ts";
import { block, row, week } from "../test/block.ts";
import { notePicks } from "./picks.ts";

const folder = "/shows/serial";
const episode = (name: string) => `${folder}/${name}.mkv`;
const files = [episode("01"), episode("02"), episode("03")];
const show = block({ id: "serial", folder, days: ["mon", "tue"] });

function emptyProgress(): Progress {
  return { lastCompleted: {}, recentRandom: {} };
}

describe("later airings follow the episode this day used", () => {
  it("does not change the progress it was given", () => {
    const progress = emptyProgress();
    const saved = structuredClone(progress);
    notePicks(
      progress,
      [
        row({
          blockId: "serial",
          path: episode("01"),
          mode: "next-episode",
          folder,
          start: "18:00",
        }),
      ],
      week([show]),
    );
    assert.deepEqual(progress, saved);
  });

  it("gives the next slot the following episode", () => {
    const noted = notePicks(
      emptyProgress(),
      [
        row({
          blockId: "serial",
          path: episode("01"),
          mode: "next-episode",
          folder,
          start: "18:00",
        }),
      ],
      week([show]),
    );
    assert.equal(
      nextEpisode(files, noted.lastCompleted[folder]),
      episode("02"),
    );
  });

  it("plays two slots of the same show on one day as consecutive episodes", () => {
    const noted = notePicks(
      emptyProgress(),
      [
        row({
          blockId: "serial",
          path: episode("01"),
          mode: "next-episode",
          folder,
          start: "18:00",
        }),
        row({
          blockId: "serial",
          path: episode("02"),
          mode: "next-episode",
          folder,
          start: "20:00",
        }),
      ],
      week([show]),
    );
    assert.equal(noted.lastCompleted[folder], episode("02"));
    assert.equal(
      nextEpisode(files, noted.lastCompleted[folder]),
      episode("03"),
    );
  });

  it("does not use up an episode that was skipped", () => {
    const noted = notePicks(
      emptyProgress(),
      [
        row({
          blockId: "serial",
          path: episode("01"),
          mode: "next-episode",
          folder,
          start: "18:00",
          status: "skipped",
        }),
      ],
      week([show]),
    );
    assert.equal(noted.lastCompleted[folder], undefined);
    assert.equal(
      nextEpisode(files, noted.lastCompleted[folder]),
      episode("01"),
    );
  });

  it("leaves yesterday's leftover out of the episode this day completed", () => {
    const leftover = row({
      blockId: "serial",
      path: episode("01"),
      mode: "next-episode",
      folder,
      start: "22:00",
      overnight: true,
    });
    const held = notePicks(emptyProgress(), [leftover], week([show]));
    assert.equal(held.lastCompleted[folder], undefined);

    const counted = notePicks(emptyProgress(), [leftover], week([show]), true);
    assert.equal(counted.lastCompleted[folder], episode("01"));
    assert.equal(
      nextEpisode(files, counted.lastCompleted[folder]),
      episode("02"),
    );
  });

  it("remembers a random movie that was placed, and not one that was skipped", () => {
    const films = "/films";
    const movie = block({ id: "movie", folder: films, mode: "random-file" });
    const placed = notePicks(
      emptyProgress(),
      [
        row({
          blockId: "movie",
          path: `${films}/a.mkv`,
          mode: "random-file",
          folder: films,
        }),
      ],
      week([movie]),
    );
    assert.deepEqual(placed.recentRandom[films], [`${films}/a.mkv`]);

    const skipped = notePicks(
      emptyProgress(),
      [
        row({
          blockId: "movie",
          path: `${films}/a.mkv`,
          mode: "random-file",
          folder: films,
          status: "skipped",
        }),
      ],
      week([movie]),
    );
    assert.deepEqual(skipped.recentRandom, {});
  });
});
