// Random movies already placed on the week, so the next pick does not land on them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { row } from "../test/block.ts";
import { scheduledRandomPaths } from "./series.ts";

describe("movies already on the week", () => {
  it("keeps random files and leaves out the row being replaced", () => {
    const days = [
      {
        date: "2026-11-26",
        items: [
          row({ id: "keep", blockId: "movies", path: "/films/a.mkv", mode: "random-file" }),
          row({ id: "swap", blockId: "movies", path: "/films/b.mkv", mode: "random-file" }),
          row({ id: "show", blockId: "serial", path: "/shows/01.mkv", mode: "next-episode" }),
          row({ id: "blank", blockId: "movies", path: "", mode: "random-file" }),
        ],
      },
    ];
    assert.deepEqual(scheduledRandomPaths(days, "swap"), ["/films/a.mkv"]);
  });
});
