import { placedOn } from "../../../../../shared/placed.ts";
import type { Day, ScheduleBlock, TvBoard } from "../../../../../shared/types.ts";
import { DAY_MINUTES } from "../../../../../shared/window.ts";
import { canonicalPlaylistUrl, parseYoutubeUrl } from "../../../../../shared/youtube.ts";
import type { Draft } from "../../../../types/Draft.ts";
import { choiceFromLength } from "../../../../utils/length/choiceFromLength.ts";
import { fixedChoice } from "../../../../utils/length/fixedChoice.ts";
import { fromPlaylist } from "../../../../utils/playlist/fromPlaylist.ts";
import { toMin } from "../../../../utils/clock/toMin.ts";

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
    if (toMin(other.start) >= toMin(placed.end)) freeEnd = Math.min(freeEnd, toMin(other.start));
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
    source: block.mode === "specific-file" && parseYoutubeUrl(block.file ?? "")
      ? "youtube"
      : (block.mode === "next-episode" || block.mode === "random-file") &&
          canonicalPlaylistUrl(block.folder)
        ? "youtube"
        : "path",
    mode: block.mode,
    name: block.name ?? "",
    items: block.mode === "playlist" ? fromPlaylist(block, day, board) : [],
    addMode: "specific-file",
    addSource: "path",
    addFolder: "",
    addFile: "",
    addLengthChoice: 60,
    addCustomMin: "",
    ...(block.mode === "playlist" || (block.mode === "specific-file" && parseYoutubeUrl(block.file ?? ""))
      ? { lengthChoice: "longest" as const, customMin: "" }
      : block.mode === "next-episode"
        ? fixedChoice(block.lengthMin)
        : choiceFromLength(block.lengthMin)),
    freeEnd,
    gapStart: toMin(placed.start),
    formStep: "summary",
    addPhase: "list",
    returnTo: null,
  };
}
