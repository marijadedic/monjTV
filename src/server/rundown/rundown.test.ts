// A saved week and the files on disk become the TV schedule.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { promisify } from "node:util";
import type { ScheduleBlock } from "../../shared/types.ts";

const execFileAsync = promisify(execFile);
const DAY_SECONDS = 24 * 3600;

const root = await mkdtemp(path.join(os.tmpdir(), "monjtv-rundown-"));
process.env.MONJTV_DATA = root;
after(() => rm(root, { recursive: true, force: true }));

const { dateKey, parseHm, weekday } = await import("../clock/clock.ts");
const { shiftDateKey } = await import("../../shared/dates.ts");
const { probeDuration } = await import("../files/duration.ts");
const { writeJson } = await import("../data/store.ts");
const { progressPath, schedulePath, tvPath } = await import("../data/paths.ts");
const { buildRundown } = await import("./compose.ts");
const { syncBoard } = await import("./board.ts");
const { writeBoard } = await import("./boardFile.ts");

// A short silent video of this many seconds.
async function clip(file: string, seconds: number): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=16x16:r=1:d=${seconds}`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-an",
      file,
    ],
    { timeout: 60_000 },
  );
}

// Slot length in minutes, from the length the file actually probes as.
function slotMinutes(durationSec: number): number {
  return Math.max(1, Math.ceil(durationSec / 60));
}

function clock(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// A start on this day whose file is still on after midnight.
function crossingStart(durationSec: number): string {
  const startSec = DAY_SECONDS - durationSec + 60;
  const minute = Math.min(23 * 60 + 59, Math.max(0, Math.floor(startSec / 60)));
  return clock(minute);
}

const show = path.join(root, "show");
const films = path.join(root, "films");
await mkdir(show, { recursive: true });
await mkdir(films, { recursive: true });

const episodeTwo = path.join(show, "2.mkv");
const episodeTen = path.join(show, "10.mkv");
const brief = path.join(films, "Brief.mkv");
const feature = path.join(films, "Feature.mkv");
const film = path.join(root, "Night.mkv");
await clip(episodeTwo, 90);
await clip(episodeTen, 90);
await clip(brief, 3);
await clip(feature, 12 * 60);
await clip(film, 90);

const episodeSec = await probeDuration(episodeTwo);
const briefSec = await probeDuration(brief);
const featureSec = await probeDuration(feature);
const filmSec = await probeDuration(film);
const episodeMin = slotMinutes(episodeSec);
const briefMin = slotMinutes(briefSec);
const filmStart = crossingStart(filmSec);

if (episodeSec * 2 <= episodeMin * 60) {
  throw new Error("one slot would air both episodes");
}
const briefSlot = briefMin * 60;
const grace = briefSlot >= 3 * 60 ? 8 * 60 : 0;
if (featureSec <= briefSlot + grace) {
  throw new Error("the long file still fits this slot");
}
if (parseHm(filmStart) + filmSec <= DAY_SECONDS) {
  throw new Error("this film does not reach the next morning");
}

const today = dateKey();
const day = weekday();

function episodeBlock(id: string, start: string): ScheduleBlock {
  return {
    id,
    days: [day],
    start,
    end: start,
    lengthMin: episodeMin,
    folder: show,
    mode: "next-episode",
  };
}

async function saveWeek(blocks: ScheduleBlock[]): Promise<void> {
  await writeJson(schedulePath, {
    blocks,
    intermissions: [],
    activeIntermission: "",
    intermissionRandomStart: false,
  });
  await writeJson(progressPath, { lastCompleted: {}, recentRandom: {} });
}

describe("a week built from the files on disk", { concurrency: false }, () => {
  it("airs 2.mkv then 10.mkv when one show has two slots on the same day", async () => {
    await saveWeek([
      episodeBlock("early", "18:00"),
      episodeBlock("late", "20:00"),
    ]);
    const built = await buildRundown(today);
    const own = built.items.filter((item) => !item.overnight);
    assert.deepEqual(
      own.map((item) => path.basename(item.path)),
      ["2.mkv", "10.mkv"],
    );
  });

  it("skips a random file that does not fit and places one that does", async () => {
    await saveWeek([
      {
        id: "film",
        days: [day],
        start: "18:00",
        end: "18:00",
        lengthMin: briefMin,
        folder: films,
        mode: "random-file",
      },
    ]);
    const built = await buildRundown(today);
    assert.deepEqual(
      built.items.map((item) => path.basename(item.path)),
      ["Brief.mkv"],
    );
  });

  it("keeps the file a slot already had when that slot did not change", async () => {
    await saveWeek([
      episodeBlock("show", "18:00"),
      {
        id: "other",
        days: [day],
        start: "21:00",
        end: "21:00",
        lengthMin: briefMin,
        folder: films,
        file: brief,
        mode: "specific-file",
      },
    ]);
    const built = await buildRundown(
      today,
      {
        date: today,
        items: [
          {
            id: "saved",
            blockId: "show",
            path: episodeTen,
            title: "10",
            mode: "next-episode",
            folder: show,
            start: "18:00",
            end: "19:00",
            durationSec: episodeSec,
            status: "planned",
          },
        ],
      },
      new Set(["other"]),
    );
    const kept = built.items.filter((item) => item.blockId === "show");
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.path, episodeTen);
  });

  it("carries a film that crosses midnight, and leaves a finished one off the next morning", async () => {
    await rm(tvPath, { force: true });
    await saveWeek([
      {
        id: "night",
        days: [day],
        start: filmStart,
        end: filmStart,
        lengthMin: slotMinutes(filmSec),
        folder: root,
        file: film,
        mode: "specific-file",
      },
    ]);

    const first = await syncBoard(true);
    const tomorrow = shiftDateKey(today, 1);
    const morning = first.days.find((entry) => entry.date === tomorrow);
    const carried = morning?.items.find(
      (item) => item.overnight && item.path === film,
    );
    assert.ok(carried);

    const live = first.days.find((entry) => entry.date === today);
    const aired = live?.items.find((item) => item.path === film);
    assert.ok(aired);
    aired.status = "done";
    await writeBoard({
      carriedInto: today,
      days: first.days.filter((entry) => entry.date <= today),
    });

    const second = await syncBoard(true);
    const nextMorning = second.days.find((entry) => entry.date === tomorrow);
    assert.ok(nextMorning);
    assert.equal(
      nextMorning.items.some((item) => item.path === film),
      false,
    );
  });
});
