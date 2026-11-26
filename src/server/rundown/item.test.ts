// Fit, overnight leftovers, and which file the clock is inside.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { block, row, week } from "../test/block.ts";
import {
  blockLeftoverSec,
  coversNow,
  findBlock,
  itemFits,
  joinOffset,
  keptForBlock,
  leftoverCarry,
  makeItem,
  maxPlayableSec,
  mergeOvernight,
  nextFrom,
  onAirItem,
  plannedSpill,
  recomputeBlockTimes,
  seriesFolder,
  sortRundown,
  sourceFolder,
  tightestSlotSec,
} from "./item.ts";

const MIN_LEFT = 3 * 60;
const GRACE = 8 * 60;

describe("a file is placed only when it fits the block", () => {
  it("fits when it ends on the block end", () => {
    assert.equal(itemFits(60 * 60, 60 * 60), true);
    assert.equal(itemFits(MIN_LEFT - 1, MIN_LEFT - 1), true);
  });

  it("does not use the extra 8 minutes when under 3 minutes remain", () => {
    const left = MIN_LEFT - 1;
    assert.equal(itemFits(left + 1, left), false);
    assert.equal(maxPlayableSec(left), left);
    assert.equal(maxPlayableSec(2 * 60), 2 * 60);
  });

  it("allows a file that ends 8 minutes after the block once 3 minutes remain", () => {
    assert.equal(itemFits(MIN_LEFT + GRACE, MIN_LEFT), true);
    assert.equal(itemFits(MIN_LEFT + GRACE + 1, MIN_LEFT), false);
    assert.equal(maxPlayableSec(MIN_LEFT), MIN_LEFT + GRACE);
    assert.equal(maxPlayableSec(60 * 60), 60 * 60 + GRACE);
  });

  it("places nothing in a block that has no time left", () => {
    assert.equal(itemFits(60, 0), false);
    assert.equal(maxPlayableSec(0), 0);
  });
});

describe("the part after midnight stays the same slot", () => {
  const film = "/films/night.mkv";
  const morning = "/shows/morning.mkv";
  const late = block({
    id: "late",
    days: ["mon"],
    start: "22:00",
    end: "01:00",
    folder: "/films",
    mode: "specific-file",
    file: film,
  });

  it("lists yesterday's leftover before today's own rows", () => {
    const sorted = sortRundown([
      row({ blockId: "prime", path: morning, start: "09:00", end: "10:00" }),
      row({
        blockId: "late",
        path: film,
        title: "Night",
        start: "22:00",
        end: "01:00",
        durationSec: 3 * 3600,
        overnight: true,
      }),
    ]);
    assert.deepEqual(
      sorted.map((item) => item.path),
      [film, morning],
    );
  });

  it("keeps the film that started the day before, and does not start a new block at 00:00", () => {
    const started = row({
      blockId: "late",
      path: film,
      title: "Night",
      start: "22:00",
      end: "01:00",
      durationSec: 3 * 3600,
    });
    const carry = leftoverCarry([started], week([late]), "mon", 30 * 60);
    assert.equal(carry.length, 1);
    assert.equal(carry[0]?.path, film);
    assert.equal(carry[0]?.title, "Night");
    assert.equal(carry[0]?.start, "22:00");
    assert.equal(carry[0]?.overnight, true);

    const merged = mergeOvernight(
      [row({ blockId: "prime", path: morning, start: "09:00", end: "10:00" })],
      carry,
    );
    assert.deepEqual(
      merged.map((item) => item.path),
      [film, morning],
    );
  });

  it("drops the leftover once the film has reached its real end", () => {
    const started = row({
      blockId: "late",
      path: film,
      title: "Night",
      start: "22:00",
      end: "01:00",
      durationSec: 3 * 3600,
    });
    assert.deepEqual(leftoverCarry([started], week([late]), "mon", 60 * 60), []);
  });

  it("does not carry a film that finished before midnight", () => {
    const early = row({
      blockId: "late",
      path: film,
      title: "Night",
      start: "22:00",
      end: "22:30",
      durationSec: 30 * 60,
    });
    assert.deepEqual(leftoverCarry([early], week([late]), "mon", 30 * 60), []);
  });

  it("does not keep a film that already reached the end", () => {
    const done = row({
      blockId: "late",
      path: film,
      title: "Night",
      start: "22:00",
      end: "01:00",
      durationSec: 3 * 3600,
      status: "done",
    });
    assert.deepEqual(leftoverCarry([done], week([late]), "mon", 30 * 60), []);
  });
});

describe("the clock picks the file it is inside", () => {
  const at = 18 * 3600 + 30 * 60;

  it("chooses the later start when two planned windows cover the clock", () => {
    const early = row({
      blockId: "early",
      path: "/shows/early.mkv",
      start: "18:00",
      end: "19:00",
      durationSec: 3600,
    });
    const later = row({
      blockId: "later",
      path: "/shows/later.mkv",
      start: "18:20",
      end: "19:20",
      durationSec: 3600,
    });
    assert.equal(onAirItem([early, later], at)?.path, "/shows/later.mkv");
  });

  it("leaves a skipped window off the air", () => {
    const skipped = row({
      blockId: "early",
      path: "/shows/early.mkv",
      start: "18:00",
      end: "19:00",
      durationSec: 3600,
      status: "skipped",
    });
    const planned = row({
      blockId: "later",
      path: "/shows/later.mkv",
      start: "18:20",
      end: "19:20",
      durationSec: 3600,
    });
    assert.equal(onAirItem([skipped, planned], at)?.path, "/shows/later.mkv");
    assert.equal(onAirItem([skipped], at), null);
  });

  it("seeks a file planned from 17:00 to 00:12 when the TV comes on at 17:12", () => {
    const item = row({
      blockId: "film",
      path: "/films/evening.mkv",
      start: "17:00",
      end: "19:00",
      durationSec: 2 * 3600,
    });
    assert.equal(joinOffset(item, 17 * 3600 + 12 * 60), 12 * 60);
  });

  it("seeks into a film that started the day before and is already underway", () => {
    const item = row({
      blockId: "late",
      path: "/films/night.mkv",
      start: "22:00",
      end: "01:00",
      durationSec: 3 * 3600,
      overnight: true,
    });
    assert.equal(joinOffset(item, 30 * 60), 2 * 3600 + 30 * 60);
  });

  it("is inside a file only while that file's window is open", () => {
    const film = row({
      blockId: "film",
      path: "/films/evening.mkv",
      start: "17:00",
      end: "19:00",
      durationSec: 2 * 3600,
    });
    assert.equal(coversNow(film, 17 * 3600 + 12 * 60), true);
    assert.equal(coversNow(film, 19 * 3600), false);
  });
});

describe("a rundown row is one planned file", () => {
  it("uses the video name, the slot, and the clock", () => {
    const slot = block({
      id: "film",
      mode: "specific-file",
      folder: "/films",
      file: "/films/Night.mkv",
      start: "18:00",
      end: "20:00",
    });
    const item = makeItem(slot, "/films/Night.mkv", 18 * 3600, 2 * 3600);
    assert.equal(item.blockId, "film");
    assert.equal(item.path, "/films/Night.mkv");
    assert.equal(item.title, "Night");
    assert.equal(item.mode, "specific-file");
    assert.equal(item.folder, "/films");
    assert.equal(item.start, "18:00");
    assert.equal(item.end, "20:00");
    assert.equal(item.durationSec, 2 * 3600);
    assert.equal(item.status, "planned");
    assert.equal(item.entryId, undefined);
  });

  it("keeps a playlist video as an ordinary file on that row", () => {
    const slot = block({
      id: "pl",
      mode: "playlist",
      name: "Evening",
      folder: "",
      items: [{ id: "v1", mode: "specific-file", folder: "/films", file: "/films/A.mkv" }],
    });
    const item = makeItem(slot, "/films/A.mkv", 18 * 3600, 30 * 60, {
      mode: "specific-file",
      folder: "/films",
      entryId: "v1",
      title: "A",
    });
    assert.equal(item.mode, "specific-file");
    assert.equal(item.entryId, "v1");
    assert.equal(item.title, "A");
    assert.equal(item.start, "18:00");
    assert.equal(item.end, "18:30");
  });
});

describe("playlist times follow the files", () => {
  it("starts each video when the previous one ends", () => {
    const slot = block({
      id: "pl",
      mode: "playlist",
      name: "Evening",
      folder: "",
      days: ["mon", "tue"],
      start: "22:00",
      end: "01:00",
      lengthMin: 180,
      starts: { tue: "21:00" },
      items: [],
    });
    const day = {
      date: "2026-11-24",
      items: [
        row({
          blockId: "pl",
          path: "/films/night.mkv",
          start: "00:00",
          end: "00:00",
          durationSec: 3 * 3600,
          overnight: true,
        }),
        row({
          blockId: "pl",
          path: "/films/a.mkv",
          start: "00:00",
          end: "00:00",
          durationSec: 30 * 60,
        }),
        row({
          blockId: "pl",
          path: "/films/b.mkv",
          start: "00:00",
          end: "00:00",
          durationSec: 45 * 60,
        }),
        row({ blockId: "other", path: "/shows/x.mkv", start: "12:00", end: "13:00" }),
      ],
    };
    recomputeBlockTimes(day, slot);
    const [night, first, second, other] = day.items;
    assert.equal(night?.start, "22:00");
    assert.equal(night?.end, "01:00");
    assert.equal(first?.start, "21:00");
    assert.equal(first?.end, "21:30");
    assert.equal(second?.start, "21:30");
    assert.equal(second?.end, "22:15");
    assert.equal(other?.start, "12:00");
  });
});

describe("the previous day spills only what is still on", () => {
  const film = "/films/night.mkv";
  const late = block({
    id: "late",
    days: ["mon"],
    start: "22:00",
    end: "01:00",
    lengthMin: 180,
    folder: "/films",
    mode: "specific-file",
    file: film,
  });

  it("names the film that crosses midnight, still starting when it started", () => {
    const spill = plannedSpill(
      {
        date: "2026-11-23",
        items: [
          row({
            blockId: "late",
            path: film,
            title: "Night",
            start: "22:00",
            end: "01:00",
            durationSec: 3 * 3600,
          }),
        ],
      },
      week([late]),
    );
    assert.equal(spill.length, 1);
    assert.equal(spill[0]?.path, film);
    assert.equal(spill[0]?.title, "Night");
    assert.equal(spill[0]?.start, "22:00");
    assert.equal(spill[0]?.overnight, true);
    assert.equal(spill[0]?.status, "planned");
  });

  it("leaves out a film that finished, was skipped, ended before midnight, or is already a leftover", () => {
    const crossing = {
      blockId: "late",
      path: film,
      title: "Night",
      start: "22:00",
      end: "01:00",
      durationSec: 3 * 3600,
    };
    const previous = {
      date: "2026-11-23",
      items: [
        row({ ...crossing, status: "done" }),
        row({ ...crossing, path: "/films/skipped.mkv", status: "skipped" }),
        row({ ...crossing, path: "/films/early.mkv", end: "22:30", durationSec: 30 * 60 }),
        row({ ...crossing, path: "/films/carry.mkv", overnight: true }),
      ],
    };
    assert.deepEqual(plannedSpill(previous, week([late])), []);
  });
});

describe("a slot keeps its own rows", () => {
  it("uses the row folder for a series, and the slot folder otherwise", () => {
    const show = block({ id: "serial", folder: "/shows/serial" });
    const schedule = week([show]);
    const episode = row({
      blockId: "serial",
      path: "/shows/serial/02.mkv",
      mode: "next-episode",
      folder: "/shows/serial",
    });
    assert.equal(seriesFolder(episode, schedule), "/shows/serial");
    assert.equal(seriesFolder({ ...episode, folder: undefined }, schedule), "/shows/serial");
    assert.equal(seriesFolder(row({ blockId: "serial", path: "/films/a.mkv", mode: "random-file" }), schedule), undefined);
    assert.equal(sourceFolder(episode, show), "/shows/serial");
    assert.equal(sourceFolder({ ...episode, folder: "" }, show), "/shows/serial");
  });

  it("keeps this day's rows for the slot and drops yesterday's leftover", () => {
    const kept = keptForBlock(
      {
        date: "2026-11-24",
        items: [
          row({ blockId: "late", path: "/films/night.mkv", start: "22:00", overnight: true }),
          row({ blockId: "late", path: "/films/today.mkv", start: "21:00" }),
          row({ blockId: "other", path: "/shows/x.mkv", start: "12:00" }),
        ],
      },
      "late",
    );
    assert.deepEqual(
      kept.map((item) => item.path),
      ["/films/today.mkv"],
    );
    assert.deepEqual(keptForBlock(undefined, "late"), []);
  });

  it("walks to the next file and wraps", () => {
    const files = ["/shows/01.mkv", "/shows/02.mkv", "/shows/03.mkv"];
    assert.equal(nextFrom(files), "/shows/01.mkv");
    assert.equal(nextFrom(files, "/shows/01.mkv"), "/shows/02.mkv");
    assert.equal(nextFrom(files, "/shows/03.mkv"), "/shows/01.mkv");
    assert.equal(nextFrom([]), null);
  });

  it("measures the leftover past midnight and the one stored length", () => {
    const late = block({
      id: "late",
      days: ["mon"],
      start: "22:00",
      end: "01:00",
      lengthMin: 180,
      folder: "/films",
    });
    assert.equal(blockLeftoverSec(late, "mon", []), 60 * 60);
    assert.equal(tightestSlotSec(late), 180 * 60);
    assert.equal(
      blockLeftoverSec(block({ id: "prime", start: "18:00", end: "19:00", lengthMin: 60 }), "mon", []),
      0,
    );

    const playlist = block({
      id: "pl",
      mode: "playlist",
      name: "Evening",
      folder: "",
      days: ["mon"],
      start: "22:00",
      end: "01:00",
      lengthMin: 180,
    });
    const files = [
      row({ blockId: "pl", path: "/films/a.mkv", start: "22:00", durationSec: 30 * 60, end: "22:30" }),
      row({ blockId: "pl", path: "/films/b.mkv", start: "23:00", durationSec: 90 * 60, end: "00:30" }),
    ];
    assert.equal(blockLeftoverSec(playlist, "mon", files), 30 * 60);
    const carriedOnly = [
      row({
        blockId: "pl",
        path: "/films/b.mkv",
        start: "23:00",
        durationSec: 90 * 60,
        end: "00:30",
        overnight: true,
      }),
    ];
    assert.equal(blockLeftoverSec(playlist, "mon", carriedOnly), 0);
  });

  it("finds the slot by id", () => {
    const show = block({ id: "serial" });
    assert.equal(findBlock(week([show]), "serial")?.id, "serial");
    assert.equal(findBlock(week([show]), "missing"), undefined);
  });

  it("lists a film that started yesterday ahead of a leftover that starts after midnight", () => {
    const sorted = sortRundown([
      row({
        blockId: "early",
        path: "/films/morning.mkv",
        start: "00:20",
        end: "00:40",
        durationSec: 20 * 60,
        overnight: true,
      }),
      row({
        blockId: "late",
        path: "/films/night.mkv",
        start: "22:00",
        end: "01:00",
        durationSec: 3 * 3600,
        overnight: true,
      }),
    ]);
    assert.deepEqual(
      sorted.map((item) => item.path),
      ["/films/night.mkv", "/films/morning.mkv"],
    );
  });

  it("does not list the carried film twice", () => {
    const carry = [
      row({
        blockId: "late",
        path: "/films/night.mkv",
        start: "22:00",
        durationSec: 3 * 3600,
        overnight: true,
      }),
    ];
    const merged = mergeOvernight(
      [
        row({
          blockId: "late",
          path: "/films/night.mkv",
          start: "22:00",
          durationSec: 3 * 3600,
          overnight: true,
        }),
        row({ blockId: "prime", path: "/shows/morning.mkv", start: "09:00" }),
      ],
      carry,
    );
    assert.deepEqual(
      merged.map((item) => item.path),
      ["/films/night.mkv", "/shows/morning.mkv"],
    );
  });
});
