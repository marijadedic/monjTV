import { useEffect, useRef, useState } from "preact/hooks";
import {
  DAYS,
  type BlockMode,
  type Day,
  type Schedule,
  type ScheduleBlock,
} from "../../shared/types.ts";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";

const DAY_MINUTES = 24 * 60;
const HOUR_PX = 24;

const WEEKDAY: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type Piece =
  | { kind: "gap"; start: number; end: number }
  | { kind: "slot"; block: ScheduleBlock; start: number; end: number };

type Draft = {
  id: string | null;
  origin: Day;
  days: Day[];
  start: string;
  end: string;
  folder: string;
  mode: BlockMode;
  freeEnd: number;
  gapStart: number;
  showDays: boolean;
};

function toMin(hm: string): number {
  const [hRaw, mRaw] = hm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return 0;
  return h * 60 + m;
}

function inputTime(mins: number): string {
  const capped = Math.min(mins, 23 * 60 + 59);
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clockFace(mins: number): string {
  if (mins >= DAY_MINUTES) return "24:00";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function folderLabel(folder: string): string {
  const parts = folder.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || folder;
}

function piecesFor(day: Day, blocks: ScheduleBlock[]): Piece[] {
  const mine = blocks
    .filter((block) => block.days.includes(day))
    .slice()
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  const out: Piece[] = [];
  let cursor = 0;
  for (const block of mine) {
    const start = toMin(block.start);
    const end = toMin(block.end);
    if (start > cursor) out.push({ kind: "gap", start: cursor, end: start });
    if (end > start) out.push({ kind: "slot", block, start, end });
    cursor = Math.max(cursor, end);
  }
  if (cursor < DAY_MINUTES) out.push({ kind: "gap", start: cursor, end: DAY_MINUTES });
  return out;
}

function emptySchedule(): Schedule {
  return { blocks: [], fallbackFolder: "" };
}

export function Admin() {
  const { t } = useI18n();
  const today = WEEKDAY[new Date().getDay()]!;
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState<"draft" | "fallback" | null>(null);
  const savedFallback = useRef("");

  useEffect(() => {
    api
      .schedule()
      .then((loaded) => {
        const next = { ...emptySchedule(), ...loaded, blocks: loaded.blocks ?? [] };
        savedFallback.current = next.fallbackFolder;
        setSchedule(next);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function persist(next: Schedule) {
    setError(null);
    const res = await api.saveSchedule(next);
    savedFallback.current = res.schedule.fallbackFolder;
    setSchedule(res.schedule);
    setSaved(true);
  }

  function openGap(day: Day, startMin: number, endMin: number, at: number) {
    let start = startMin + Math.round((at - startMin) / 30) * 30;
    start = Math.min(Math.max(start, startMin), endMin);
    if (endMin - start < 30) start = startMin;
    const end = Math.min(endMin, start + 120);
    setDraft({
      id: null,
      origin: day,
      days: [day],
      start: inputTime(start),
      end: inputTime(end),
      folder: "",
      mode: "random-file",
      freeEnd: endMin,
      gapStart: startMin,
      showDays: false,
    });
    setSaved(false);
    setError(null);
  }

  function openSlot(block: ScheduleBlock, day: Day) {
    const others = schedule.blocks
      .filter((item) => item.id !== block.id && item.days.includes(day))
      .sort((a, b) => toMin(a.start) - toMin(b.start));
    let freeEnd = DAY_MINUTES;
    for (const other of others) {
      if (toMin(other.start) >= toMin(block.end)) freeEnd = Math.min(freeEnd, toMin(other.start));
    }
    setDraft({
      id: block.id,
      origin: day,
      days: [...block.days],
      start: block.start,
      end: block.end,
      folder: block.folder,
      mode: block.mode,
      freeEnd,
      gapStart: toMin(block.start),
      showDays: block.days.some((item) => item !== day),
    });
    setSaved(false);
    setError(null);
  }

  function toggleDay(day: Day) {
    setDraft((current) => {
      if (!current || day === current.origin) return current;
      const days = current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day];
      return { ...current, days };
    });
  }

  async function chooseFolder() {
    setPicking("draft");
    setError(null);
    try {
      const picked = await api.pickFolder();
      if (picked.path) setDraft((current) => (current ? { ...current, folder: picked.path! } : current));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
  }

  async function chooseFallback() {
    setPicking("fallback");
    setError(null);
    try {
      const picked = await api.pickFolder();
      if (!picked.path) return;
      await persist({ ...schedule, fallbackFolder: picked.path });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
  }

  async function commitFallback() {
    const fallbackFolder = schedule.fallbackFolder.trim();
    if (fallbackFolder === savedFallback.current) return;
    try {
      await persist({ ...schedule, fallbackFolder });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function commit() {
    if (!draft) return;
    if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) {
      setError("start and end must be HH:mm");
      return;
    }
    if (toMin(draft.end) <= toMin(draft.start)) {
      setError(`Block ${draft.start}–${draft.end} must end after it starts (same day)`);
      return;
    }
    if (!draft.folder.trim()) {
      setError("Each block needs a folder");
      return;
    }
    const block: ScheduleBlock = {
      id: draft.id ?? crypto.randomUUID(),
      days: draft.days.includes(draft.origin) ? draft.days : [draft.origin, ...draft.days],
      start: draft.start,
      end: draft.end,
      folder: draft.folder.trim(),
      mode: draft.mode,
    };
    const blocks = draft.id
      ? schedule.blocks.map((item) => (item.id === draft.id ? block : item))
      : [...schedule.blocks, block];
    try {
      await persist({ ...schedule, blocks });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeDraft() {
    if (!draft?.id) return;
    try {
      await persist({
        ...schedule,
        blocks: schedule.blocks.filter((item) => item.id !== draft.id),
      });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const fallbackName = schedule.fallbackFolder ? folderLabel(schedule.fallbackFolder) : "";
  const lengthMins = draft ? Math.max(0, toMin(draft.end) - toMin(draft.start)) : 0;

  return (
    <section>
      <h1>{t.week}</h1>
      {error && <p class="error">{t.error(error)}</p>}
      <div class="week-scale">
        <div class="hours" aria-hidden="true">
          {["00", "04", "08", "12", "16", "20", "24"].map((hour) => (
            <span key={hour}>{hour}</span>
          ))}
        </div>
        {DAYS.map((day) => {
          const pieces = piecesFor(day, schedule.blocks);
          const emptyDay = pieces.length === 1 && pieces[0]?.kind === "gap";
          return (
            <div key={day} class={day === today ? "day on" : "day"}>
              <span class="name">{t.day[day]}</span>
              <div class="track">
                {pieces.map((piece) => {
                  const hours = (piece.end - piece.start) / 60;
                  if (piece.kind === "gap") {
                    const long = piece.end - piece.start >= 120;
                    const picked =
                      draft?.id == null && draft?.origin === day && draft.gapStart === piece.start;
                    return (
                      <button
                        key={`gap-${piece.start}`}
                        type="button"
                        class={`gap${long ? " long" : ""}${emptyDay ? " first" : ""}${picked ? " pick" : ""}`}
                        style={{ height: `${hours * HOUR_PX}px` }}
                        onClick={(event) => {
                          const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          const ratio = rect.height
                            ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
                            : 0;
                          const at = piece.start + ratio * (piece.end - piece.start);
                          openGap(day, piece.start, piece.end, at);
                        }}
                      >
                        {long && fallbackName && <b>{fallbackName}</b>}
                        {emptyDay && <i>{t.clickFirst}</i>}
                      </button>
                    );
                  }
                  const picked = draft?.id === piece.block.id;
                  return (
                    <button
                      key={piece.block.id}
                      type="button"
                      class={`slot${picked ? " pick" : ""}`}
                      style={{ height: `${hours * HOUR_PX}px` }}
                      title={piece.block.folder}
                      onClick={() => openSlot(piece.block, day)}
                    >
                      <b>{folderLabel(piece.block.folder)}</b>
                      <i>
                        {piece.block.start}–{piece.block.end} · {t.lengthOf(piece.end - piece.start)}
                      </i>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {draft && (
        <form
          class={`add-form${draft.showDays ? " show-days" : ""}`}
          onSubmit={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          <div class="add-when">
            <div>
              <span class="k">{t.dayWord}</span>
              <b>{t.dayName[draft.origin]}</b>
            </div>
            <label>
              {t.start}
              <input
                type="time"
                value={draft.start}
                onInput={(event) =>
                  setDraft({ ...draft, start: (event.target as HTMLInputElement).value })
                }
              />
            </label>
            <label>
              {t.end}
              <input
                type="time"
                value={draft.end}
                onInput={(event) =>
                  setDraft({ ...draft, end: (event.target as HTMLInputElement).value })
                }
              />
            </label>
            <div class="len">
              <span class="k">{t.length}</span>
              <b>{t.lengthOf(lengthMins)}</b>
            </div>
            <span class="until">{t.until(clockFace(draft.freeEnd))}</span>
          </div>
          <div class="days-wrap">
            <span class="k">{t.dayWord}</span>
            <div class="day-pick">
              <div class="days">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    class={`chip${day === draft.origin ? " on" : ""}${day === draft.origin ? "" : " extra"}${draft.days.includes(day) && day !== draft.origin ? " on" : ""}`}
                    aria-pressed={draft.days.includes(day)}
                    onClick={() => toggleDay(day)}
                  >
                    {t.day[day]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                class="btn"
                onClick={() => setDraft({ ...draft, showDays: !draft.showDays })}
              >
                {draft.showDays ? t.hideDays : t.moreDays}
              </button>
            </div>
          </div>
          <div class="add-tail">
            <div class="field">
              <input
                value={draft.folder}
                placeholder={t.folderPlaceholder}
                onInput={(event) =>
                  setDraft({ ...draft, folder: (event.target as HTMLInputElement).value })
                }
              />
              <button type="button" onClick={() => void chooseFolder()} disabled={picking === "draft"}>
                {picking === "draft" ? t.choosing : t.browse}
              </button>
            </div>
            <label>
              {t.mode}
              <select
                value={draft.mode}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    mode: (event.target as HTMLSelectElement).value as BlockMode,
                  })
                }
              >
                <option value="random-file">{t.randomFile}</option>
                <option value="next-episode">{t.nextEpisode}</option>
              </select>
            </label>
            <button type="button" class="btn" onClick={() => setDraft(null)}>
              {t.cancel}
            </button>
            <button type="submit" class="primary add-go">
              {draft.id ? t.save : t.add}
            </button>
          </div>
          {draft.id && (
            <button type="button" class="quiet" onClick={() => void removeDraft()}>
              {t.remove}
            </button>
          )}
        </form>
      )}
      {saved && !draft && <p class="muted">{t.saved}</p>}
      <div class="default-play">
        <span>{t.ifEmpty}</span>
        <div class="field">
          <input
            value={schedule.fallbackFolder}
            placeholder={t.folderPlaceholder}
            onInput={(event) => {
              const fallbackFolder = (event.target as HTMLInputElement).value;
              setSchedule((current) => ({ ...current, fallbackFolder }));
              setSaved(false);
            }}
            onBlur={() => void commitFallback()}
          />
          <button type="button" onClick={() => void chooseFallback()} disabled={picking === "fallback"}>
            {picking === "fallback" ? t.choosing : t.change}
          </button>
        </div>
      </div>
    </section>
  );
}
