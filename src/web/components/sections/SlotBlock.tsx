import { Fragment } from "preact";
import type { Day, ScheduleBlock, TvBoard } from "../../../shared/types.ts";
import { placedOn } from "../../../shared/placed.ts";
import { DAY_MINUTES, clockOf, nextDay } from "../../../shared/window.ts";
import { useI18n } from "../../i18n.tsx";
import type { Draft } from "../../types/Draft.ts";
import { clockFace } from "@utils/clock/clockFace.ts";
import { fromPlaylist } from "@utils/playlist/fromPlaylist.ts";
import { gapOf } from "@utils/playlist/gapOf.ts";
import { playlistGridLine } from "@utils/playlist/playlistGridLine.ts";
import { playlistSliceLines } from "@utils/playlist/playlistSliceLines.ts";
import { rowStyle } from "@utils/week/rowStyle.ts";
import { slotHover } from "@utils/label/slotHover.ts";
import { slotIsBuilding } from "@utils/week/slotIsBuilding.ts";
import { slotKind } from "@utils/label/slotKind.ts";
import { slotLabel } from "@utils/label/slotLabel.ts";
import { startOnDraft } from "@utils/week/startOnDraft.ts";
import { Spinner } from "../parts/Spinner.tsx";

export function SlotBlock({
  block,
  start,
  end,
  origin,
  day,
  board,
  draft,
  building,
  titles,
  onOpen,
}: {
  block: ScheduleBlock;
  start: number;
  end: number;
  origin: Day;
  day: Day;
  board: TvBoard | null;
  draft: Draft | null;
  building: string[];
  titles: Readonly<Record<string, string>>;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const span = end - start;
  const placed = placedOn(block, origin, board);
  const draftTime = draft ? startOnDraft(draft, origin) : "";
  const picked =
    draft?.id === block.id &&
    draft.origin === origin &&
    draftTime === placed.start;
  const spill = origin !== day;
  const crosses = placed.endMin > DAY_MINUTES;
  const calculating = slotIsBuilding(board, block.id, building);
  const sliceLines =
    block.mode === "playlist" && crosses
      ? playlistSliceLines(block, origin, board, spill, t, titles)
      : null;
  const stackLines =
    sliceLines == null && block.mode === "playlist"
      ? fromPlaylist(block, origin, board)
      : [];
  const endClock = clockOf(placed.endMin);
  return (
    <button
      type="button"
      class={`slot${slotKind(block)}${picked ? " pick" : ""}${spill ? " spill" : ""}${spill && crosses ? " slice" : ""}`}
      style={rowStyle(span)}
      title={slotHover(block, titles)}
      aria-busy={calculating ? "true" : undefined}
      onClick={onOpen}
    >
      {calculating ? (
        <span class="slot-calc">
          <Spinner />
          {t.calculating}
        </span>
      ) : null}
      <span class="tm">
        {spill
          ? `${t.sliceUntil(clockFace(end))} · ${t.day[origin]}`
          : crosses
            ? `${clockFace(start)}–24:00`
            : `${clockFace(start)}–${clockFace(end)}`}
      </span>
      <b>{slotLabel(block, titles)}</b>
      {sliceLines ? (
        <span class="stack-lines">
          {sliceLines.map((line) => (
            <span key={line.key}>{line.text}</span>
          ))}
        </span>
      ) : stackLines.length ? (
        <span class="stack-lines">
          {stackLines.map((item, index) => (
            <Fragment key={item.id}>
              <span>{playlistGridLine(item, t, titles)}</span>
              {index < stackLines.length - 1 && gapOf(item) > 0 ? (
                <span>{t.playlistGapLine(gapOf(item))}</span>
              ) : null}
            </Fragment>
          ))}
        </span>
      ) : null}
      {!sliceLines && crosses && block.mode !== "playlist" ? (
        <span class="more">
          {spill ? t.sliceFrom(placed.start) : t.sliceEnds(endClock)}
        </span>
      ) : null}
      {crosses && !spill ? (
        <span class="more">{t.sliceContinues(t.dayName[nextDay(origin)])}</span>
      ) : null}
      <i>{t.lengthOf(span)}</i>
    </button>
  );
}
