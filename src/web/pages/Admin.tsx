import { useEffect, useRef, useState } from "preact/hooks";
import {
  DAYS,
  type BlockMode,
  type Day,
  type Schedule,
  type ScheduleBlock,
  type SlotLength,
  type SlotMiss,
} from "../../shared/types.ts";
import { windowOn } from "../../shared/window.ts";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";

const DAY_MINUTES = 24 * 60;

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
  starts: Partial<Record<Day, string>>;
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

function piecesFor(day: Day, blocks: ScheduleBlock[]): Piece[] {
  const mine = blocks
    .filter((block) => block.days.includes(day))
    .slice()
    .sort((a, b) => toMin(windowOn(a, day).start) - toMin(windowOn(b, day).start));
  const out: Piece[] = [];
  let cursor = 0;
  for (const block of mine) {
    const placed = windowOn(block, day);
    const start = toMin(placed.start);
    const end = toMin(placed.end);
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
  const savedWindow = saved ? windowOn(saved, draft.origin) : null;
  if (savedWindow && savedWindow.start === draft.start && savedWindow.end === draft.end) return null;
  const start = Math.max(0, Math.min(toMin(draft.start), DAY_MINUTES));
  const end = Math.max(0, Math.min(toMin(draft.end), DAY_MINUTES));
  if (end <= start) return null;
  return { start, end };
}

function endFromDuration(start: string, durationSec: number): string {
  const endMin = toMin(start) + Math.max(1, Math.ceil(durationSec / 60));
  if (endMin >= DAY_MINUTES) return "23:59";
  return inputTime(endMin);
}

function spillsPastDay(start: string, durationSec: number): boolean {
  return toMin(start) + Math.max(1, Math.ceil(durationSec / 60)) >= DAY_MINUTES;
}

function measureKey(draft: Draft): string {
  return draft.mode === "specific-file"
    ? `video:${draft.file.trim()}`
    : `${draft.mode}:${draft.folder.trim()}`;
}

function nextOnDay(
  day: Day,
  start: string,
  blocks: ScheduleBlock[],
  exceptId: string | null,
): ScheduleBlock | null {
  if (!/^\d{2}:\d{2}$/.test(start)) return null;
  const startMin = toMin(start);
  let next: ScheduleBlock | null = null;
  for (const block of blocks) {
    if (block.id === exceptId) continue;
    if (!block.days.includes(day)) continue;
    const placed = windowOn(block, day);
    if (toMin(placed.start) < startMin) continue;
    if (!next || toMin(placed.start) < toMin(windowOn(next, day).start)) next = block;
  }
  return next;
}

function startOnDraft(draft: Draft, day: Day): string {
  if (day === draft.origin) return draft.start;
  return draft.starts[day] ?? draft.start;
}

function selectedDays(draft: Draft): Day[] {
  return [draft.origin, ...DAYS.filter((day) => day !== draft.origin && draft.days.includes(day))];
}

function dayClashes(
  draft: Draft,
  blocks: ScheduleBlock[],
  durationSec: number,
): { day: Day; title: string; start: string; end: string }[] {
  const clashes: { day: Day; title: string; start: string; end: string }[] = [];
  for (const day of draft.days) {
    const start = startOnDraft(draft, day);
    if (!/^\d{2}:\d{2}$/.test(start)) continue;
    const end = endFromDuration(start, durationSec);
    const startMin = toMin(start);
    const endMin = toMin(end);
    if (endMin <= startMin) continue;
    for (const block of blocks) {
      if (block.id === draft.id) continue;
      if (!block.days.includes(day)) continue;
      const placed = windowOn(block, day);
      if (toMin(placed.start) < endMin && toMin(placed.end) > startMin) {
        clashes.push({ day, title: slotLabel(block), start: placed.start, end });
      }
    }
  }
  return clashes;
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
  const [fitMiss, setFitMiss] = useState<SlotMiss | null>(null);
  const [picking, setPicking] = useState<"draft" | "fallback" | null>(null);
  const [intermissionOpen, setIntermissionOpen] = useState(false);
  const [panelToken, setPanelToken] = useState(0);
  const [measured, setMeasured] = useState<{
    key: string;
    length: SlotLength | null;
    error?: string;
  } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const savedFallback = useRef("");
  const formRef = useRef<HTMLFormElement>(null);
  const intermissionButtonRef = useRef<HTMLButtonElement>(null);
  const intermissionPanelRef = useRef<HTMLDivElement>(null);

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
    formRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setDraft(null);
      setFieldError({});
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelToken]);

  useEffect(() => {
    if (!draft) {
      setMeasured(null);
      setMeasuring(false);
      return;
    }
    const key = measureKey(draft);
    const empty = draft.mode === "specific-file" ? !draft.file.trim() : !draft.folder.trim();
    if (empty) {
      setMeasured({ key, length: null });
      setMeasuring(false);
      return;
    }
    let cancel = false;
    setMeasuring(true);
    const timer = setTimeout(() => {
      api
        .slotLength(draft.mode, draft.folder, draft.file)
        .then((res) => {
          if (cancel) return;
          setMeasured({ key, length: res.length });
          setMeasuring(false);
        })
        .catch((err: unknown) => {
          if (cancel) return;
          const message = err instanceof Error ? err.message : String(err);
          setMeasured({ key, length: null, error: message });
          setMeasuring(false);
        });
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [draft?.mode, draft?.folder, draft?.file, panelToken]);

  useEffect(() => {
    setDraft((current) => {
      if (!current || !measured || measured.key !== measureKey(current)) return current;
      if (!measured.length) {
        if (measured.error) return current;
        return current.end === "" ? current : { ...current, end: "" };
      }
      const end = endFromDuration(current.start, measured.length.durationSec);
      return current.end === end ? current : { ...current, end };
    });
  }, [measured, draft?.start]);

  function openPanel() {
    setPanelToken((token) => token + 1);
    setSaved(false);
    setFitMiss(null);
    setError(null);
    setFieldError({});
  }

  async function persist(next: Schedule) {
    setError(null);
    const res = await api.saveSchedule(next);
    savedFallback.current = res.schedule.fallbackFolder;
    setSchedule(res.schedule);
    setSaved(true);
    return res;
  }

  function openGap(day: Day, startMin: number, endMin: number, at: number) {
    let start = startMin + Math.round((at - startMin) / 30) * 30;
    start = Math.min(Math.max(start, startMin), endMin);
    if (endMin - start < 30) start = startMin;
    setDraft({
      id: null,
      origin: day,
      days: [day],
      start: inputTime(start),
      end: "",
      starts: {},
      folder: "",
      file: "",
      mode: "random-file",
      freeEnd: endMin,
      gapStart: startMin,
    });
    openPanel();
  }

  function openSlot(block: ScheduleBlock, day: Day) {
    const placed = windowOn(block, day);
    const others = schedule.blocks
      .filter((item) => item.id !== block.id && item.days.includes(day))
      .map((item) => windowOn(item, day))
      .sort((a, b) => toMin(a.start) - toMin(b.start));
    let freeEnd = DAY_MINUTES;
    for (const other of others) {
      if (toMin(other.start) >= toMin(placed.end)) freeEnd = Math.min(freeEnd, toMin(other.start));
    }
    const starts: Partial<Record<Day, string>> = {};
    for (const item of block.days) {
      if (item === day) continue;
      starts[item] = windowOn(block, item).start;
    }
    setDraft({
      id: block.id,
      origin: day,
      days: [...block.days],
      start: placed.start,
      end: placed.end,
      starts,
      folder: block.folder,
      file: block.file ?? "",
      mode: block.mode,
      freeEnd,
      gapStart: toMin(placed.start),
    });
    openPanel();
  }

  function toggleDay(day: Day) {
    setDraft((current) => {
      if (!current || day === current.origin) return current;
      if (current.days.includes(day)) {
        const starts = { ...current.starts };
        delete starts[day];
        return { ...current, days: current.days.filter((item) => item !== day), starts };
      }
      return {
        ...current,
        days: [...current.days, day],
        starts: { ...current.starts, [day]: current.start },
      };
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
    if (measuring) {
      next.time = "Still measuring the video.";
    } else if (!draft.end) {
      next.time = "Choose a video or folder to set the length.";
    } else if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) {
      next.time = "start and end must be HH:mm";
    } else if (toMin(draft.end) <= toMin(draft.start)) {
      next.time = `Block ${draft.start}–${draft.end} must end after it starts (same day)`;
    } else {
      for (const day of draft.days) {
        if (day === draft.origin) continue;
        const start = draft.starts[day] ?? draft.start;
        if (!/^\d{2}:\d{2}$/.test(start)) {
          next.time = "start and end must be HH:mm";
          break;
        }
        const known = measured && measured.key === measureKey(draft) ? measured.length : null;
        if (!known) continue;
        const end = endFromDuration(start, known.durationSec);
        if (toMin(end) <= toMin(start)) {
          next.time = `Block ${start}–${end} must end after it starts (same day)`;
          break;
        }
      }
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
    const known = measured && measured.key === measureKey(draft) ? measured.length : null;
    const slotMin = known ? Math.max(1, Math.ceil(known.durationSec / 60)) : 0;
    const days = draft.days.includes(draft.origin) ? draft.days : [draft.origin, ...draft.days];
    const starts: Partial<Record<Day, string>> = {};
    for (const day of days) {
      if (day === draft.origin) continue;
      starts[day] = draft.starts[day] ?? draft.start;
    }
    const block: ScheduleBlock = {
      id: draft.id ?? crypto.randomUUID(),
      days,
      start: draft.start,
      end: draft.end,
      ...(slotMin > 0 ? { lengthMin: slotMin } : {}),
      ...(Object.keys(starts).length > 0 ? { starts } : {}),
      folder: video ? parentDir(file) : draft.folder.trim(),
      ...(video ? { file } : {}),
      mode: draft.mode,
    };
    const blocks = draft.id
      ? schedule.blocks.map((item) => (item.id === draft.id ? block : item))
      : [...schedule.blocks, block];
    try {
      const res = await persist({ ...schedule, blocks });
      setFitMiss(res.misses.find((miss) => miss.blockId === block.id) ?? null);
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
  const matched = draft && measured?.key === measureKey(draft) ? measured : null;
  const length = matched?.length ?? null;
  const lengthMins = length ? Math.ceil(length.durationSec / 60) : 0;
  const pathChosen = draft
    ? draft.mode === "specific-file"
      ? Boolean(draft.file.trim())
      : Boolean(draft.folder.trim())
    : false;
  const clashes = draft && length ? dayClashes(draft, schedule.blocks, length.durationSec) : [];
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
      {fitMiss && !draft && (
        <p class="fit-warn" role="status">
          {fitMiss.kind === "episode"
            ? t.wontFitEpisode(fitMiss.title, t.runLength(fitMiss.durationSec), t.runLength(fitMiss.limitSec))
            : fitMiss.kind === "folder"
              ? t.wontFitFolder(fitMiss.title, t.runLength(fitMiss.durationSec), t.runLength(fitMiss.limitSec))
              : t.wontFitVideo(fitMiss.title, t.runLength(fitMiss.durationSec), t.runLength(fitMiss.limitSec))}
        </p>
      )}
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
                  const span = piece.end - piece.start;
                  if (piece.kind === "gap") {
                    const long = span >= 120;
                    return (
                      <button
                        key={`gap-${piece.start}`}
                        type="button"
                        class={`gap${long ? " long" : ""}${emptyDay ? " first" : ""}`}
                        style={{ flexGrow: span }}
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
                  const placed = windowOn(piece.block, day);
                  const draftTime = draft ? startOnDraft(draft, day) : "";
                  const picked = draft?.id === piece.block.id && draftTime === placed.start;
                  return (
                    <button
                      key={piece.block.id}
                      type="button"
                      class={`slot${slotKind(piece.block)}${picked ? " pick" : ""}`}
                      style={{ flexGrow: span }}
                      title={piece.block.file ?? piece.block.folder}
                      onClick={() => openSlot(piece.block, day)}
                    >
                      <b>{slotLabel(piece.block)}</b>
                      <i>
                        {clockFace(piece.start)}–{clockFace(piece.end)} · {t.lengthOf(piece.end - piece.start)}
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
          ref={formRef}
          class="add-form"
          onSubmit={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          <header>
            <b>{draft.id ? t.editSlot(t.dayName[draft.origin]) : t.newSlot(t.dayName[draft.origin])}</b>
          </header>
          {fieldError.form && <p class="field-error">{t.error(fieldError.form)}</p>}
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
          <div class="folder-block">
            <span class="k">{draft.mode === "specific-file" ? t.chooseVideo : t.chooseFolder}</span>
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
            {draft.mode === "random-file" && length ? (
              <div class="picked">
                <div>
                  <span class="k">{t.slotDuration}</span>
                  <span class="value">{t.slotDurationOf(lengthMins)}</span>
                </div>
                <div>
                  <span class="k">{t.longestVideo}</span>
                  <span class="value">{length.title}</span>
                </div>
              </div>
            ) : (
              <div class="picked one">
                <div>
                  <span class="k">{t.slotDuration}</span>
                  <span class={length || (measuring && pathChosen) ? "value" : "value dash"}>
                    {length ? t.slotDurationOf(lengthMins) : measuring && pathChosen ? t.measuring : "—"}
                  </span>
                </div>
              </div>
            )}
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
          <div class="day-times">
            {selectedDays(draft).map((day) => {
              const start = startOnDraft(draft, day);
              const clash = clashes
                .filter((item) => item.day === day)
                .sort((a, b) => toMin(a.start) - toMin(b.start))[0];
              const spills = Boolean(length && spillsPastDay(start, length.durationSec));
              const next = nextOnDay(day, start, schedule.blocks, draft.id);
              const note = clash
                ? t.runsInto(clash.end, clash.title, clash.start)
                : spills
                  ? t.pastMidnight
                  : next
                    ? t.nextSlotAt(windowOn(next, day).start, slotLabel(next))
                    : t.noLaterSlot;
              const warn = Boolean(clash || spills);
              return (
                <div class="day-start" key={day}>
                  <span class="day-name">{t.day[day]}</span>
                  <input
                    class="time"
                    type="time"
                    value={start}
                    aria-label={`${t.dayName[day]} ${t.start}`}
                    onInput={(event) => {
                      const value = (event.target as HTMLInputElement).value;
                      setDraft((current) => {
                        if (!current) return current;
                        if (day === current.origin) {
                          const known =
                            measured && measured.key === measureKey(current) ? measured.length : null;
                          const end = known ? endFromDuration(value, known.durationSec) : current.end;
                          return { ...current, start: value, end };
                        }
                        return { ...current, starts: { ...current.starts, [day]: value } };
                      });
                      setFieldError((current) => ({ ...current, time: undefined }));
                    }}
                  />
                  <span class={warn ? "note warn" : "note"} role="status">
                    {note}
                  </span>
                </div>
              );
            })}
          </div>
          {!measuring && pathChosen && matched && !length && !matched.error && (
            <p class="field-error">{t.noVideo}</p>
          )}
          {matched?.error && <p class="field-error">{t.error(matched.error)}</p>}
          {fieldError.time && <p class="field-error">{t.error(fieldError.time)}</p>}
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
