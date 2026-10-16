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
  file: string;
  mode: BlockMode;
  freeEnd: number;
  gapStart: number;
};

type FieldError = {
  time?: string;
  folder?: string;
  form?: string;
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

function parentDir(file: string): string {
  const trimmed = file.trim().replace(/[\\/]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (slash <= 0) return "";
  return trimmed.slice(0, slash);
}

function fileTitle(file: string): string {
  const base = folderLabel(file);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base;
  return base.slice(0, dot);
}

function slotLabel(block: { folder: string; file?: string; mode: BlockMode }): string {
  if (block.mode === "specific-file" && block.file) return fileTitle(block.file);
  return folderLabel(block.folder);
}

type FolderHit = { name: string; path: string };

function FolderPath({
  value,
  placeholder,
  invalid,
  actionLabel,
  actionBusy,
  listLabel,
  kind = "folder",
  onChange,
  onAction,
  onBlur,
}: {
  value: string;
  placeholder: string;
  invalid?: boolean;
  actionLabel: string;
  actionBusy: boolean;
  listLabel: string;
  kind?: "folder" | "video";
  onChange: (value: string) => void;
  onAction: () => void;
  onBlur?: () => void;
}) {
  const [dirs, setDirs] = useState<FolderHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useRef(`folders-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!open || !value.trim()) {
      setDirs([]);
      setActive(-1);
      return;
    }
    let cancel = false;
    const timer = setTimeout(() => {
      api
        .suggestPaths(value, kind)
        .then((next) => {
          if (cancel) return;
          setDirs(kind === "video" ? [...next.videos, ...next.dirs] : next.dirs);
          setActive(-1);
        })
        .catch(() => {
          if (!cancel) setDirs([]);
        });
    }, 150);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [open, value, kind]);

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape" && open && dirs.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (!open || dirs.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % dirs.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? dirs.length - 1 : index - 1));
    } else if (event.key === "Enter" && active >= 0 && dirs[active]) {
      event.preventDefault();
      onChange(dirs[active].path);
    }
  }

  const shown = open && dirs.length > 0;

  return (
    <div class="path-field">
      <div class="field">
        <input
          value={value}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid ? "true" : undefined}
          aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onInput={(event) => {
            setOpen(true);
            onChange((event.target as HTMLInputElement).value);
          }}
          onKeyDown={onKey}
          onBlur={() => {
            setOpen(false);
            onBlur?.();
          }}
        />
        <button type="button" onClick={onAction} disabled={actionBusy}>
          {actionLabel}
        </button>
      </div>
      {shown && (
        <ul class="path-suggest" id={listId} role="listbox" aria-label={listLabel}>
          {dirs.map((dir, index) => (
            <li key={dir.path} role="presentation">
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                class={index === active ? "on" : ""}
                title={dir.path}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChange(dir.path)}
              >
                {dir.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function slotKind(block: { folder: string; mode: BlockMode }): string {
  const name = folderLabel(block.folder).toLowerCase();
  if (name === "shows" || block.mode === "next-episode") return " shows";
  if (block.mode === "specific-file") return " film";
  return "";
}

function formatNow(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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

function ghostRange(draft: Draft, blocks: ScheduleBlock[]): { start: number; end: number } | null {
  if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) return null;
  const saved = draft.id ? blocks.find((block) => block.id === draft.id) : undefined;
  if (saved && saved.start === draft.start && saved.end === draft.end) return null;
  const start = Math.max(0, Math.min(toMin(draft.start), DAY_MINUTES));
  const end = Math.max(0, Math.min(toMin(draft.end), DAY_MINUTES));
  if (end <= start) return null;
  return { start, end };
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
  const [fieldError, setFieldError] = useState<FieldError>({});
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState<"draft" | "fallback" | null>(null);
  const [intermissionOpen, setIntermissionOpen] = useState(false);
  const [panelToken, setPanelToken] = useState(0);
  const [clock, setClock] = useState(formatNow);
  const savedFallback = useRef("");
  const startRef = useRef<HTMLInputElement>(null);
  const intermissionButtonRef = useRef<HTMLButtonElement>(null);
  const intermissionPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setClock(formatNow()), 1000);
    return () => clearInterval(id);
  }, []);

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

  useEffect(() => {
    if (draft) setIntermissionOpen(false);
  }, [draft]);

  useEffect(() => {
    if (!intermissionOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (intermissionButtonRef.current?.contains(target)) return;
      if (intermissionPanelRef.current?.contains(target)) return;
      setIntermissionOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [intermissionOpen]);

  useEffect(() => {
    if (!draft) return;
    startRef.current?.focus();
    startRef.current?.form?.scrollIntoView({ block: "nearest", inline: "nearest" });
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setDraft(null);
      setFieldError({});
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelToken]);

  function openPanel() {
    setPanelToken((token) => token + 1);
    setSaved(false);
    setError(null);
    setFieldError({});
  }

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
      file: "",
      mode: "random-file",
      freeEnd: endMin,
      gapStart: startMin,
    });
    openPanel();
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
      file: block.file ?? "",
      mode: block.mode,
      freeEnd,
      gapStart: toMin(block.start),
    });
    openPanel();
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

  function chooseMode(mode: BlockMode) {
    setDraft((current) => {
      if (!current || current.mode === mode) return current;
      if (mode === "specific-file") {
        const folder = current.folder.trim().replace(/[\\/]+$/, "");
        const kept = current.file && parentDir(current.file) === folder;
        return { ...current, mode, file: kept ? current.file : current.folder };
      }
      const folder =
        current.mode === "specific-file" && current.file
          ? parentDir(current.file) || current.folder
          : current.folder;
      return { ...current, mode, folder };
    });
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  async function choosePath() {
    const video = draft?.mode === "specific-file";
    setPicking("draft");
    setFieldError((current) => ({ ...current, folder: undefined, form: undefined }));
    try {
      const picked = video ? await api.pickFile() : await api.pickFolder();
      if (!picked.path) return;
      const chosen = picked.path;
      setDraft((current) => {
        if (!current) return current;
        if (current.mode === "specific-file") {
          return { ...current, file: chosen, folder: parentDir(chosen) };
        }
        return { ...current, folder: chosen };
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setFieldError((current) => ({ ...current, folder: message }));
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
    const next: FieldError = {};
    if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) {
      next.time = "start and end must be HH:mm";
    } else if (toMin(draft.end) <= toMin(draft.start)) {
      next.time = `Block ${draft.start}–${draft.end} must end after it starts (same day)`;
    }
    const video = draft.mode === "specific-file";
    if (video) {
      if (!draft.file.trim()) next.folder = "Each specific-file block needs a video";
    } else if (!draft.folder.trim()) {
      next.folder = "Each block needs a folder";
    }
    if (next.time || next.folder) {
      setFieldError(next);
      return;
    }
    const file = draft.file.trim();
    const block: ScheduleBlock = {
      id: draft.id ?? crypto.randomUUID(),
      days: draft.days.includes(draft.origin) ? draft.days : [draft.origin, ...draft.days],
      start: draft.start,
      end: draft.end,
      folder: video ? parentDir(file) : draft.folder.trim(),
      ...(video ? { file } : {}),
      mode: draft.mode,
    };
    const blocks = draft.id
      ? schedule.blocks.map((item) => (item.id === draft.id ? block : item))
      : [...schedule.blocks, block];
    try {
      await persist({ ...schedule, blocks });
      setDraft(null);
      setFieldError({});
    } catch (e) {
      setFieldError({ form: e instanceof Error ? e.message : String(e) });
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
      setFieldError({});
    } catch (e) {
      setFieldError({ form: e instanceof Error ? e.message : String(e) });
    }
  }

  const fallbackName = schedule.fallbackFolder ? folderLabel(schedule.fallbackFolder) : "";
  const lengthMins = draft ? Math.max(0, toMin(draft.end) - toMin(draft.start)) : 0;
  const ghost = draft ? ghostRange(draft, schedule.blocks) : null;

  return (
    <section>
      <div class="week-head">
        <h1>{t.week}</h1>
        {!draft && (
          <button
            ref={intermissionButtonRef}
            type="button"
            class={intermissionOpen ? "intermission on" : "intermission"}
            aria-expanded={intermissionOpen}
            onClick={() => setIntermissionOpen((open) => !open)}
          >
            {t.intermission} · <b>{fallbackName || t.none}</b>
            <i>{intermissionOpen ? "▴" : "▾"}</i>
          </button>
        )}
      </div>
      {error && <p class="error">{t.error(error)}</p>}
      <div class={draft ? "week-wrap drafting" : "week-wrap"}>
      {!draft && intermissionOpen && (
        <div class="intermission-open" ref={intermissionPanelRef}>
          <span>{t.ifEmpty}</span>
          {fallbackName && <p class="folder-name">{fallbackName}</p>}
          <FolderPath
            kind="folder"
            value={schedule.fallbackFolder}
            placeholder={t.folderPlaceholder}
            actionLabel={picking === "fallback" ? t.choosing : t.browse}
            actionBusy={picking === "fallback"}
            listLabel={t.folder}
            onChange={(fallbackFolder) => {
              setSchedule((current) => ({ ...current, fallbackFolder }));
              setSaved(false);
            }}
            onAction={() => void chooseFallback()}
            onBlur={() => void commitFallback()}
          />
          <span>
            {t.nextHint} {t.intermissionCut}
          </span>
        </div>
      )}
      <div class="week-scale">
        <div class="hours" aria-hidden="true">
          {["00", "04", "08", "12", "16", "20", "24"].map((hour) => (
            <span key={hour}>{hour}</span>
          ))}
        </div>
        {DAYS.map((day) => {
          const pieces = piecesFor(day, schedule.blocks);
          const emptyDay = pieces.length === 1 && pieces[0]?.kind === "gap";
          const editing = draft?.origin === day;
          return (
            <div key={day} class={`day${day === today ? " on" : ""}${editing ? " editing" : ""}`}>
              <span class="name">{t.day[day]}</span>
              <div class="track">
                {pieces.map((piece) => {
                  const hours = (piece.end - piece.start) / 60;
                  if (piece.kind === "gap") {
                    const long = piece.end - piece.start >= 120;
                    return (
                      <button
                        key={`gap-${piece.start}`}
                        type="button"
                        class={`gap${long ? " long" : ""}${emptyDay ? " first" : ""}`}
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
                  const picked =
                    draft?.id === piece.block.id &&
                    draft.start === piece.block.start &&
                    draft.end === piece.block.end;
                  return (
                    <button
                      key={piece.block.id}
                      type="button"
                      class={`slot${slotKind(piece.block)}${picked ? " pick" : ""}`}
                      style={{ height: `${hours * HOUR_PX}px` }}
                      title={piece.block.file ?? piece.block.folder}
                      onClick={() => openSlot(piece.block, day)}
                    >
                      <b>{slotLabel(piece.block)}</b>
                      <i>
                        {piece.block.start}–{piece.block.end} · {t.lengthOf(piece.end - piece.start)}
                      </i>
                    </button>
                  );
                })}
                {editing && ghost && (
                  <span
                    class={`ghost${slotKind(draft)}`}
                    style={{
                      top: `${(ghost.start / DAY_MINUTES) * 100}%`,
                      height: `${((ghost.end - ghost.start) / DAY_MINUTES) * 100}%`,
                    }}
                  >
                    <b>
                      {clockFace(ghost.start)}–{clockFace(ghost.end)}
                    </b>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {draft && <div class="scrim" />}
      {draft && (
        <form
          class="add-form"
          onSubmit={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          <header>
            <b>{draft.id ? t.editSlot(t.dayName[draft.origin]) : t.newSlot(t.dayName[draft.origin])}</b>
            <time class="now" dateTime={clock}>
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.4" />
                <path d="M8 4.5V8.2L10.4 9.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              </svg>
              {clock}
            </time>
          </header>
          {fieldError.form && <p class="field-error">{t.error(fieldError.form)}</p>}
          <div class="add-when">
            <label>
              {t.start}
              <input
                ref={startRef}
                type="time"
                value={draft.start}
                onInput={(event) => {
                  setDraft({ ...draft, start: (event.target as HTMLInputElement).value });
                  setFieldError((current) => ({ ...current, time: undefined }));
                }}
              />
            </label>
            <label>
              {t.end}
              <input
                type="time"
                value={draft.end}
                onInput={(event) => {
                  setDraft({ ...draft, end: (event.target as HTMLInputElement).value });
                  setFieldError((current) => ({ ...current, time: undefined }));
                }}
              />
            </label>
            <div class="len">
              <span class="k">{t.length}</span>
              <b>{t.lengthOf(lengthMins)}</b>
            </div>
          </div>
          {fieldError.time && <p class="field-error">{t.error(fieldError.time)}</p>}
          <div class="folder-block">
            <span class="k">{draft.mode === "specific-file" ? t.video : t.folder}</span>
            {(draft.mode === "specific-file" ? draft.file : draft.folder) && (
              <p class="folder-name">
                {draft.mode === "specific-file" ? fileTitle(draft.file) : folderLabel(draft.folder)}
              </p>
            )}
            <FolderPath
              key={draft.mode}
              kind={draft.mode === "specific-file" ? "video" : "folder"}
              value={draft.mode === "specific-file" ? draft.file : draft.folder}
              placeholder={draft.mode === "specific-file" ? t.videoPlaceholder : t.folderPlaceholder}
              invalid={Boolean(fieldError.folder)}
              actionLabel={picking === "draft" ? t.choosing : t.browse}
              actionBusy={picking === "draft"}
              listLabel={draft.mode === "specific-file" ? t.video : t.folder}
              onChange={(value) => {
                setDraft(
                  draft.mode === "specific-file"
                    ? { ...draft, file: value, folder: parentDir(value) }
                    : { ...draft, folder: value },
                );
                setFieldError((current) => ({ ...current, folder: undefined }));
              }}
              onAction={() => void choosePath()}
            />
            {fieldError.folder && <p class="field-error">{t.error(fieldError.folder)}</p>}
          </div>
          <div class="pick-mode">
            <span class="k">{t.playHow}</span>
            <div class="modes" role="radiogroup" aria-label={t.playHow}>
              <button
                type="button"
                role="radio"
                aria-checked={draft.mode === "random-file"}
                class={draft.mode === "random-file" ? "mode on movie" : "mode"}
                onClick={() => chooseMode("random-file")}
              >
                <b>{t.randomFile}</b>
                <span>{t.randomHint}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={draft.mode === "next-episode"}
                class={draft.mode === "next-episode" ? "mode on shows" : "mode"}
                onClick={() => chooseMode("next-episode")}
              >
                <b>{t.nextEpisode}</b>
                <span>{t.nextHint}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={draft.mode === "specific-file"}
                class={draft.mode === "specific-file" ? "mode on film" : "mode"}
                onClick={() => chooseMode("specific-file")}
              >
                <b>{t.oneVideo}</b>
                <span>{t.oneHint}</span>
              </button>
            </div>
          </div>
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
          <div class="actions">
            {draft.id && (
              <button type="button" class="quiet" onClick={() => void removeDraft()}>
                {t.remove}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setFieldError({});
              }}
            >
              {t.cancel}
            </button>
            <button type="submit" class="primary">
              {draft.id ? t.save : t.add}
            </button>
          </div>
        </form>
      )}
      </div>
      {saved && !draft && <p class="muted">{t.saved}</p>}
    </section>
  );
}
