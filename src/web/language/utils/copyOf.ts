import type { Copy, Messages } from "../messages.ts";
import { fill } from "./fill.ts";
import { hoursMinutes } from "./hoursMinutes.ts";
import { runLength } from "./runLength.ts";
import { translateError } from "./translateError.ts";
import { videoCount } from "./videoCount.ts";

export function copyOf(messages: Messages, lang: "en" | "hr"): Copy {
  const {
    nextAt,
    startsAt,
    missedStart,
    lengthOf,
    slotDurationOf,
    minutes,
    aboutLength,
    elapsed,
    newSlot,
    editSlot,
    playlistGapLine,
    videoCount: videoForms,
    runLength: runUnits,
    wontFitVideo,
    wontFitEpisode,
    wontFitFolder,
    until,
    sliceUntil,
    sliceContinues,
    sliceEnds,
    sliceFrom,
    fromDayUntil,
    startedDay,
    errors,
    ...rest
  } = messages;
  return {
    ...rest,
    nextAt: (time) => fill(nextAt, { time }),
    startsAt: (title, time) => fill(startsAt, { title, time }),
    missedStart: (title, end) => fill(missedStart, { title, end }),
    lengthOf: (mins) => hoursMinutes(mins, lengthOf),
    slotDurationOf: (mins) => hoursMinutes(mins, slotDurationOf),
    minutes: (n) => fill(minutes, { n }),
    aboutLength: (label) => fill(aboutLength, { label }),
    elapsed: (clock) => fill(elapsed, { clock }),
    newSlot: (day) => fill(newSlot, { day }),
    editSlot: (day) => fill(editSlot, { day }),
    playlistGapLine: (mins) => fill(playlistGapLine, { mins }),
    videoCount: (count) => videoCount(count, videoForms, lang),
    runLength: (sec) => runLength(sec, runUnits),
    wontFitVideo: (title, length, limit) => fill(wontFitVideo, { title, length, limit }),
    wontFitEpisode: (title, length, limit) => fill(wontFitEpisode, { title, length, limit }),
    wontFitFolder: (title, length, limit) => fill(wontFitFolder, { title, length, limit }),
    until: (time) => fill(until, { time }),
    sliceUntil: (time) => fill(sliceUntil, { time }),
    sliceContinues: (day) => fill(sliceContinues, { day }),
    sliceEnds: (time) => fill(sliceEnds, { time }),
    sliceFrom: (time) => fill(sliceFrom, { time }),
    fromDayUntil: (day, time) => fill(fromDayUntil, { day, time }),
    startedDay: (day) => fill(startedDay, { day }),
    error: (message) => translateError(message, errors, messages.day),
  };
}
