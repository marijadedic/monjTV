import { placedOn } from "../../../../../shared/placed.ts";
import type {
  Day,
  ScheduleBlock,
  TvBoard,
} from "../../../../../shared/types.ts";
import { DAY_MINUTES } from "../../../../../shared/window.ts";
import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
} from "../../../../../shared/youtube.ts";
import type { Draft } from "../../../../types/Draft.ts";
import type { LengthChoice } from "../../../../types/LengthChoice.ts";
import type { PlaySource } from "../../../../types/PlaySource.ts";
import { choiceFromLength } from "@utils/length/choiceFromLength.ts";
import { fixedChoice } from "@utils/length/fixedChoice.ts";
import { fromPlaylist } from "@utils/playlist/fromPlaylist.ts";
import { toMin } from "@utils/clock/toMin.ts";

function sourceOf(block: ScheduleBlock): PlaySource {
  if (block.mode === "specific-file" && parseYoutubeUrl(block.file ?? ""))
    return "youtube";
  if (
    (block.mode === "next-episode" || block.mode === "random-file") &&
    canonicalPlaylistUrl(block.folder)
  ) {
    return "youtube";
  }
  return "path";
}

export function slotDraft(
  block: ScheduleBlock,
  day: Day,
  blocks: ScheduleBlock[],
  board: TvBoard | null,
): Draft {
  const placed = placedOn(block, day, board);
  const others = blocks
    .filter((item) => item.id !== block.id && item.days.includes(day))
    .map((item) => placedOn(item, day, board))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  let freeEnd = DAY_MINUTES;
  for (const other of others) {
    if (toMin(other.start) >= toMin(placed.end))
      freeEnd = Math.min(freeEnd, toMin(other.start));
  }
  const starts: Partial<Record<Day, string>> = {};
  for (const item of block.days) {
    if (item === day) continue;
    starts[item] = placedOn(block, item, board).start;
  }
  return {
    id: block.id,
    origin: day,
    days: [...block.days],
    start: placed.start,
    end: placed.end,
    starts,
    folder: block.folder,
    file: block.file ?? "",
    source: sourceOf(block),
    mode: block.mode,
    name: block.name ?? "",
    items: block.mode === "playlist" ? fromPlaylist(block, day, board) : [],
    addMode: "specific-file",
    addSource: "path",
    addFolder: "",
    addFile: "",
    addLengthChoice: 60,
    addCustomMin: "",
    ...lengthChoiceOf(block),
    freeEnd,
    gapStart: toMin(placed.start),
    formStep: "summary",
    addPhase: "list",
    returnTo: null,
  };
}

function lengthChoiceOf(block: ScheduleBlock): {
  lengthChoice: LengthChoice;
  customMin: string;
} {
  if (
    block.mode === "playlist" ||
    (block.mode === "specific-file" && parseYoutubeUrl(block.file ?? ""))
  ) {
    return { lengthChoice: "longest", customMin: "" };
  }
  if (block.mode === "next-episode") return fixedChoice(block.lengthMin);
  return choiceFromLength(block.lengthMin);
}
