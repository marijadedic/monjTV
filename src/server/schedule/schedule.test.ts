// Saving a week: overlap, an edit that is only intermission, and a stored YouTube mode.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScheduleBlock, TvBoard } from "../../shared/types.ts";
import { block, row, week } from "../test/block.ts";
import { blocksForDay, changedBlocks, foldersOf, playingIntermission, sameBlocks, sourceChanged, validateSchedule } from "./schedule.ts";

const film = "/films/night.mkv";

function input(blocks: ScheduleBlock[]) {
  return { blocks, intermissions: [] as unknown[] };
}

describe("saving refuses a new overlap", () => {
  const evening = block({ id: "evening", days: ["mon"], start: "18:00", end: "20:00", lengthMin: 120 });
  const next = block({
    id: "next",
    days: ["mon"],
    start: "19:00",
    end: "21:00",
    lengthMin: 120,
    folder: "/shows/other",
  });

  it("allows a slot that starts when the previous one ends", () => {
    const after = block({
      id: "next",
      days: ["mon"],
      start: "20:00",
      end: "21:00",
      lengthMin: 60,
      folder: "/shows/other",
    });
    const saved = validateSchedule(input([evening, after]));
    assert.deepEqual(
      saved.blocks.map((item) => item.id),
      ["evening", "next"],
    );
  });

  it("refuses a slot this save adds when it overlaps another slot", () => {
    assert.throws(() => validateSchedule(input([evening, next]), null, [evening]));
  });

  it("refuses a leftover that runs past midnight into the next slot", () => {
    const late = block({
      id: "late",
      days: ["tue"],
      start: "23:00",
      end: "01:00",
      lengthMin: 120,
      folder: "/films",
      mode: "specific-file",
      file: film,
    });
    const early = block({
      id: "early",
      days: ["wed"],
      start: "00:30",
      end: "01:30",
      lengthMin: 60,
      folder: "/shows/morning",
    });
    assert.throws(() => validateSchedule(input([late, early]), null, [late]));
  });

  it("keeps an overlap that is already on the week when a different slot is removed", () => {
    const late = block({
      id: "late",
      days: ["tue"],
      start: "23:00",
      end: "01:00",
      lengthMin: 120,
      folder: "/films",
      mode: "specific-file",
      file: film,
    });
    const early = block({
      id: "early",
      days: ["wed"],
      start: "00:30",
      end: "01:30",
      lengthMin: 60,
      folder: "/shows/morning",
    });
    const other = block({ id: "other", days: ["mon"], start: "10:00", end: "11:00", folder: "/shows/day" });
    const saved = validateSchedule(input([late, early]), null, [late, early, other]);
    assert.deepEqual(
      saved.blocks.map((item) => item.id),
      ["late", "early"],
    );
  });

  it("refuses the overlap once one of those slots is edited", () => {
    const late = block({
      id: "late",
      days: ["tue"],
      start: "23:00",
      end: "01:00",
      lengthMin: 120,
      folder: "/films",
      mode: "specific-file",
      file: film,
    });
    const early = block({
      id: "early",
      days: ["wed"],
      start: "00:30",
      end: "01:30",
      lengthMin: 60,
      folder: "/shows/morning",
    });
    const edited = block({ ...early, folder: "/shows/renamed" });
    assert.throws(() => validateSchedule(input([late, edited]), null, [late, early]));
  });

  it("allows the save once the edited slot no longer overlaps", () => {
    const late = block({
      id: "late",
      days: ["tue"],
      start: "23:00",
      end: "01:00",
      lengthMin: 120,
      folder: "/films",
      mode: "specific-file",
      file: film,
    });
    const early = block({
      id: "early",
      days: ["wed"],
      start: "00:30",
      end: "01:30",
      lengthMin: 60,
      folder: "/shows/morning",
    });
    const cleared = block({ ...early, start: "02:00", end: "03:00" });
    const saved = validateSchedule(input([late, cleared]), null, [late, early]);
    assert.equal(saved.blocks.find((item) => item.id === "early")?.start, "02:00");
  });
});

describe("a playlist occupies the files on the TV schedule", () => {
  const playlist = block({
    id: "pl",
    mode: "playlist",
    name: "Evening",
    folder: "",
    days: ["mon"],
    start: "18:00",
    end: "20:00",
    lengthMin: 120,
    items: [{ id: "v1", mode: "specific-file", folder: "/films", file: "/films/a.mkv" }],
  });
  const board: TvBoard = {
    today: "2026-11-23",
    days: [
      {
        date: "2026-11-23",
        items: [
          row({
            blockId: "pl",
            path: "/films/a.mkv",
            title: "A",
            start: "18:00",
            end: "18:30",
            durationSec: 30 * 60,
          }),
        ],
      },
    ],
  };

  it("lets a later slot sit in the gap after those files", () => {
    const later = block({
      id: "later",
      days: ["mon"],
      start: "19:00",
      end: "20:00",
      lengthMin: 60,
      folder: "/shows/other",
    });
    const saved = validateSchedule(input([playlist, later]), board);
    assert.deepEqual(
      saved.blocks.map((item) => item.id),
      ["pl", "later"],
    );
  });

  it("still refuses a slot that overlaps the files that air", () => {
    const onTop = block({
      id: "ontop",
      days: ["mon"],
      start: "18:15",
      end: "18:45",
      lengthMin: 30,
      folder: "/shows/other",
    });
    assert.throws(() => validateSchedule(input([playlist, onTop]), board, [playlist]));
  });

  it("uses the stored length when the TV schedule has not placed the playlist", () => {
    const later = block({
      id: "later",
      days: ["mon"],
      start: "19:00",
      end: "20:00",
      lengthMin: 60,
      folder: "/shows/other",
    });
    assert.throws(() => validateSchedule(input([playlist, later]), null, [playlist]));
  });
});

describe("intermission and the slot source", () => {
  it("does not treat an intermission change as a change to the week", () => {
    const show = block({ id: "show", folder: "/shows/a" });
    const again = block({ id: "show", folder: "/shows/a" });
    assert.equal(sameBlocks([show], [again]), true);
    assert.deepEqual(changedBlocks([show], [again]), []);
    assert.equal(sourceChanged([show], again), false);
  });

  it("notices a new folder, file, mode, or playlist stack", () => {
    const show = block({ id: "show", folder: "/shows/a" });
    assert.equal(sourceChanged([show], block({ id: "show", folder: "/shows/b" })), true);
    assert.equal(
      sourceChanged(
        [block({ id: "film", mode: "specific-file", folder: "/films", file: "/films/a.mkv" })],
        block({ id: "film", mode: "specific-file", folder: "/films", file: "/films/b.mkv" }),
      ),
      true,
    );
    assert.equal(sourceChanged([show], block({ id: "show", mode: "random-file" })), true);

    const entry = { id: "v", mode: "specific-file" as const, folder: "/films", file: "/films/a.mkv" };
    const stack = block({
      id: "pl",
      mode: "playlist",
      name: "Evening",
      folder: "",
      items: [entry],
    });
    const reshot = block({
      id: "pl",
      mode: "playlist",
      name: "Evening",
      folder: "",
      items: [{ ...entry, file: "/films/b.mkv" }],
    });
    assert.equal(sourceChanged([stack], reshot), true);
    assert.equal(sameBlocks([stack], [reshot]), false);
  });
});

describe("a stored youtube mode", () => {
  it("is one video, with the link in file", () => {
    const saved = validateSchedule({
      blocks: [
        {
          id: "film",
          days: ["mon"],
          start: "20:00",
          end: "22:00",
          folder: "/ignored",
          file: "https://youtu.be/dQw4w9WgXcQ",
          mode: "youtube" as ScheduleBlock["mode"],
        },
      ],
      intermissions: [],
    });
    const video = saved.blocks[0];
    assert.equal(video?.mode, "specific-file");
    assert.equal(video?.file, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(video?.folder, "");
  });
});

describe("the day and the gap filler", () => {
  it("orders a day's slots by the start that day uses", () => {
    const early = block({ id: "early", days: ["wed"], start: "18:00", end: "19:00" });
    const moved = block({
      id: "moved",
      days: ["mon", "wed"],
      start: "20:00",
      end: "21:00",
      starts: { wed: "09:00" },
    });
    const other = block({ id: "other", days: ["mon"], start: "10:00", end: "11:00" });
    const schedule = week([early, moved, other]);
    assert.deepEqual(
      blocksForDay(schedule, "wed").map((item) => item.id),
      ["moved", "early"],
    );
    assert.deepEqual(
      blocksForDay(schedule, "mon").map((item) => item.id),
      ["other", "moved"],
    );
  });

  it("plays the selected intermission, and nothing when none is selected", () => {
    const filler = { id: "pause", kind: "folder" as const, source: "/intermission" };
    const selected = { ...week([]), intermissions: [filler], activeIntermission: "pause" };
    assert.deepEqual(playingIntermission(selected), filler);
    assert.equal(playingIntermission({ ...selected, activeIntermission: "" }), null);
    assert.equal(playingIntermission({ ...selected, activeIntermission: "missing" }), null);
  });

  it("names the folders a slot uses for episode and random history", () => {
    assert.deepEqual(foldersOf(block({ id: "show", folder: "/shows/a" })), ["/shows/a"]);
    assert.deepEqual(
      foldersOf(
        block({
          id: "pl",
          mode: "playlist",
          name: "Evening",
          folder: "",
          items: [
            { id: "a", mode: "next-episode", folder: "/shows/a" },
            { id: "b", mode: "random-file", folder: "/films" },
            { id: "c", mode: "next-episode", folder: "/shows/a" },
            { id: "d", mode: "specific-file", folder: "", file: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
          ],
        }),
      ),
      ["/shows/a", "/films"],
    );
  });
});
