import { useEffect, useRef, useState } from "preact/hooks";
import {
  DAYS,
  type BlockMode,
  type Day,
  type IntermissionItem,
  type IntermissionKind,
  type Schedule,
  type ScheduleBlock,
  type SlotLength,
  type SlotMiss,
} from "../../shared/types.ts";
import {
  DAY_MINUTES,
  clockOf,
  leftoverMin,
  lengthMinutes,
  nextDay,
  prevDay,
  segmentsOf,
  windowOn,
} from "../../shared/window.ts";
import {
  canonicalYoutubeIntermission,
  isYoutubeLink,
  isYoutubeUrl,
  parseYoutubeUrl,
  youtubeLabel,
} from "../../shared/youtube.ts";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";

const PRESETS = [30, 60, 90, 120, 260] as const;
const MANY_FILES = 20;
const BUSY_SPIN_MS = 400;

type PresetMin = (typeof PRESETS)[number];
type LengthChoice = "longest" | PresetMin | "custom";
type TipKey = "30" | "60" | "90" | "120" | "260" | "custom";

const WEEKDAY: Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type Piece =
  | { kind: "gap"; start: number; end: number }
  | { kind: "slot"; block: ScheduleBlock; start: number; end: number; origin: Day };

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
  lengthChoice: LengthChoice;
  customMin: string;
  freeEnd: number;
  gapStart: number;
};

function isPreset(value: number): value is PresetMin {
  return (PRESETS as readonly number[]).includes(value);
}

function fixedMinutes(draft: Draft): number | null {
  if (draft.lengthChoice === "longest") return null;
  if (draft.lengthChoice === "custom") {
    if (!/^\d+$/.test(draft.customMin.trim())) return null;
    const mins = Number(draft.customMin);
    return mins >= 1 ? mins : null;
  }
  return draft.lengthChoice;
}

function choiceFromLength(lengthMin?: number): { lengthChoice: LengthChoice; customMin: string } {
  if (lengthMin && isPreset(lengthMin)) return { lengthChoice: lengthMin, customMin: "" };
  if (lengthMin && lengthMin > 0) return { lengthChoice: "custom", customMin: String(lengthMin) };
  return { lengthChoice: "longest", customMin: "" };
}

function fixedChoice(lengthMin?: number): { lengthChoice: LengthChoice; customMin: string } {
  const choice = choiceFromLength(lengthMin);
  if (choice.lengthChoice === "longest") return { lengthChoice: 60, customMin: "" };
  return choice;
}

function elapsedClock(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rest = sec % 60;
  return `${mins}:${String(rest).padStart(2, "0")}`;
}

function showCloud(event: { currentTarget: EventTarget | null }) {
  const node = event.currentTarget as HTMLElement | null;
  const host = node?.closest(".cloud-host");
  if (host) placeCloud({ currentTarget: host });
}

function placeCloud(event: { currentTarget: EventTarget | null }) {
  const host = event.currentTarget as HTMLElement | null;
  const cloud = host?.querySelector(":scope > .cloud") as HTMLElement | null;
  if (!host || !cloud) return;
  cloud.style.display = "block";
  cloud.style.position = "fixed";
  cloud.style.bottom = "auto";
  const hostRect = host.getBoundingClientRect();
  const width = cloud.offsetWidth;
  const height = cloud.offsetHeight;
  const pad = 12;
  let left = hostRect.left;
  if (left + width > window.innerWidth - pad) left = window.innerWidth - pad - width;
  if (left < pad) left = pad;
  const top = Math.max(pad, hostRect.top - height - 12);
  cloud.style.left = `${left}px`;
  cloud.style.top = `${top}px`;
  const tail = hostRect.left + hostRect.width / 2 - left;
  cloud.style.setProperty("--tail", `${Math.min(Math.max(tail, 14), Math.max(14, width - 14))}px`);
  cloud.style.display = "";
}

function InfoMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.15" />
      <path d="M8 7.15v4" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" />
      <circle cx="8" cy="4.7" r="0.7" fill="currentColor" />
    </svg>
  );
}

type FieldError = {
  time?: string;
  folder?: string;
  form?: string;
};

type SlotOp = "save" | "remove";

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

function slotLabel(
  block: { folder: string; file?: string; mode: BlockMode },
  titles: Readonly<Record<string, string>> = {},
): string {
  if (block.mode === "youtube" && block.file) {
    const url = parseYoutubeUrl(block.file);
    if (url && titles[url]) return titles[url];
    return youtubeLabel(block.file);
  }
  if (block.mode === "specific-file" && block.file) return fileTitle(block.file);
  return folderLabel(block.folder);
}

function slotHover(
  block: { folder: string; file?: string; mode: BlockMode },
  titles: Readonly<Record<string, string>>,
): string {
  if (block.mode === "youtube" && block.file) {
    const url = parseYoutubeUrl(block.file);
    const title = url ? titles[url] : "";
    if (title && url) return `${title}\n${url}`;
    return block.file;
  }
  return block.file ?? block.folder;
}

function intermissionLabel(item: IntermissionItem, titles: Readonly<Record<string, string>> = {}): string {
  if (item.kind === "youtube") {
    const url = canonicalYoutubeIntermission(item.source);
    if (url && titles[url]) return titles[url];
    return youtubeLabel(item.source);
  }
  if (item.kind === "video") return fileTitle(item.source);
  return folderLabel(item.source);
}

function youtubeScheduleKey(schedule: Schedule, extra = ""): string {
  const urls = new Set<string>();
  for (const item of schedule.intermissions) {
    if (item.kind !== "youtube") continue;
    const url = canonicalYoutubeIntermission(item.source);
    if (url) urls.add(url);
  }
  const draft = canonicalYoutubeIntermission(extra);
  if (draft) urls.add(draft);
  for (const block of schedule.blocks) {
    if (block.mode !== "youtube") continue;
    const url = parseYoutubeUrl(block.file ?? "");
    if (url) urls.add(url);
  }
  return [...urls].sort().join("\n");
}

function pendingSource(
  kind: IntermissionKind,
  value: string,
): { source: string; error: "youtube" | "youtube-in-path" | null } {
  const trimmed = value.trim();
  if (!trimmed) return { source: "", error: null };
  if (kind === "youtube") {
    const parsed = canonicalYoutubeIntermission(trimmed);
    if (!parsed) return { source: trimmed, error: "youtube" };
    return { source: parsed, error: null };
  }
  if (isYoutubeLink(trimmed)) return { source: trimmed, error: "youtube-in-path" };
  return { source: trimmed, error: null };
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
  onEnter,
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
  onEnter?: () => void;
}) {
  const [dirs, setDirs] = useState<FolderHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useRef(`folders-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!open || !value.trim() || isYoutubeLink(value)) {
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
    if (!open || dirs.length === 0) {
      if (event.key === "Enter") onEnter?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % dirs.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? dirs.length - 1 : index - 1));
    } else if (event.key === "Enter" && active >= 0 && dirs[active]) {
      event.preventDefault();
      onChange(dirs[active].path);
    } else if (event.key === "Enter") {
      onEnter?.();
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
  if (block.mode === "youtube") return " tube";
  return "";
}

function rowStyle(span: number): Record<string, string> {
  return { "--mins": String(Math.max(0, span)) };
}

function piecesFor(day: Day, blocks: ScheduleBlock[]): Piece[] {
  const mine: { block: ScheduleBlock; start: number; end: number; origin: Day }[] = [];
  for (const block of blocks) {
    if (block.days.includes(day)) {
      const placed = windowOn(block, day);
      const end = Math.min(placed.endMin, DAY_MINUTES);
      if (end > placed.startMin) mine.push({ block, start: placed.startMin, end, origin: day });
    }
    const prev = prevDay(day);
    if (block.days.includes(prev)) {
      const leftover = leftoverMin(windowOn(block, prev));
      if (leftover > 0) mine.push({ block, start: 0, end: leftover, origin: prev });
    }
  }
  mine.sort((a, b) => a.start - b.start);
  const out: Piece[] = [];
  let cursor = 0;
  for (const piece of mine) {
    if (piece.start > cursor) out.push({ kind: "gap", start: cursor, end: piece.start });
    out.push({ kind: "slot", ...piece });
    cursor = Math.max(cursor, piece.end);
  }
  if (cursor < DAY_MINUTES) out.push({ kind: "gap", start: cursor, end: DAY_MINUTES });
  return out;
}

function draftSpanMin(draft: Draft): number {
  const fixed = fixedMinutes(draft);
  if (fixed) return fixed;
  if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) return 0;
  const start = toMin(draft.start);
  const end = toMin(draft.end);
  if (end > start) return end - start;
  if (end < start) return DAY_MINUTES - start + end;
  return 0;
}

function ghostsOn(draft: Draft, day: Day, blocks: ScheduleBlock[]): { start: number; end: number }[] {
  const span = draftSpanMin(draft);
  if (span < 1) return [];
  const saved = draft.id ? blocks.find((block) => block.id === draft.id) : undefined;
  if (saved && windowOn(saved, draft.origin).start === draft.start && lengthMinutes(saved) === span) {
    return [];
  }
  const out: { start: number; end: number }[] = [];
  for (const air of draft.days) {
    const start = toMin(startOnDraft(draft, air));
    if (day === air) out.push({ start, end: Math.min(start + span, DAY_MINUTES) });
    if (day === nextDay(air)) {
      const leftover = start + span - DAY_MINUTES;
      if (leftover > 0) out.push({ start: 0, end: leftover });
    }
  }
  return out;
}

function endFromDuration(start: string, durationSec: number): string {
  const endMin = toMin(start) + Math.max(1, Math.ceil(durationSec / 60));
  return clockOf(endMin);
}

function endFace(start: string, durationSec: number): string {
  const endMin = toMin(start) + Math.max(1, Math.ceil(durationSec / 60));
  if (endMin > DAY_MINUTES) return clockOf(endMin);
  return clockFace(endMin);
}

function spillsPastDay(start: string, durationSec: number): boolean {
  return toMin(start) + Math.max(1, Math.ceil(durationSec / 60)) > DAY_MINUTES;
}

function measureKey(draft: Draft): string {
  if (draft.mode === "specific-file" || draft.mode === "youtube") {
    return `video:${draft.file.trim()}`;
  }
  return `${draft.mode}:${draft.folder.trim()}`;
}

function chosenSeconds(
  draft: Draft,
  measured: { key: string; length: SlotLength | null } | null,
): number | null {
  if (draft.lengthChoice !== "longest") {
    const mins = fixedMinutes(draft);
    return mins ? mins * 60 : null;
  }
  if (!measured || measured.key !== measureKey(draft) || !measured.length) return null;
  return measured.length.durationSec;
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

function prevOnDay(
  day: Day,
  start: string,
  blocks: ScheduleBlock[],
  exceptId: string | null,
): ScheduleBlock | null {
  if (!/^\d{2}:\d{2}$/.test(start)) return null;
  const startMin = toMin(start);
  let prev: ScheduleBlock | null = null;
  for (const block of blocks) {
    if (block.id === exceptId) continue;
    if (!block.days.includes(day)) continue;
    const placed = windowOn(block, day);
    if (toMin(placed.start) >= startMin) continue;
    if (!prev || toMin(placed.start) > toMin(windowOn(prev, day).start)) prev = block;
  }
  return prev;
}

function startOnDraft(draft: Draft, day: Day): string {
  if (day === draft.origin) return draft.start;
  return draft.starts[day] ?? draft.start;
}

function selectedDays(draft: Draft): Day[] {
  return [draft.origin, ...DAYS.filter((day) => day !== draft.origin && draft.days.includes(day))];
}

function draftAsBlock(draft: Draft, durationSec: number): ScheduleBlock {
  const lengthMin = Math.max(1, Math.ceil(durationSec / 60));
  return {
    id: draft.id ?? "draft",
    days: draft.days,
    start: draft.start,
    end: endFromDuration(draft.start, durationSec),
    lengthMin,
    starts: draft.starts,
    folder: draft.folder,
    file: draft.file,
    mode: draft.mode,
  };
}

function dayClashes(
  draft: Draft,
  blocks: ScheduleBlock[],
  durationSec: number,
  titles: Readonly<Record<string, string>> = {},
): { day: Day; title: string; start: string; end: string }[] {
  const clashes: { day: Day; title: string; start: string; end: string }[] = [];
  const draftSegs = segmentsOf(draftAsBlock(draft, durationSec));
  for (const block of blocks) {
    if (block.id === draft.id) continue;
    for (const other of segmentsOf(block)) {
      for (const mine of draftSegs) {
        if (mine.day !== other.day) continue;
        if (mine.start < other.end && other.start < mine.end) {
          clashes.push({
            day: mine.day,
            title: slotLabel(block, titles),
            start: clockOf(other.start),
            end: clockOf(other.end),
          });
        }
      }
    }
  }
  return clashes;
}

function emptySchedule(): Schedule {
  return { blocks: [], intermissions: [], activeIntermission: "", intermissionRandomStart: false };
}

export function Admin() {
  const { t } = useI18n();
  const today = WEEKDAY[new Date().getDay()]!;
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule);
  const [youtubeTitles, setYoutubeTitles] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError>({});
  const [slotOp, setSlotOp] = useState<SlotOp | null>(null);
  const [slotOpSlow, setSlotOpSlow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fitMiss, setFitMiss] = useState<SlotMiss | null>(null);
  const [picking, setPicking] = useState<"draft" | "fallback" | null>(null);
  const [intermissionOpen, setIntermissionOpen] = useState(false);
  const [addKind, setAddKind] = useState<IntermissionKind>("folder");
  const [addDraft, setAddDraft] = useState("");
  const [intermissionError, setIntermissionError] = useState<string | null>(null);
  const [intermissionSaving, setIntermissionSaving] = useState(false);
  const [panelToken, setPanelToken] = useState(0);
  const [measured, setMeasured] = useState<{
    key: string;
    length: SlotLength | null;
    error?: string;
  } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sourceMissing, setSourceMissing] = useState(false);
  const scheduleRef = useRef(schedule);
  const addKindRef = useRef<IntermissionKind>("folder");
  const addDraftRef = useRef("");
  scheduleRef.current = schedule;
  addKindRef.current = addKind;
  addDraftRef.current = addDraft;
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const slotOpRef = useRef<SlotOp | null>(null);
  const intermissionButtonRef = useRef<HTMLButtonElement>(null);
  const intermissionPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .schedule()
      .then((loaded) => {
        setSchedule({
          ...emptySchedule(),
          ...loaded,
          blocks: loaded.blocks ?? [],
          intermissions: loaded.intermissions ?? [],
          activeIntermission: loaded.activeIntermission ?? "",
          intermissionRandomStart: loaded.intermissionRandomStart === true,
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const titleKey = youtubeScheduleKey(schedule, addKind === "youtube" ? addDraft : "");
  useEffect(() => {
    const urls = titleKey ? titleKey.split("\n") : [];
    if (urls.length === 0) return;
    let cancel = false;
    api
      .youtubeTitles(urls)
      .then((res) => {
        if (!cancel) setYoutubeTitles((current) => ({ ...current, ...res.titles }));
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [titleKey]);

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
      if (event.key !== "Escape" || slotOpRef.current) return;
      setDraft(null);
      setFieldError({});
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelToken]);

  useEffect(() => {
    if (!draft?.id || draft.mode === "youtube") {
      setSourceMissing(false);
      return;
    }
    const file = draft.mode === "specific-file" ? draft.file.trim() : "";
    const folder = draft.folder.trim();
    if (draft.mode === "specific-file" ? !file : !folder) {
      setSourceMissing(false);
      return;
    }
    let cancel = false;
    api
      .videoCount(folder, file)
      .then((res) => {
        if (!cancel) setSourceMissing(res.exists === false);
      })
      .catch(() => {
        if (!cancel) setSourceMissing(false);
      });
    return () => {
      cancel = true;
    };
  }, [draft?.id, draft?.mode, draft?.folder, draft?.file]);

  useEffect(() => {
    if (!draft || draft.lengthChoice !== "longest") {
      setMeasured(null);
      setMeasuring(false);
      setFileCount(0);
      return;
    }
    const key = measureKey(draft);
    const empty =
      draft.mode === "youtube"
        ? !parseYoutubeUrl(draft.file)
        : draft.mode === "specific-file"
          ? !draft.file.trim()
          : !draft.folder.trim();
    if (empty) {
      setMeasured({ key, length: null });
      setMeasuring(false);
      setFileCount(0);
      return;
    }
    let cancel = false;
    setMeasuring(true);
    setMeasured(null);
    setFileCount(0);
    if (draft.mode === "random-file") {
      api
        .videoCount(draft.folder)
        .then((res) => {
          if (!cancel) setFileCount(res.count);
        })
        .catch(() => {});
    }
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
  }, [draft?.mode, draft?.folder, draft?.file, draft?.lengthChoice, panelToken]);

  useEffect(() => {
    if (!slotOp) {
      setSlotOpSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlotOpSlow(true), BUSY_SPIN_MS);
    return () => window.clearTimeout(id);
  }, [slotOp]);

  useEffect(() => {
    if (!fieldError.form) return;
    formErrorRef.current?.scrollIntoView({ block: "nearest" });
  }, [fieldError.form]);

  useEffect(() => {
    if (!measuring) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    setElapsedSec(0);
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [measuring, draft?.mode, draft?.folder, draft?.file]);

  useEffect(() => {
    setDraft((current) => {
      if (!current) return current;
      if (current.lengthChoice !== "longest") {
        const mins = fixedMinutes(current);
        if (!mins) return current.end === "" ? current : { ...current, end: "" };
        const end = endFromDuration(current.start, mins * 60);
        return current.end === end ? current : { ...current, end };
      }
      if (!measured || measured.key !== measureKey(current)) return current;
      if (!measured.length) {
        if (measured.error) return current;
        return current.end === "" ? current : { ...current, end: "" };
      }
      const end = endFromDuration(current.start, measured.length.durationSec);
      return current.end === end ? current : { ...current, end };
    });
  }, [measured, draft?.start, draft?.lengthChoice, draft?.customMin]);

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
      lengthChoice: "longest",
      customMin: "",
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
      ...(block.mode === "youtube"
        ? { lengthChoice: "longest" as const, customMin: "" }
        : block.mode === "next-episode"
          ? fixedChoice(block.lengthMin)
          : choiceFromLength(block.lengthMin)),
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
      if (mode === "youtube") {
        const kept = isYoutubeUrl(current.file)
          ? current.file
          : isYoutubeUrl(current.folder)
            ? current.folder
            : "";
        return { ...current, mode, file: kept, folder: "", lengthChoice: "longest" };
      }
      if (current.mode === "youtube") {
        const next = { ...current, mode, file: "", folder: "" };
        return mode === "next-episode" && next.lengthChoice === "longest"
          ? { ...next, lengthChoice: 60 }
          : next;
      }
      if (mode === "specific-file") {
        const folder = current.folder.trim().replace(/[\\/]+$/, "");
        const kept = current.file && parentDir(current.file) === folder;
        return { ...current, mode, file: kept ? current.file : current.folder };
      }
      const folder =
        current.mode === "specific-file" && current.file
          ? parentDir(current.file) || current.folder
          : current.folder;
      const next = { ...current, mode, folder };
      return mode === "next-episode" && next.lengthChoice === "longest"
        ? { ...next, lengthChoice: 60 }
        : next;
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

  function editAddDraft(value: string) {
    addDraftRef.current = value;
    setAddDraft(value);
    setIntermissionError(null);
    setSaved(false);
  }

  function chooseAddKind(kind: IntermissionKind) {
    addKindRef.current = kind;
    setAddKind(kind);
    setIntermissionError(null);
  }

  async function chooseAddSource() {
    const video = addKindRef.current === "video";
    setPicking("fallback");
    setIntermissionError(null);
    try {
      const picked = video ? await api.pickFile() : await api.pickFolder();
      if (!picked.path) return;
      editAddDraft(picked.path);
    } catch (e) {
      setIntermissionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
  }

  async function changeIntermission(
    next: Pick<Schedule, "intermissions" | "activeIntermission"> &
      Partial<Pick<Schedule, "intermissionRandomStart">>,
  ): Promise<boolean> {
    const current = scheduleRef.current;
    setIntermissionSaving(true);
    setIntermissionError(null);
    try {
      await persist({ ...current, ...next });
      return true;
    } catch (e) {
      setIntermissionError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setIntermissionSaving(false);
    }
  }

  async function addIntermission() {
    const pending = pendingSource(addKindRef.current, addDraftRef.current);
    if (pending.error) {
      setIntermissionError(pending.error);
      return;
    }
    if (!pending.source) return;
    const current = scheduleRef.current;
    const item: IntermissionItem = {
      id: crypto.randomUUID(),
      kind: addKindRef.current,
      source: pending.source,
    };
    const saved = await changeIntermission({
      intermissions: [...current.intermissions, item],
      activeIntermission: current.activeIntermission || item.id,
    });
    if (!saved) return;
    addDraftRef.current = "";
    setAddDraft("");
  }

  function setIntermissionRandomStart(on: boolean) {
    const current = scheduleRef.current;
    if (current.intermissionRandomStart === on) return;
    setSchedule({ ...current, intermissionRandomStart: on });
    void changeIntermission({
      intermissions: current.intermissions,
      activeIntermission: current.activeIntermission,
      intermissionRandomStart: on,
    }).then((saved) => {
      if (saved) return;
      setSchedule((latest) =>
        latest.intermissionRandomStart === on ? { ...latest, intermissionRandomStart: !on } : latest,
      );
    });
  }

  function selectIntermission(id: string) {
    const current = scheduleRef.current;
    if (current.activeIntermission === id) return;
    void changeIntermission({ intermissions: current.intermissions, activeIntermission: id });
  }

  function removeIntermission(id: string) {
    const current = scheduleRef.current;
    void changeIntermission({
      intermissions: current.intermissions.filter((item) => item.id !== id),
      activeIntermission: current.activeIntermission === id ? "" : current.activeIntermission,
    });
  }

  function intermissionErrorText(error: string): string {
    if (error === "youtube") return t.error("Not a YouTube video or playlist URL");
    if (error === "youtube-in-path") return t.intermissionYoutubeInFolder;
    return t.error(error);
  }

  async function commit() {
    if (!draft) return;
    const next: FieldError = {};
    if (measuring) {
      next.time = "Still measuring the video.";
    } else if (!draft.end) {
      next.time = "Choose a video, folder, or YouTube URL to set the length.";
    } else if (!/^\d{2}:\d{2}$/.test(draft.start) || !/^\d{2}:\d{2}$/.test(draft.end)) {
      next.time = "start and end must be HH:mm";
    } else {
      const sec = chosenSeconds(draft, measured);
      const slotMin = sec ? Math.max(1, Math.ceil(sec / 60)) : 0;
      if (slotMin >= DAY_MINUTES) next.time = "Block must be shorter than 24 hours";
      for (const day of draft.days) {
        if (day === draft.origin) continue;
        const start = draft.starts[day] ?? draft.start;
        if (!/^\d{2}:\d{2}$/.test(start)) {
          next.time = "start and end must be HH:mm";
          break;
        }
      }
    }
    const video = draft.mode === "specific-file";
    const youtube = draft.mode === "youtube";
    if (video) {
      if (!draft.file.trim()) next.folder = "Each specific-file block needs a video";
    } else if (youtube) {
      if (!parseYoutubeUrl(draft.file)) next.folder = "Each YouTube slot needs a YouTube video URL";
    } else if (!draft.folder.trim()) {
      next.folder = "Each block needs a folder";
    }
    if (sourceMissing) {
      next.folder = draft.mode === "specific-file" ? t.sourceMissingVideo : t.sourceMissingFolder;
    }
    if (next.time || next.folder) {
      setFieldError(next);
      return;
    }
    if (slotOpRef.current) return;
    const file = youtube ? (parseYoutubeUrl(draft.file) ?? draft.file.trim()) : draft.file.trim();
    const sec = chosenSeconds(draft, measured);
    const slotMin = sec ? Math.max(1, Math.ceil(sec / 60)) : 0;
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
      folder: video ? parentDir(file) : youtube ? "" : draft.folder.trim(),
      ...((video || youtube) ? { file } : {}),
      mode: draft.mode,
    };
    const blocks = draft.id
      ? schedule.blocks.map((item) => (item.id === draft.id ? block : item))
      : [...schedule.blocks, block];
    beginSlotOp("save");
    try {
      const res = await persist({ ...schedule, blocks });
      setFitMiss(res.misses.find((miss) => miss.blockId === block.id) ?? null);
      setDraft(null);
      setFieldError({});
    } catch (e) {
      setFieldError({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      endSlotOp();
    }
  }

  function beginSlotOp(op: SlotOp) {
    slotOpRef.current = op;
    setSlotOp(op);
    setFieldError((current) => ({ ...current, form: undefined }));
  }

  function endSlotOp() {
    slotOpRef.current = null;
    setSlotOp(null);
  }

  async function removeDraft() {
    if (!draft?.id || slotOpRef.current) return;
    beginSlotOp("remove");
    try {
      await persist({
        ...schedule,
        blocks: schedule.blocks.filter((item) => item.id !== draft.id),
      });
      setDraft(null);
      setFieldError({});
    } catch (e) {
      setFieldError({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      endSlotOp();
    }
  }

  function chooseLength(source: "fixed" | "longest") {
    setDraft((current) => {
      if (!current) return current;
      if (source === "longest") {
        return current.lengthChoice === "longest" ? current : { ...current, lengthChoice: "longest", end: "" };
      }
      if (current.lengthChoice !== "longest") return current;
      return { ...current, lengthChoice: 60 };
    });
    setFieldError((current) => ({ ...current, time: undefined }));
  }

  const selectedIntermission =
    schedule.intermissions.find((item) => item.id === schedule.activeIntermission) ?? null;
  const fallbackName = selectedIntermission
    ? intermissionLabel(selectedIntermission, youtubeTitles)
    : "";
  const pendingAdd = pendingSource(addKind, addDraft);
  const addPreview = pendingAdd.error
    ? ""
    : pendingAdd.source
      ? intermissionLabel({ id: "", kind: addKind, source: pendingAdd.source }, youtubeTitles)
      : "";
  const matched = draft && measured?.key === measureKey(draft) ? measured : null;
  const length = matched?.length ?? null;
  const lengthMins = length ? Math.ceil(length.durationSec / 60) : 0;
  const pathChosen = draft
    ? draft.mode === "youtube"
      ? Boolean(parseYoutubeUrl(draft.file))
      : draft.mode === "specific-file"
        ? Boolean(draft.file.trim())
        : Boolean(draft.folder.trim())
    : false;
  const activeSec = draft ? (chosenSeconds(draft, matched) ?? 0) : 0;
  const fixedMin = draft && draft.lengthChoice !== "longest" ? fixedMinutes(draft) : null;
  const clashes = draft && activeSec ? dayClashes(draft, schedule.blocks, activeSec, youtubeTitles) : [];
  const lengthLabels = [...PRESETS.map((mins) => t.minutes(mins)), t.customLength];
  const lengthCh = Math.max(...lengthLabels.map((label) => label.length));
  const addDisabled = !draft
    ? true
    : sourceMissing
      ? true
      : draft.lengthChoice === "longest"
        ? measuring || !pathChosen || !length || Boolean(matched?.error)
        : !pathChosen || fixedMin === null;
  const ghostsByDay = draft
    ? Object.fromEntries(DAYS.map((day) => [day, ghostsOn(draft, day, schedule.blocks)]))
    : null;

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
            title={fallbackName || undefined}
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
            <button
              type="button"
              class={schedule.intermissionRandomStart ? "intermission-random on" : "intermission-random"}
              role="switch"
              aria-checked={schedule.intermissionRandomStart}
              title={t.intermissionRandomHint}
              disabled={intermissionSaving}
              onClick={() => setIntermissionRandomStart(!schedule.intermissionRandomStart)}
            >
              <i aria-hidden="true" />
              <span>{t.intermissionRandom}</span>
            </button>
            {schedule.intermissions.length === 0 ? (
              <p class="intermission-empty">{t.intermissionEmpty}</p>
            ) : (
              <ul class="intermission-list" role="radiogroup" aria-label={t.intermissionPick}>
                <li class={!selectedIntermission ? "on" : ""}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!selectedIntermission}
                    class="pick"
                    disabled={intermissionSaving}
                    onClick={() => selectIntermission("")}
                  >
                    <i />
                    <b>{t.none}</b>
                  </button>
                </li>
                {schedule.intermissions.map((item) => {
                  const on = item.id === schedule.activeIntermission;
                  return (
                    <li key={item.id} class={on ? "on" : ""}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        class="pick"
                        title={item.source}
                        disabled={intermissionSaving}
                        onClick={() => selectIntermission(item.id)}
                      >
                        <i />
                        <b>{intermissionLabel(item, youtubeTitles)}</b>
                        <span>
                          {item.kind === "folder" ? t.folder : item.kind === "video" ? t.video : t.youtube}
                        </span>
                      </button>
                      <button
                        type="button"
                        class="x"
                        aria-label={t.remove}
                        title={t.remove}
                        disabled={intermissionSaving}
                        onClick={() => removeIntermission(item.id)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <span class="k">{t.add}</span>
            <div class="seg intermission-kind" role="radiogroup" aria-label={t.intermissionFrom}>
              {(["folder", "video", "youtube"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={addKind === kind}
                  class={addKind === kind ? "on" : ""}
                  onClick={() => chooseAddKind(kind)}
                >
                  {kind === "folder" ? t.folder : kind === "video" ? t.video : t.youtube}
                </button>
              ))}
            </div>
            {addKind === "youtube" ? (
              <div class="path-field">
                <div class="field">
                  <input
                    value={addDraft}
                    placeholder={t.youtubePlaceholder}
                    aria-invalid={pendingAdd.error === "youtube" || intermissionError ? "true" : undefined}
                    onInput={(event) => editAddDraft((event.target as HTMLInputElement).value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      void addIntermission();
                    }}
                  />
                </div>
              </div>
            ) : (
              <FolderPath
                kind={addKind === "video" ? "video" : "folder"}
                value={addDraft}
                placeholder={addKind === "video" ? t.videoPlaceholder : t.folderPlaceholder}
                invalid={pendingAdd.error === "youtube-in-path" || Boolean(intermissionError)}
                actionLabel={picking === "fallback" ? t.choosing : t.browse}
                actionBusy={picking === "fallback"}
                listLabel={addKind === "video" ? t.video : t.folder}
                onChange={editAddDraft}
                onAction={() => void chooseAddSource()}
                onEnter={() => void addIntermission()}
              />
            )}
            {addPreview && <p class="folder-name">{addPreview}</p>}
            {(intermissionError || pendingAdd.error) && (
              <p class="field-error">{intermissionErrorText(intermissionError || pendingAdd.error || "")}</p>
            )}
            <span>
              {addKind === "youtube" ? t.youtubeIntermission : addKind === "video" ? t.oneHint : t.nextHint}{" "}
              {t.intermissionCut}
            </span>
            <div class="intermission-actions">
              <button
                type="button"
                class="primary"
                disabled={!pendingAdd.source || Boolean(pendingAdd.error) || intermissionSaving}
                onClick={() => void addIntermission()}
              >
                {t.add}
              </button>
            </div>
          </div>
        )}
        <div class="week-scale">
          {DAYS.map((day) => {
            const pieces = piecesFor(day, schedule.blocks);
            const emptyDay = pieces.length === 1 && pieces[0]?.kind === "gap";
            const editing = draft?.origin === day;
            const rows = [
              ...pieces,
              ...(ghostsByDay?.[day] ?? []).map((ghost) => ({
                kind: "ghost" as const,
                start: ghost.start,
                end: ghost.end,
              })),
            ].sort((a, b) => a.start - b.start || (a.kind === "ghost" ? 1 : -1));
            return (
              <div key={day} class={`day${day === today ? " on" : ""}${editing ? " editing" : ""}`}>
                <span class="name">{t.day[day]}</span>
                <div class="track">
                  {rows.map((piece) => {
                    const span = piece.end - piece.start;
                    if (piece.kind === "ghost") {
                      return (
                        <span
                          key={`ghost-${piece.start}-${piece.end}`}
                          class={`ghost${draft ? slotKind(draft) : ""}`}
                          style={rowStyle(span)}
                        >
                          <b>
                            {clockFace(piece.start)}–{clockFace(piece.end)}
                          </b>
                        </span>
                      );
                    }
                    if (piece.kind === "gap") {
                      const long = span >= 120;
                      const tight = !long && span < 30;
                      return (
                        <button
                          key={`gap-${piece.start}`}
                          type="button"
                          class={`gap${long ? " long" : ""}${tight ? " tight" : ""}${emptyDay ? " first" : ""}`}
                          style={rowStyle(span)}
                          title={long && fallbackName ? fallbackName : undefined}
                          onClick={(event) => {
                            const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            const ratio = rect.height
                              ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
                              : 0;
                            const at = piece.start + ratio * (piece.end - piece.start);
                            openGap(day, piece.start, piece.end, at);
                          }}
                        >
                          {long ? (
                            <>
                              <b>
                                {clockFace(piece.start)}–{clockFace(piece.end)}
                              </b>
                              {fallbackName ? <i>{fallbackName}</i> : emptyDay ? <i>{t.clickFirst}</i> : null}
                            </>
                          ) : (
                            <i>
                              {tight
                                ? `+ ${t.lengthOf(span)}`
                                : `${clockFace(piece.start)}–${clockFace(piece.end)}`}
                            </i>
                          )}
                        </button>
                      );
                    }
                    const placed = windowOn(piece.block, piece.origin);
                    const draftTime = draft ? startOnDraft(draft, piece.origin) : "";
                    const picked =
                      draft?.id === piece.block.id &&
                      draft.origin === piece.origin &&
                      draftTime === placed.start;
                    const spill = piece.origin !== day;
                    return (
                      <button
                        key={`${piece.block.id}-${piece.origin}-${piece.start}`}
                        type="button"
                        class={`slot${slotKind(piece.block)}${picked ? " pick" : ""}${spill ? " spill" : ""}`}
                        style={rowStyle(span)}
                        title={slotHover(piece.block, youtubeTitles)}
                        onClick={() => openSlot(piece.block, piece.origin)}
                      >
                        <span class="tm">
                          {clockFace(piece.start)}–{clockFace(piece.end)}
                          {spill ? ` · ${t.day[piece.origin]}` : ""}
                        </span>
                        <b>{slotLabel(piece.block, youtubeTitles)}</b>
                        <i>{t.lengthOf(span)}</i>
                      </button>
                    );
                  })}
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
            aria-busy={slotOp ? "true" : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              void commit();
            }}
          >
            <header>
              <b>{draft.id ? t.editSlot(t.dayName[draft.origin]) : t.newSlot(t.dayName[draft.origin])}</b>
            </header>
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
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.mode === "youtube"}
                  class={draft.mode === "youtube" ? "mode on tube" : "mode"}
                  onClick={() => chooseMode("youtube")}
                >
                  <b>{t.youtube}</b>
                  <span>{t.youtubeHint}</span>
                </button>
              </div>
            </div>
            <div class="folder-block">
              <span class="k">
                {draft.mode === "youtube"
                  ? t.chooseYoutube
                  : draft.mode === "specific-file"
                    ? t.chooseVideo
                    : t.chooseFolder}
              </span>
              {draft.mode === "youtube" ? (
                <div class="path-field">
                  <div class="field">
                    <input
                      value={draft.file}
                      placeholder={t.youtubePlaceholder}
                      aria-invalid={fieldError.folder ? "true" : undefined}
                      onInput={(event) => {
                        setDraft({
                          ...draft,
                          file: (event.target as HTMLInputElement).value,
                          folder: "",
                        });
                        setFieldError((current) => ({ ...current, folder: undefined }));
                      }}
                    />
                  </div>
                </div>
              ) : (
                <FolderPath
                  key={draft.mode}
                  kind={draft.mode === "specific-file" ? "video" : "folder"}
                  value={draft.mode === "specific-file" ? draft.file : draft.folder}
                  placeholder={draft.mode === "specific-file" ? t.videoPlaceholder : t.folderPlaceholder}
                  invalid={sourceMissing || Boolean(fieldError.folder)}
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
              )}
              {draft.mode === "youtube" && <p class="mode-note">{t.youtubeCaveat}</p>}
              {sourceMissing && (
                <p class="field-error">
                  {draft.mode === "specific-file" ? t.sourceMissingVideo : t.sourceMissingFolder}
                </p>
              )}
              {!sourceMissing && fieldError.folder && <p class="field-error">{t.error(fieldError.folder)}</p>}
              {draft.mode !== "youtube" && draft.mode !== "next-episode" && (
              <fieldset class="source">
                <legend class="k">{t.slotDuration}</legend>
                <div class="source-grid" role="radiogroup" aria-label={t.slotDuration}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draft.lengthChoice !== "longest"}
                    class={draft.lengthChoice !== "longest" ? "mode on" : "mode"}
                    onClick={() => chooseLength("fixed")}
                  >
                    <b>{t.fixedLength}</b>
                    <span>{t.standardSlot}</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draft.lengthChoice === "longest"}
                    class={draft.lengthChoice === "longest" ? "mode on" : "mode"}
                    onClick={() => chooseLength("longest")}
                  >
                    <b>{t.longestFile}</b>
                    <span>{t.findLongest}</span>
                  </button>
                </div>
              </fieldset>
              )}
              {draft.mode === "youtube" || draft.lengthChoice === "longest" ? (
                measuring && pathChosen ? (
                  <div class="wait">
                    <div class="wait-line">
                      <span class="spin" aria-hidden="true" />
                      <span class="cloud-host" onMouseEnter={placeCloud}>
                        <span class="measure-label">{t.measuringVideos}</span>
                        <span class="cloud" role="tooltip">
                          {t.elapsed(elapsedClock(elapsedSec))}
                        </span>
                      </span>
                      <span class="cloud-host" onMouseEnter={placeCloud}>
                        <button type="button" class="info" aria-label={t.whySlow} onFocus={showCloud}>
                          <InfoMark />
                        </button>
                        <span class="cloud" role="tooltip">
                          {draft.mode === "youtube" ? t.youtubeProbeCache : t.probeCache}
                        </span>
                      </span>
                    </div>
                    {draft.mode === "random-file" && fileCount > MANY_FILES && (
                      <p class="slow">{t.manyFiles}</p>
                    )}
                  </div>
                ) : length ? (
                  <div class="picked">
                    <div>
                      <span class="k">{t.slotDuration}</span>
                      <span class="value">{t.slotDurationOf(lengthMins)}</span>
                    </div>
                    {draft.mode === "youtube" && (
                      <div>
                        <span class="k">{t.youtube}</span>
                        <span class="value">{length.title}</span>
                      </div>
                    )}
                    {length.kind === "random" && (
                      <div>
                        <span class="k">{t.longestVideo}</span>
                        <span class="value">
                          {length.title} · {t.slotDurationOf(lengthMins)}
                        </span>
                      </div>
                    )}
                    {length.kind === "random" && length.shortest && length.shortest.path !== length.path && (
                      <div>
                        <span class="k">{t.shortestVideo}</span>
                        <span class="value">
                          {length.shortest.title} ·{" "}
                          {t.slotDurationOf(Math.max(1, Math.ceil(length.shortest.durationSec / 60)))}
                        </span>
                      </div>
                    )}
                  </div>
                ) : null
              ) : (
                <div class="fixed">
                  <span class="k">{t.chooseLength}</span>
                  <div class="dur-pick">
                    <select
                      aria-label={t.chooseLength}
                      value={String(draft.lengthChoice)}
                      style={{ width: `calc(${lengthCh + 1}ch + 2.2rem)` }}
                      onChange={(event) => {
                        const value = (event.target as HTMLSelectElement).value;
                        setDraft((current) => {
                          if (!current) return current;
                          if (value === "custom") return { ...current, lengthChoice: "custom" };
                          const mins = Number(value);
                          if (!isPreset(mins)) return current;
                          return { ...current, lengthChoice: mins };
                        });
                      }}
                    >
                      {PRESETS.map((mins) => (
                        <option key={mins} value={String(mins)}>
                          {t.minutes(mins)}
                        </option>
                      ))}
                      <option value="custom">{t.customLength}</option>
                    </select>
                    {draft.lengthChoice === "custom" && (
                      <label class="custom">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={draft.customMin}
                          placeholder="45"
                          aria-label={t.customLength}
                          onInput={(event) => {
                            const value = (event.target as HTMLInputElement).value;
                            setDraft((current) => (current ? { ...current, customMin: value } : current));
                          }}
                        />
                        <em>{t.minutesUnit}</em>
                      </label>
                    )}
                    <span class="cloud-host" onMouseEnter={placeCloud}>
                      <button
                        type="button"
                        class="info"
                        onFocus={showCloud}
                        aria-label={t.aboutLength(
                          draft.lengthChoice === "custom" ? t.customLength : t.minutes(draft.lengthChoice),
                        )}
                      >
                        <InfoMark />
                      </button>
                      <span class="cloud" role="tooltip">
                        {t.durationTip[draft.lengthChoice === "custom" ? "custom" : (`${draft.lengthChoice}` as TipKey)]}
                      </span>
                    </span>
                  </div>
                  {draft.lengthChoice === "custom" && draft.customMin.trim() !== "" && fixedMin === null && (
                    <p class="field-error">{t.needMinutes}</p>
                  )}
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
                const spills = Boolean(activeSec && spillsPastDay(start, activeSec));
                const clash = clashes
                  .filter((item) => item.day === day || (spills && item.day === nextDay(day)))
                  .sort((a, b) => toMin(a.start) - toMin(b.start))[0];
                const prev = prevOnDay(day, start, schedule.blocks, draft.id);
                const next = nextOnDay(day, start, schedule.blocks, draft.id);
                const end = activeSec ? endFace(start, activeSec) : undefined;
                const facts: { key: string; label: string; time?: string }[] = clash
                  ? []
                  : !prev && !next
                    ? [{ key: "only", label: t.onlySlot }]
                    : [
                        ...(prev
                          ? [{ key: "prev", label: t.prevSlotEnds, time: windowOn(prev, day).end }]
                          : []),
                        ...(next
                          ? [{ key: "next", label: t.nextSlotBegins, time: windowOn(next, day).start }]
                          : [{ key: "after", label: t.noSlotsAfter }]),
                      ];
                return (
                  <div class="day-start" key={day}>
                    <span class="day-name">{t.dayName[day]}</span>
                    <div class="start-field">
                      <span class="k">{t.startTime}</span>
                      <div class="start-row">
                        <input
                          class="time"
                          type="time"
                          value={start}
                          aria-label={`${t.dayName[day]} ${t.startTime}`}
                          onInput={(event) => {
                            const value = (event.target as HTMLInputElement).value;
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
                          }}
                        />
                        {end && (
                          <span class="end">
                            {t.slotEnds} <b>{end}</b>
                            {spills && <em> {t.day[nextDay(day)]}</em>}
                          </span>
                        )}
                      </div>
                    </div>
                    <p class={clash ? "facts warn" : "facts"} role="status">
                      {clash ? (
                        <>
                          <span>{t.overlaps}</span>
                          <span>
                            {clash.start}–{clash.end}
                          </span>
                        </>
                      ) : (
                        facts.map((fact) => (
                          <span key={fact.key}>
                            {fact.label}
                            {fact.time && <b> {fact.time}</b>}
                          </span>
                        ))
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
            {draft.lengthChoice === "longest" && !measuring && pathChosen && matched && !length && !matched.error && (
              <p class="field-error">{t.noVideo}</p>
            )}
            {matched?.error && <p class="field-error">{t.error(matched.error)}</p>}
            {fieldError.time && <p class="field-error">{t.error(fieldError.time)}</p>}
            <div class="actions">
              {draft.id && (
                <button
                  type="button"
                  class={
                    slotOp === "remove" ? "quiet working" : sourceMissing ? "primary" : "quiet"
                  }
                  disabled={slotOp !== null}
                  onClick={() => void removeDraft()}
                >
                  {slotOpSlow && slotOp === "remove" && <span class="spin" aria-hidden="true" />}
                  {t.remove}
                </button>
              )}
              <button
                type="button"
                disabled={slotOp !== null}
                onClick={() => {
                  setDraft(null);
                  setFieldError({});
                }}
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                class={slotOp === "save" ? "primary working" : "primary"}
                disabled={addDisabled || slotOp !== null}
              >
                {slotOpSlow && slotOp === "save" && <span class="spin" aria-hidden="true" />}
                {draft.id ? t.save : t.add}
              </button>
            </div>
            {fieldError.form && (
              <p class="field-error" ref={formErrorRef} role="alert">
                {t.error(fieldError.form)}
              </p>
            )}
          </form>
        )}
      </div>
      {saved && !draft && <p class="muted">{t.saved}</p>}
    </section>
  );
}
