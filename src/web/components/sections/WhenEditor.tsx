import "./styles/WhenEditor.css";
import "./styles/WhenEditor.row.css";
import "./styles/WhenEditor.fields.css";
import "./styles/WhenEditor.times.css";
import type { StateUpdater } from "preact/hooks";
import {
  DAYS,
  type Day,
  type ScheduleBlock,
  type SlotLength,
  type TvBoard,
} from "../../../shared/types.ts";
import { placedOn } from "../../../shared/placed.ts";
import { nextDay, windowOn } from "../../../shared/window.ts";
import { useI18n } from "../../i18n.tsx";
import type { Draft } from "../../types/Draft.ts";
import type { FieldError } from "../../types/FieldError.ts";
import { chosenSeconds } from "@utils/length/chosenSeconds.ts";
import { endFace } from "@utils/clock/endFace.ts";
import { endFromDuration } from "@utils/clock/endFromDuration.ts";
import { nextOnDay } from "@utils/week/nextOnDay.ts";
import { prevOnDay } from "@utils/week/prevOnDay.ts";
import { selectedDays } from "@utils/week/selectedDays.ts";
import { spillsPastDay } from "@utils/week/spillsPastDay.ts";
import { startOnDraft } from "@utils/week/startOnDraft.ts";
import { toMin } from "@utils/clock/toMin.ts";

export function WhenEditor({
  draft,
  clashes,
  blocks,
  board,
  activeSec,
  measured,
  setDraft,
  setFieldError,
}: {
  draft: Draft;
  clashes: { day: Day; title: string; start: string; end: string }[];
  blocks: ScheduleBlock[];
  board: TvBoard | null;
  activeSec: number | null;
  measured: { key: string; length: SlotLength | null } | null;
  setDraft: (update: StateUpdater<Draft | null>) => void;
  setFieldError: (update: StateUpdater<FieldError>) => void;
}) {
  const { t } = useI18n();

  function toggleDay(day: Day) {
    setDraft((current) => {
      if (!current || day === current.origin) return current;
      if (current.days.includes(day)) {
        const starts = { ...current.starts };
        delete starts[day];
        return {
          ...current,
          days: current.days.filter((item) => item !== day),
          starts,
        };
      }
      return {
        ...current,
        days: [...current.days, day],
        starts: { ...current.starts, [day]: current.start },
      };
    });
  }

  function changeStart(day: Day, value: string) {
    setDraft((current) => {
      if (!current) return current;
      if (day === current.origin) {
        const sec = chosenSeconds({ ...current, start: value }, measured);
        const nextEnd = sec ? endFromDuration(value, sec) : current.end;
        return { ...current, start: value, end: nextEnd };
      }
      return { ...current, starts: { ...current.starts, [day]: value } };
    });
    setFieldError((current) => ({ ...current, time: undefined }));
  }

  return (
    <>
      <div class="also">
        <span class="k">{t.alsoOn}</span>
        <div class="days">
          {DAYS.map((item) => (
            <button
              key={item}
              type="button"
              class={`chip${draft.days.includes(item) ? " on" : ""}`}
              aria-pressed={draft.days.includes(item)}
              aria-disabled={item === draft.origin}
              onClick={() => toggleDay(item)}
            >
              {t.day[item]}
            </button>
          ))}
        </div>
      </div>
      <div class="day-times">
        {selectedDays(draft).map((day) => {
          const start = startOnDraft(draft, day);
          const spills = Boolean(activeSec && spillsPastDay(start, activeSec));
          const clash = clashes
            .filter(
              (item) =>
                item.day === day || (spills && item.day === nextDay(day)),
            )
            .sort((a, b) => toMin(a.start) - toMin(b.start))[0];
          const prev = prevOnDay(day, start, blocks, draft.id);
          const next = nextOnDay(day, start, blocks, draft.id);
          const end = activeSec ? endFace(start, activeSec) : undefined;
          const endLabel =
            draft.mode === "playlist" && draft.items.length === 0
              ? "/"
              : (end ?? "/");
          const neighbors = [
            ...(prev ? [`${t.prevAt} ${placedOn(prev, day, board).end}`] : []),
            ...(next ? [`${t.laterAt} ${windowOn(next, day).start}`] : []),
          ];
          return (
            <div class="day-start" key={day}>
              <div class="when-row">
                <span class="day-name">{t.dayName[day]}</span>
                <input
                  class="time"
                  type="time"
                  value={start}
                  aria-label={`${t.dayName[day]} ${t.startTime}`}
                  onInput={(event) =>
                    changeStart(day, (event.target as HTMLInputElement).value)
                  }
                />
                <span class="when-end">
                  - {endLabel}
                  {endLabel !== "/" && spills ? ` ${t.day[nextDay(day)]}` : ""}
                </span>
              </div>
              {clash ? (
                <p class="when-note warn" role="status">
                  {t.overlaps} {clash.title}, {clash.start}–{clash.end}.
                </p>
              ) : neighbors.length > 0 ? (
                <p class="when-note" role="status">
                  {neighbors.join(" · ")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
