import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  DAYS,
  type BlockMode,
  type Day,
  type IntermissionItem,
  type IntermissionKind,
  type ItemMode,
  type PlaylistEntry,
  type Schedule,
  type ScheduleBlock,
  type RundownItem,
  type SlotLength,
  type SlotMiss,
  type TvBoard,
} from "../../shared/types.ts";
import { placedOn, playlistMinutesOn, playlistRowsOn, segmentsPlaced } from "../../shared/placed.ts";
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
  canonicalPlaylistUrl,
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

type DraftItem = {
  id: string;
  mode: ItemMode;
  folder: string;
  file: string;
  title: string;
  durationSec: number | null;
  lengthMin?: number;
  gapAfterMin?: number;
  error?: string;
};

type FormStep = "how" | "when" | "what" | "name" | "summary";
type AddPhase = "list" | "kind" | "source";
type PlaySource = "path" | "youtube";

type Draft = {
  id: string | null;
  origin: Day;
  days: Day[];
  start: string;
  end: string;
  starts: Partial<Record<Day, string>>;
  folder: string;
  file: string;
  source: PlaySource;
  mode: BlockMode;
  name: string;
  items: DraftItem[];
  addMode: ItemMode;
  addSource: PlaySource;
  addFolder: string;
  addFile: string;
  addLengthChoice: LengthChoice;
  addCustomMin: string;
  lengthChoice: LengthChoice;
  customMin: string;
  freeEnd: number;
  gapStart: number;
  formStep: FormStep;
  addPhase: AddPhase;
  returnTo: "summary" | null;
};

function emptyStack(): Pick<
  Draft,
  "name" | "items" | "addMode" | "addSource" | "addFolder" | "addFile" | "addLengthChoice" | "addCustomMin"
> {
  return {
    name: "",
    items: [],
    addMode: "specific-file",
    addSource: "path",
    addFolder: "",
    addFile: "",
    addLengthChoice: 60,
    addCustomMin: "",
  };
}

function newItemId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  return `item-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function gapOf(item: DraftItem | PlaylistEntry): number {
  const mins = item.gapAfterMin;
  return mins && mins >= 1 ? mins : 0;
}

function gapFields(item: { gapAfterMin?: number }): { gapAfterMin?: number } {
  const mins = gapOf(item);
  return mins ? { gapAfterMin: mins } : {};
}

function toEntry(item: DraftItem): PlaylistEntry {
  const file = item.file.trim();
  const gap = gapFields(item);
  if (item.mode === "specific-file") {
    const youtube = parseYoutubeUrl(file);
    if (youtube) return { id: item.id, mode: item.mode, folder: "", file: youtube, ...gap };
    return { id: item.id, mode: item.mode, folder: parentDir(file), file, ...gap };
  }
  if (item.mode === "next-episode" || item.mode === "random-file") {
    const playlist = canonicalPlaylistUrl(item.folder);
    return {
      id: item.id,
      mode: item.mode,
      folder: playlist ?? item.folder.trim(),
      ...(item.mode === "random-file" && item.lengthMin ? { lengthMin: item.lengthMin } : {}),
      ...gap,
    };
  }
  return {
    id: item.id,
    mode: item.mode,
    folder: item.folder.trim(),
    ...gap,
  };
}

function fromEntry(item: PlaylistEntry, durationSec: number | null = null, title = ""): DraftItem {
  const lengthMin = item.mode === "random-file" ? item.lengthMin : undefined;
  return {
    id: item.id,
    mode: item.mode,
    folder: item.folder,
    file: item.file ?? "",
    title: item.mode === "random-file" ? "" : title,
    durationSec,
    ...(lengthMin ? { lengthMin } : {}),
    ...gapFields(item),
  };
}

function itemSeconds(item: DraftItem): number | null {
  if (item.durationSec != null) return item.durationSec;
  if (item.mode === "random-file" && item.lengthMin) return item.lengthMin * 60;
  return null;
}

function stackGapSeconds(items: DraftItem[]): number {
  return items.slice(0, -1).reduce((sum, item) => sum + gapOf(item) * 60, 0);
}

function stackSeconds(items: DraftItem[]): number | null {
  if (items.length === 0 || items.some((item) => item.error)) return null;
  if (items.some((item) => itemSeconds(item) == null && item.mode !== "random-file")) return null;
  const total = items.reduce((sum, item) => sum + (itemSeconds(item) ?? 0), 0) + stackGapSeconds(items);
  return total > 0 ? total : null;
}

function stackItemNeedsProbe(item: DraftItem): boolean {
  if (item.durationSec != null || item.error) return false;
  return item.mode === "next-episode" || item.mode === "specific-file";
}

function knownStackSeconds(items: DraftItem[]): number {
  return items.reduce((sum, item) => sum + (itemSeconds(item) ?? 0), 0) + stackGapSeconds(items);
}

function isPreset(value: number): value is PresetMin {
  return (PRESETS as readonly number[]).includes(value);
}

function minutesOfChoice(choice: LengthChoice, customMin: string): number | null {
  if (choice === "longest") return null;
  if (choice === "custom") {
    if (!/^\d+$/.test(customMin.trim())) return null;
    const mins = Number(customMin);
    return mins >= 1 ? mins : null;
  }
  return choice;
}

function fixedMinutes(draft: Draft): number | null {
  return minutesOfChoice(draft.lengthChoice, draft.customMin);
}

function addFixedMinutes(draft: Draft): number | null {
  return minutesOfChoice(draft.addLengthChoice, draft.addCustomMin);
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

let tipEl: HTMLSpanElement | null = null;
let tipHost: HTMLElement | null = null;
let tipWatch: MutationObserver | null = null;
let tipFrame: HTMLElement | null = null;

function tipNode(): HTMLSpanElement {
  if (!tipEl) {
    tipEl = document.createElement("span");
    tipEl.className = "cloud lifted";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function dismissTip() {
  tipWatch?.disconnect();
  tipWatch = null;
  tipHost = null;
  tipFrame?.removeEventListener("scroll", onTipScroll);
  tipFrame = null;
  if (!tipEl) return;
  tipEl.style.display = "none";
  tipEl.classList.remove("below");
}

function onTipScroll() {
  if (tipHost) placeCloud({ currentTarget: tipHost });
}

function placeCloud(event: { currentTarget: EventTarget | null }) {
  const host = event.currentTarget as HTMLElement | null;
  const source = host?.querySelector(":scope > .cloud") as HTMLElement | null;
  if (!host || !source) return;
  const tip = tipNode();
  tipHost = host;
  tipWatch?.disconnect();
  const sync = () => {
    tip.textContent = source.textContent ?? "";
  };
  sync();
  tipWatch = new MutationObserver(sync);
  tipWatch.observe(source, { subtree: true, characterData: true, childList: true });
  const frame = host.closest(".add-form") as HTMLElement | null;
  if (tipFrame !== frame) {
    tipFrame?.removeEventListener("scroll", onTipScroll);
    tipFrame = frame;
    tipFrame?.addEventListener("scroll", onTipScroll, { passive: true });
  }
  tip.style.display = "block";
  tip.style.visibility = "hidden";
  const hostRect = host.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const pad = 12;
  let left = hostRect.left;
  if (left + width > window.innerWidth - pad) left = window.innerWidth - pad - width;
  if (left < pad) left = pad;
  let top = hostRect.top - height - 12;
  const below = top < pad;
  if (below) top = Math.min(hostRect.bottom + 12, window.innerHeight - height - pad);
  tip.classList.toggle("below", below);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  const tail = hostRect.left + hostRect.width / 2 - left;
  tip.style.setProperty("--tail", `${Math.min(Math.max(tail, 14), Math.max(14, width - 14))}px`);
  tip.style.visibility = "";
}

function showCloud(event: { currentTarget: EventTarget | null }) {
  const node = event.currentTarget as HTMLElement | null;
  const host = node?.closest(".cloud-host");
  if (host) placeCloud({ currentTarget: host });
}

function hideCloud(event: { currentTarget: EventTarget | null }) {
  const host = event.currentTarget as HTMLElement | null;
  if (!host || tipHost !== host || host.contains(document.activeElement)) return;
  dismissTip();
}

function blurCloud(event: { currentTarget: EventTarget | null }) {
  const node = event.currentTarget as HTMLElement | null;
  const host = node?.closest(".cloud-host");
  if (!host || host.matches(":hover")) return;
  if (tipHost === host) dismissTip();
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

function DurationPick({
  lengthChoice,
  customMin,
  lengthCh,
  t,
  onChoice,
  onCustom,
  tip,
}: {
  lengthChoice: LengthChoice;
  customMin: string;
  lengthCh: number;
  t: ReturnType<typeof useI18n>["t"];
  onChoice: (value: PresetMin | "custom") => void;
  onCustom: (value: string) => void;
  tip?: string;
}) {
  if (lengthChoice === "longest") return null;
  const label = lengthChoice === "custom" ? t.customLength : t.minutes(lengthChoice);
  const tipKey: TipKey = lengthChoice === "custom" ? "custom" : (`${lengthChoice}` as TipKey);
  return (
    <div class="dur-pick">
      <select
        aria-label={t.chooseLength}
        value={String(lengthChoice)}
        style={{ width: `calc(${lengthCh + 1}ch + 2.2rem)` }}
        onChange={(event) => {
          const value = (event.target as HTMLSelectElement).value;
          if (value === "custom") onChoice("custom");
          else {
            const mins = Number(value);
            if (isPreset(mins)) onChoice(mins);
          }
        }}
      >
        {PRESETS.map((mins) => (
          <option key={mins} value={String(mins)}>
            {t.minutes(mins)}
          </option>
        ))}
        <option value="custom">{t.customLength}</option>
      </select>
      {lengthChoice === "custom" && (
        <label class="custom">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={customMin}
            placeholder="45"
            aria-label={t.customLength}
            onInput={(event) => onCustom((event.target as HTMLInputElement).value)}
          />
          <em>{t.minutesUnit}</em>
        </label>
      )}
      <span class="cloud-host" onMouseEnter={placeCloud} onMouseLeave={hideCloud}>
        <button type="button" class="info" onFocus={showCloud} onBlur={blurCloud} aria-label={t.aboutLength(label)}>
          <InfoMark />
        </button>
        <span class="cloud" role="tooltip">
          {tip ?? t.durationTip[tipKey]}
        </span>
      </span>
    </div>
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
  block: { folder: string; file?: string; mode: BlockMode; name?: string },
  titles: Readonly<Record<string, string>> = {},
): string {
  if (block.mode === "playlist") return (block.name ?? "").trim() || "Playlist";
  if (block.mode === "specific-file" && block.file && parseYoutubeUrl(block.file)) {
    const url = parseYoutubeUrl(block.file);
    if (url && titles[url]) return titles[url];
    return youtubeLabel(block.file);
  }
  if ((block.mode === "next-episode" || block.mode === "random-file") && canonicalPlaylistUrl(block.folder)) {
    const url = canonicalPlaylistUrl(block.folder);
    if (url && titles[url]) return titles[url];
    return youtubeLabel(block.folder);
  }
  if (block.mode === "specific-file" && block.file) return fileTitle(block.file);
  return folderLabel(block.folder);
}

function slotHover(
  block: { folder: string; file?: string; mode: BlockMode; name?: string; items?: PlaylistEntry[] },
  titles: Readonly<Record<string, string>>,
): string {
  if (block.mode === "playlist") {
    const name = (block.name ?? "").trim();
    const count = block.items?.length ?? 0;
    return name && count ? `${name}\n${count}` : name || String(count);
  }
  if (block.mode === "specific-file" && block.file && parseYoutubeUrl(block.file)) {
    const url = parseYoutubeUrl(block.file);
    const title = url ? titles[url] : "";
    if (title && url) return `${title}\n${url}`;
    return block.file;
  }
  if ((block.mode === "next-episode" || block.mode === "random-file") && canonicalPlaylistUrl(block.folder)) {
    const url = canonicalPlaylistUrl(block.folder);
    const title = url ? titles[url] : "";
    if (title && url) return `${title}\n${url}`;
    return block.folder;
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
  for (const piece of extra.split("\n")) {
    const url = canonicalYoutubeIntermission(piece) ?? parseYoutubeUrl(piece);
    if (url) urls.add(url);
  }
  for (const block of schedule.blocks) {
    const files =
      block.mode === "playlist"
        ? (block.items ?? []).flatMap((item) => youtubeRefsOf(item.mode, item.folder, item.file))
        : youtubeRefsOf(block.mode, block.folder, block.file);
    for (const file of files) urls.add(file);
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

function youtubeRefsOf(mode: string, folder: string, file?: string): string[] {
  if (mode === "specific-file") {
    const url = parseYoutubeUrl(file ?? "");
    return url ? [url] : [];
  }
  if (mode === "next-episode" || mode === "random-file") {
    const url = canonicalPlaylistUrl(folder);
    return url ? [url] : [];
  }
  return [];
}

function slotKind(block: { folder: string; mode: BlockMode }): string {
  if (block.mode === "playlist") return " stack";
  const name = folderLabel(block.folder).toLowerCase();
  if (name === "shows" || block.mode === "next-episode") return " shows";
  if (block.mode === "specific-file") return " film";
  return "";
}

function modeHint(mode: ItemMode, t: ReturnType<typeof useI18n>["t"]): string {
  if (mode === "next-episode") return t.nextHint;
  if (mode === "specific-file") return t.oneHint;
  return t.randomHint;
}

function modeLabel(mode: ItemMode, t: ReturnType<typeof useI18n>["t"]): string {
  if (mode === "next-episode") return t.nextEpisode;
  if (mode === "specific-file") return t.oneVideo;
  return t.randomFile;
}

function modeClass(mode: ItemMode): string {
  if (mode === "next-episode") return "shows";
  if (mode === "specific-file") return "film";
  return "movie";
}

function blockHint(mode: BlockMode, t: ReturnType<typeof useI18n>["t"]): string {
  if (mode === "playlist") return t.playlistHint;
  return modeHint(mode, t);
}

function blockClass(mode: BlockMode): string {
  if (mode === "playlist") return "stack";
  return modeClass(mode);
}

function blockLabel(mode: BlockMode, t: ReturnType<typeof useI18n>["t"]): string {
  if (mode === "playlist") return t.playlist;
  return modeLabel(mode, t);
}

function PencilIcon() {
  return (
    <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M7 7l1 13h8l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

const CHIP_MODES: BlockMode[] = ["random-file", "next-episode", "specific-file", "playlist"];
const ADD_MODES: ItemMode[] = ["random-file", "next-episode", "specific-file"];

function itemLabel(item: DraftItem, titles: Readonly<Record<string, string>>): string {
  if (item.mode === "specific-file" && parseYoutubeUrl(item.file)) {
    const url = parseYoutubeUrl(item.file)!;
    return titles[url] || item.title || youtubeLabel(item.file);
  }
  if ((item.mode === "next-episode" || item.mode === "random-file") && canonicalPlaylistUrl(item.folder)) {
    const url = canonicalPlaylistUrl(item.folder)!;
    return titles[url] || youtubeLabel(item.folder);
  }
  if (item.title) return item.title;
  if (item.mode === "specific-file" && item.file) return fileTitle(item.file);
  return folderLabel(item.folder);
}

function stackItemLine(
  item: DraftItem,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const kind = modeLabel(item.mode, t);
  if (item.durationSec != null) {
    return `${kind} · ${t.slotDurationOf(Math.max(1, Math.ceil(item.durationSec / 60)))}`;
  }
  if (item.error) return `${kind} · ${t.error(item.error)}`;
  if (stackItemNeedsProbe(item)) return `${kind} · ${t.measuring}`;
  if (item.mode === "random-file" && item.lengthMin) return `${kind} · ${t.minutes(item.lengthMin)}`;
  return kind;
}

function itemGridDuration(
  item: DraftItem,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (item.durationSec != null) return t.lengthOf(Math.max(1, Math.ceil(item.durationSec / 60)));
  if (item.mode === "random-file" && item.lengthMin) return t.lengthOf(item.lengthMin);
  return "–";
}

function clipLabel(name: string, max = 28): string {
  const text = name.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3)).trimEnd()}...`;
}

function playlistGridName(
  item: DraftItem,
  titles: Readonly<Record<string, string>>,
): string {
  if (item.mode === "specific-file" || canonicalPlaylistUrl(item.folder)) return itemLabel(item, titles);
  return folderLabel(item.folder);
}

function playlistGridLine(
  item: DraftItem,
  t: ReturnType<typeof useI18n>["t"],
  titles: Readonly<Record<string, string>> = {},
): string {
  const kind = modeLabel(item.mode, t);
  const duration = itemGridDuration(item, t);
  const name = playlistGridName(item, titles);
  const shown =
    item.mode === "specific-file" || canonicalPlaylistUrl(item.folder) ? clipLabel(name) : name;
  return `${kind} - ${shown} - ${duration}`;
}

function rowStyle(span: number): Record<string, string> {
  return { "--mins": String(Math.max(0, span)) };
}

function takePlaylistRow(unused: RundownItem[], entry: PlaylistEntry): RundownItem | undefined {
  const byId = unused.findIndex((item) => item.entryId === entry.id);
  if (byId >= 0) return unused.splice(byId, 1)[0];
  const byShape = unused.findIndex((item) => {
    if (item.entryId) return false;
    const itemMode = (item.mode as string) === "youtube" ? "specific-file" : item.mode;
    if (itemMode !== entry.mode) return false;
    if (entry.mode === "specific-file") {
      const url = parseYoutubeUrl(entry.file ?? "");
      return item.path === (url ?? (entry.file ?? "").trim());
    }
    return (item.folder ?? "") === entry.folder;
  });
  if (byShape >= 0) return unused.splice(byShape, 1)[0];
  return undefined;
}

function fromPlaylist(block: ScheduleBlock, day: Day, board: TvBoard | null): DraftItem[] {
  const unused = playlistRowsOn(block, day, board);
  return (block.items ?? []).map((entry) => {
    const row = takePlaylistRow(unused, entry);
    return fromEntry(entry, row?.durationSec ?? null, row?.title ?? "");
  });
}

function piecesFor(day: Day, blocks: ScheduleBlock[], board: TvBoard | null): Piece[] {
  const mine: { block: ScheduleBlock; start: number; end: number; origin: Day }[] = [];
  for (const block of blocks) {
    if (block.days.includes(day)) {
      const placed = placedOn(block, day, board);
      const end = Math.min(placed.endMin, DAY_MINUTES);
      if (end > placed.startMin) mine.push({ block, start: placed.startMin, end, origin: day });
    }
    const prev = prevDay(day);
    if (block.days.includes(prev)) {
      const leftover = leftoverMin(placedOn(block, prev, board));
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

function ghostsOn(
  draft: Draft,
  day: Day,
  blocks: ScheduleBlock[],
  board: TvBoard | null,
): { start: number; end: number }[] {
  const span = draftSpanMin(draft);
  if (span < 1) return [];
  const saved = draft.id ? blocks.find((block) => block.id === draft.id) : undefined;
  const shown = saved ? (playlistMinutesOn(saved, draft.origin, board) ?? lengthMinutes(saved)) : 0;
  if (saved && windowOn(saved, draft.origin).start === draft.start && shown === span) {
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

function minuteFace(mins: number): string {
  if (mins > DAY_MINUTES) return clockOf(mins);
  return clockFace(mins);
}

function stackClocks(start: string, items: DraftItem[]): { start: string; end: string }[] {
  let cursor: number | null = toMin(start);
  return items.map((item, index) => {
    if (cursor == null) return { start: "/", end: "/" };
    const begin = cursor;
    const sec = itemSeconds(item);
    if (sec == null) {
      cursor = null;
      return { start: minuteFace(begin), end: "/" };
    }
    const endMin = begin + Math.max(1, Math.ceil(sec / 60));
    const gap = index < items.length - 1 ? gapOf(item) : 0;
    cursor = endMin + gap;
    return { start: minuteFace(begin), end: minuteFace(endMin) };
  });
}

function spillsPastDay(start: string, durationSec: number): boolean {
  return toMin(start) + Math.max(1, Math.ceil(durationSec / 60)) > DAY_MINUTES;
}

function addMeasureCap(draft: Draft): number | undefined {
  if (draft.mode !== "playlist" || draft.addMode !== "random-file") return undefined;
  if (draft.addLengthChoice === "longest") return undefined;
  return addFixedMinutes(draft) ?? undefined;
}

function playlistAddNeedsMeasure(draft: Draft): boolean {
  return draft.addMode !== "random-file" || draft.addLengthChoice === "longest";
}

function measureKey(draft: Draft): string {
  const mode = draft.mode === "playlist" ? draft.addMode : draft.mode;
  const folder = draft.mode === "playlist" ? draft.addFolder : draft.folder;
  const file = draft.mode === "playlist" ? draft.addFile : draft.file;
  if (mode === "specific-file") {
    return `video:${file.trim()}`;
  }
  const playlist = canonicalPlaylistUrl(folder);
  if ((mode === "next-episode" || mode === "random-file") && playlist) return `${mode}:${playlist}`;
  const cap = addMeasureCap(draft);
  return cap ? `${mode}:${folder.trim()}:${cap}` : `${mode}:${folder.trim()}`;
}

function addSeconds(
  draft: Draft,
  measured: { key: string; length: SlotLength | null } | null,
): number | null {
  if (draft.addMode === "random-file" && draft.addLengthChoice !== "longest") {
    const mins = addFixedMinutes(draft);
    return mins ? mins * 60 : null;
  }
  if (measured?.key === measureKey(draft) && measured.length) return measured.length.durationSec;
  return null;
}

function chosenSeconds(
  draft: Draft,
  measured: { key: string; length: SlotLength | null } | null,
): number | null {
  if (draft.mode === "playlist") return stackSeconds(draft.items);
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
    ...(draft.mode === "playlist"
      ? { name: draft.name.trim(), items: draft.items.map(toEntry) }
      : {}),
  };
}

function dayClashes(
  draft: Draft,
  blocks: ScheduleBlock[],
  durationSec: number,
  titles: Readonly<Record<string, string>> = {},
  board: TvBoard | null = null,
): { day: Day; title: string; start: string; end: string }[] {
  const clashes: { day: Day; title: string; start: string; end: string }[] = [];
  const next = draftAsBlock(draft, durationSec);
  const draftSegs = segmentsOf(next);
  for (const block of blocks) {
    if (block.id === next.id) continue;
    for (const other of segmentsPlaced(block, board)) {
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

function occupancyOf(board: TvBoard | null, id: string): string {
  if (!board) return "";
  return board.days
    .filter((day) => day.date >= board.today)
    .flatMap((day) => day.items.filter((item) => item.blockId === id && !item.overnight))
    .map((item) => `${item.path}:${item.durationSec}:${item.start}`)
    .join("|");
}

function changedBlockIds(before: ScheduleBlock[], after: ScheduleBlock[]): string[] {
  return after
    .filter((block) => {
      const old = before.find((item) => item.id === block.id);
      return !old || JSON.stringify(old) !== JSON.stringify(block);
    })
    .map((block) => block.id);
}

function slotIsBuilding(board: TvBoard | null, id: string, local: string[]): boolean {
  if (board && Array.isArray(board.building)) return board.building.includes(id);
  return local.includes(id);
}

function SourcePick({
  mode,
  source,
  onPick,
}: {
  mode: ItemMode;
  source: PlaySource;
  onPick: (source: PlaySource) => void;
}) {
  const { t } = useI18n();
  const choices: { id: PlaySource; label: string }[] = [
    { id: "path", label: mode === "specific-file" ? t.video : t.folder },
    { id: "youtube", label: mode === "specific-file" ? t.youtube : t.youtubePlaylist },
  ];
  return (
    <fieldset class="source">
      <legend class="k">{t.intermissionFrom}</legend>
      <div class="source-grid" role="radiogroup" aria-label={t.intermissionFrom}>
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={source === choice.id}
            class={source === choice.id ? "mode on" : "mode"}
            onClick={() => onPick(choice.id)}
          >
            <b>{choice.label}</b>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Admin() {
  const { t } = useI18n();
  const today = WEEKDAY[new Date().getDay()]!;
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule);
  const [board, setBoard] = useState<TvBoard | null>(null);
  const [youtubeTitles, setYoutubeTitles] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slide, setSlide] = useState("");
  const [slideKey, setSlideKey] = useState(0);

  function slideTo(dir: "slide-next" | "slide-back") {
    setSlide(dir);
    setSlideKey((n) => n + 1);
  }

  function goBack() {
    slideTo("slide-back");
    setDraft((current) => {
      if (!current) return current;
      if (current.addPhase === "source") return { ...current, addPhase: "kind" };
      if (current.addPhase === "kind") return { ...current, addPhase: "list" };
      if (current.returnTo === "summary") return { ...current, formStep: "summary", returnTo: null };
      if (current.formStep === "what") return { ...current, formStep: "when" };
      if (current.formStep === "when") return { ...current, formStep: "how" };
      return current;
    });
  }

  function goNext() {
    slideTo("slide-next");
    setDraft((current) => (current?.formStep === "when" ? { ...current, formStep: "what" } : current));
  }

  function jumpStep(step: "how" | "when" | "what") {
    if (!draft || (draft.formStep === step && draft.addPhase === "list")) return;
    const order = ["how", "when", "what"] as const;
    const from = order.indexOf(draft.formStep === "summary" ? "what" : (draft.formStep as "how" | "when" | "what"));
    slideTo(order.indexOf(step) >= from ? "slide-next" : "slide-back");
    setDraft((current) => (current ? { ...current, formStep: step, addPhase: "list" } : current));
  }

  function editPart(step: "how" | "when" | "what" | "name") {
    slideTo("slide-next");
    setDraft((current) =>
      current ? { ...current, formStep: step, returnTo: "summary", addPhase: "list" } : current,
    );
  }

  function keepPart() {
    slideTo("slide-back");
    setDraft((current) =>
      current ? { ...current, formStep: "summary", returnTo: null, addPhase: "list" } : current,
    );
  }

  function changeButton(step: "how" | "when" | "what" | "name") {
    return (
      <button type="button" class="icon-btn pencil" aria-label={t.change} onClick={() => editPart(step)}>
        <PencilIcon />
      </button>
    );
  }

  function beginAdd() {
    slideTo("slide-next");
    setDraft((current) => (current ? { ...current, addPhase: "kind" } : current));
  }
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<FieldError>({});
  const [slotOp, setSlotOp] = useState<SlotOp | null>(null);
  const [slotOpSlow, setSlotOpSlow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmRemoveRef = useRef(false);
  confirmRemoveRef.current = confirmRemove;
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
  const measureEpoch = useRef(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sourceMissing, setSourceMissing] = useState(false);
  const [building, setBuilding] = useState<string[]>([]);
  const occupancyRef = useRef<Record<string, string>>({});
  const scheduleRef = useRef(schedule);
  const addKindRef = useRef<IntermissionKind>("folder");
  const addDraftRef = useRef("");
  scheduleRef.current = schedule;
  addKindRef.current = addKind;
  addDraftRef.current = addDraft;
  const formRef = useRef<HTMLFormElement>(null);
  const [gapEdit, setGapEdit] = useState<{ itemId: string; minutes: string } | null>(null);
  const [gapError, setGapError] = useState<string | null>(null);
  const gapEditRef = useRef(gapEdit);
  gapEditRef.current = gapEdit;
  const gapInputRef = useRef<HTMLInputElement>(null);
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

  function applyBoard(loaded: TvBoard) {
    setBoard(loaded);
    if (Array.isArray(loaded.building)) {
      setBuilding(loaded.building);
      return;
    }
    setBuilding((current) =>
      current.filter((id) => occupancyOf(loaded, id) === occupancyRef.current[id]),
    );
  }

  useEffect(() => {
    let cancel = false;
    function loadBoard() {
      api
        .tv()
        .then((loaded) => {
          if (!cancel) applyBoard(loaded);
        })
        .catch(() => undefined);
    }
    loadBoard();
    const id = window.setInterval(loadBoard, building.length > 0 ? 500 : 2000);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, [building.length]);

  const titleKey = youtubeScheduleKey(
    schedule,
    [
      addKind === "youtube" ? addDraft : "",
      draft?.mode === "specific-file" && draft.source === "youtube" ? draft.file : "",
      (draft?.mode === "next-episode" || draft?.mode === "random-file") && draft.source === "youtube"
        ? draft.folder
        : "",
      draft?.mode === "playlist" && draft.addSource === "youtube"
        ? draft.addMode === "specific-file"
          ? draft.addFile
          : draft.addFolder
        : "",
      ...(draft?.items ?? []).flatMap((item) => youtubeRefsOf(item.mode, item.folder, item.file)),
    ]
      .filter(Boolean)
      .join("\n"),
  );
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
    else setConfirmRemove(false);
  }, [draft]);

  useEffect(() => {
    if (!intermissionOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIntermissionOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (intermissionButtonRef.current?.contains(target)) return;
      if (intermissionPanelRef.current?.contains(target)) return;
      setIntermissionOpen(false);
      if (target instanceof Element && target.closest(".week-scale, .intermission-dismiss")) {
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [intermissionOpen]);

  const formOpen = Boolean(draft);
  useEffect(() => {
    if (!formOpen) return;
    formRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    function cancel() {
      if (slotOpRef.current) return;
      dismissTip();
      setGapEdit(null);
      setGapError(null);
      setDraft(null);
      setFieldError({});
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirmRemoveRef.current) {
        setConfirmRemove(false);
        return;
      }
      if (gapEditRef.current) {
        setGapEdit(null);
        setGapError(null);
        return;
      }
      cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen, panelToken]);

  useEffect(() => {
    if (!formOpen) {
      setGapEdit(null);
      setGapError(null);
    }
  }, [formOpen]);

  useEffect(() => {
    if (!gapEdit) return;
    gapInputRef.current?.focus();
    gapInputRef.current?.select();
  }, [gapEdit?.itemId]);

  useEffect(() => {
    if (!draft?.id || draft.mode === "playlist" || draft.source === "youtube") {
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
    const needsMeasure = draft
      ? draft.mode === "playlist"
        ? playlistAddNeedsMeasure(draft)
        : (draft.mode === "specific-file" && draft.source === "youtube") || draft.lengthChoice === "longest"
      : false;
    if (!draft || !needsMeasure) {
      measureEpoch.current += 1;
      setMeasured(null);
      setMeasuring(false);
      setFileCount(0);
      return;
    }
    const mode = draft.mode === "playlist" ? draft.addMode : draft.mode;
    const folder = draft.mode === "playlist" ? draft.addFolder : draft.folder;
    const file = draft.mode === "playlist" ? draft.addFile : draft.file;
    const key = measureKey(draft);
    const tubeVideo = mode === "specific-file" && (draft.mode === "playlist" ? draft.addSource : draft.source) === "youtube";
    const tubeList =
      (mode === "next-episode" || mode === "random-file") &&
      (draft.mode === "playlist" ? draft.addSource : draft.source) === "youtube";
    const empty = tubeVideo
      ? !parseYoutubeUrl(file)
      : tubeList
        ? !canonicalPlaylistUrl(folder)
        : mode === "specific-file"
          ? !file.trim()
          : !folder.trim();
    if (empty) {
      measureEpoch.current += 1;
      setMeasured({ key, length: null });
      setMeasuring(false);
      setFileCount(0);
      return;
    }
    const epoch = ++measureEpoch.current;
    let cancel = false;
    setMeasuring(true);
    setMeasured(null);
    setFileCount(0);
    if (mode === "random-file") {
      api
        .videoCount(folder)
        .then((res) => {
          if (!cancel) setFileCount(res.count);
        })
        .catch(() => {});
    }
    const timer = setTimeout(() => {
      api
        .slotLength(mode, folder, file, addMeasureCap(draft))
        .then((res) => {
          if (cancel || measureEpoch.current !== epoch) return;
          setMeasured({ key, length: res.length });
          setMeasuring(false);
        })
        .catch((err: unknown) => {
          if (cancel || measureEpoch.current !== epoch) return;
          const message = err instanceof Error ? err.message : String(err);
          setMeasured({ key, length: null, error: message });
          setMeasuring(false);
        });
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [
    draft?.mode,
    draft?.folder,
    draft?.file,
    draft?.addMode,
    draft?.addFolder,
    draft?.addFile,
    draft?.source,
    draft?.addSource,
    draft?.lengthChoice,
    draft?.addLengthChoice,
    draft?.addCustomMin,
    panelToken,
  ]);

  const stackKey = draft?.mode === "playlist" ? draft.items.map((item) => item.id).join("\n") : "";

  useEffect(() => {
    if (!draft || draft.mode !== "playlist") return;
    const pending = draft.items.filter(stackItemNeedsProbe);
    if (pending.length === 0) return;
    let cancel = false;
    void (async () => {
      for (const item of pending) {
        if (cancel) return;
        let length: SlotLength | null = null;
        let error: string | undefined;
        try {
          const res = await api.slotLength(item.mode, item.folder, item.file);
          length = res.length;
        } catch (err: unknown) {
          error = err instanceof Error ? err.message : String(err);
        }
        if (cancel) return;
        setDraft((current) => {
          if (!current || current.mode !== "playlist") return current;
          return {
            ...current,
            items: current.items.map((row) => {
              if (row.id !== item.id || row.durationSec != null) return row;
              if (error) return { ...row, error, durationSec: null };
              if (!length) return { ...row, durationSec: null, error: "No video found there." };
              return {
                ...row,
                durationSec: length.durationSec,
                title: length.title,
                error: undefined,
              };
            }),
          };
        });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [draft?.mode, stackKey, panelToken]);

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
      if (current.mode === "playlist") {
        const sec = stackSeconds(current.items);
        if (!sec) {
          if (current.items.length > 0 && !current.items.some((item) => item.error)) return current;
          return current.end === "" ? current : { ...current, end: "" };
        }
        const end = endFromDuration(current.start, sec);
        return current.end === end ? current : { ...current, end };
      }
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
  }, [measured, draft?.start, draft?.lengthChoice, draft?.customMin, draft?.items, draft?.mode]);

  function openPanel() {
    setPanelToken((token) => token + 1);
    setSaved(false);
    setFitMiss(null);
    setError(null);
    setFieldError({});
  }

  async function persist(next: Schedule, notice = true) {
    setError(null);
    const ids = changedBlockIds(schedule.blocks, next.blocks);
    if (ids.length) {
      occupancyRef.current = Object.fromEntries(ids.map((id) => [id, occupancyOf(board, id)]));
      setBuilding(ids);
    }
    const res = await api.saveSchedule(next);
    setSchedule(res.schedule);
    api
      .tv()
      .then((loaded) => applyBoard(loaded))
      .catch(() => undefined);
    if (notice) setSaved(true);
    return res;
  }

  function openGap(day: Day, startMin: number, endMin: number, at: number) {
    let start = startMin + Math.round((at - startMin) / 30) * 30;
    start = Math.min(Math.max(start, startMin), endMin);
    if (endMin - start < 30) start = startMin;
    const startClock = inputTime(start);
    measureEpoch.current += 1;
    setMeasuring(false);
    setMeasured(null);
    setDraft({
      id: null,
      origin: day,
      days: [day],
      start: startClock,
      end: endFromDuration(startClock, 60 * 60),
      starts: {},
      folder: "",
      file: "",
      source: "path",
      mode: "random-file",
      ...emptyStack(),
      lengthChoice: 60,
      customMin: "",
      freeEnd: endMin,
      gapStart: startMin,
      formStep: "how",
      addPhase: "list",
      returnTo: null,
    });
    openPanel();
  }

  function openSlot(block: ScheduleBlock, day: Day) {
    const placed = placedOn(block, day, board);
    const others = schedule.blocks
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
    setDraft({
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
    if (draft?.returnTo !== "summary") slideTo("slide-next");
    setDraft((current) => {
      if (!current) return current;
      const withStep = (next: Draft): Draft =>
        current.returnTo === "summary" ? next : { ...next, formStep: "when" };
      if (current.mode === mode) return withStep(current);
      if (mode === "playlist") {
        return withStep({
          ...current,
          mode,
          source: "path",
          folder: "",
          file: "",
          items: current.mode === "playlist" ? current.items : [],
          addMode: "specific-file",
          addSource: "path",
          addFolder: "",
          addFile: "",
          addLengthChoice: 60,
          addCustomMin: "",
          lengthChoice: "longest",
          end: current.items.length ? current.end : "",
        });
      }
      const cleared = current.mode === "playlist" ? { ...current, items: [] as DraftItem[], name: current.name } : current;
      if (mode === "specific-file") {
        const youtube = parseYoutubeUrl(cleared.file);
        if (youtube) {
          return withStep({
            ...cleared,
            mode,
            source: "youtube",
            file: youtube,
            folder: "",
            lengthChoice: "longest",
            end: "",
          });
        }
        const folder = canonicalPlaylistUrl(cleared.folder) ? "" : cleared.folder.trim().replace(/[\\/]+$/, "");
        const kept = cleared.file && !isYoutubeUrl(cleared.file) && parentDir(cleared.file) === folder;
        return withStep({ ...cleared, mode, source: "path", folder, file: kept ? cleared.file : folder });
      }
      const playlist = canonicalPlaylistUrl(cleared.folder) ?? canonicalPlaylistUrl(cleared.file);
      if ((mode === "next-episode" || mode === "random-file") && playlist) {
        const next = { ...cleared, mode, source: "youtube" as const, folder: playlist, file: "" };
        return withStep(next.lengthChoice === "longest" ? { ...next, lengthChoice: 60 } : next);
      }
      const folder =
        cleared.mode === "specific-file" && cleared.file && !isYoutubeUrl(cleared.file)
          ? parentDir(cleared.file) || cleared.folder
          : canonicalPlaylistUrl(cleared.folder) || isYoutubeUrl(cleared.file)
            ? ""
            : cleared.folder;
      const next = { ...cleared, mode, source: "path" as const, folder, file: "" };
      return withStep(
        mode === "next-episode" && next.lengthChoice === "longest" ? { ...next, lengthChoice: 60 } : next,
      );
    });
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  function choosePlaySource(source: PlaySource) {
    setDraft((current) => {
      if (!current) return current;
      if (current.mode === "playlist") {
        if (current.addSource === source) return current;
        return { ...current, addSource: source, addFolder: "", addFile: "" };
      }
      if (current.source === source) return current;
      const next: Draft = { ...current, source, folder: "", file: "" };
      if (current.mode === "specific-file" && source === "youtube") {
        return { ...next, lengthChoice: "longest", end: "" };
      }
      if (current.mode === "specific-file" && current.source === "youtube") {
        return { ...next, lengthChoice: 60, end: endFromDuration(current.start, 60 * 60) };
      }
      return next;
    });
    setFieldError((current) => ({ ...current, folder: undefined }));
  }

  async function choosePath() {
    if (!draft) return;
    const adding = draft.mode === "playlist";
    const source = adding ? draft.addSource : draft.source;
    if (source === "youtube") return;
    const video = (adding ? draft.addMode : draft.mode) === "specific-file";
    setPicking("draft");
    setFieldError((current) => ({ ...current, folder: undefined, form: undefined }));
    try {
      const picked = video ? await api.pickFile() : await api.pickFolder();
      if (!picked.path) return;
      const chosen = picked.path;
      setDraft((current) => {
        if (!current) return current;
        if (current.mode === "playlist") {
          if (current.addMode === "specific-file") {
            return { ...current, addFile: chosen, addFolder: parentDir(chosen) };
          }
          return { ...current, addFolder: chosen };
        }
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

  function addStackItem() {
    if (!draft || draft.mode !== "playlist") return;
    const randomFixed = draft.addMode === "random-file" && draft.addLengthChoice !== "longest";
    const mins = randomFixed ? addFixedMinutes(draft) : null;
    if (randomFixed) {
      if (!draft.addFolder.trim() || mins == null) return;
    } else if (!measured?.length || measured.key !== measureKey(draft)) {
      return;
    }
    const file =
      draft.addMode === "specific-file"
        ? (parseYoutubeUrl(draft.addFile) ?? draft.addFile.trim())
        : "";
    const folder =
      draft.addMode === "specific-file"
        ? parseYoutubeUrl(file)
          ? ""
          : parentDir(file)
        : (canonicalPlaylistUrl(draft.addFolder) ?? draft.addFolder.trim());
    const measuredSec =
      measured?.key === measureKey(draft) && measured.length ? measured.length.durationSec : null;
    const item: DraftItem = {
      id: newItemId(),
      mode: draft.addMode,
      folder,
      file,
      title: draft.addMode === "random-file" ? "" : (measured?.length?.title ?? ""),
      durationSec: measuredSec,
      ...(randomFixed && mins ? { lengthMin: mins } : {}),
    };
    slideTo("slide-back");
    setDraft({
      ...draft,
      items: [...draft.items, item],
      addFolder: "",
      addFile: "",
      addPhase: "list",
    });
    setFieldError((current) => ({ ...current, folder: undefined, time: undefined }));
  }

  function moveStackItem(id: string, dir: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const index = current.items.findIndex((item) => item.id === id);
      const swap = index + dir;
      if (index < 0 || swap < 0 || swap >= current.items.length) return current;
      const items = [...current.items];
      const [row] = items.splice(index, 1);
      items.splice(swap, 0, row!);
      return { ...current, items };
    });
  }

  function removeStackItem(id: string) {
    setDraft((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current));
  }

  function closeDraft() {
    if (slotOpRef.current) return;
    dismissTip();
    setGapEdit(null);
    setGapError(null);
    setDraft(null);
    setFieldError({});
  }

  function openItemGap(item: DraftItem) {
    dismissTip();
    setGapError(null);
    setGapEdit({ itemId: item.id, minutes: gapOf(item) ? String(gapOf(item)) : "" });
  }

  function saveGap() {
    if (!draft || !gapEdit) return;
    const raw = gapEdit.minutes.trim();
    const n = Number(raw);
    if (!raw || !Number.isInteger(n) || n < 1) {
      setGapError(t.needMinutes);
      return;
    }
    setDraft({
      ...draft,
      items: draft.items.map((item) => (item.id === gapEdit.itemId ? { ...item, gapAfterMin: n } : item)),
    });
    setGapEdit(null);
    setGapError(null);
  }

  function clearGap() {
    if (!draft || !gapEdit) return;
    setDraft({
      ...draft,
      items: draft.items.map((item) => {
        if (item.id !== gapEdit.itemId) return item;
        const next = { ...item };
        delete next.gapAfterMin;
        return next;
      }),
    });
    setGapEdit(null);
    setGapError(null);
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
      await persist({ ...current, ...next }, false);
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
    const stackBusy = draft.mode === "playlist" && draft.items.some(stackItemNeedsProbe);
    const tubeVideo = draft.mode === "specific-file" && draft.source === "youtube";
    const tubeList =
      (draft.mode === "next-episode" || draft.mode === "random-file") && draft.source === "youtube";
    const waitsForMeasure =
      draft.mode !== "playlist" &&
      measuring &&
      (tubeVideo || draft.lengthChoice === "longest");
    if (waitsForMeasure) {
      next.time = "Still measuring the video.";
    } else if (stackBusy) {
      next.time = "Still measuring the video.";
    } else if (draft.mode === "playlist" && !draft.name.trim()) {
      next.folder = "Each playlist needs a name";
    } else if (draft.mode === "playlist" && draft.items.length === 0) {
      next.folder = "Each playlist needs at least one video";
    } else if (!draft.end) {
      next.time =
        draft.mode === "playlist"
          ? "Each playlist needs at least one video"
          : "Choose a video, folder, or YouTube URL to set the length.";
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
    const video = draft.mode === "specific-file" && draft.source === "path";
    const playlist = draft.mode === "playlist";
    if (playlist) {
      const broken = draft.items.find((item) => item.error);
      if (broken?.error) next.folder = broken.error;
    } else if (tubeVideo) {
      if (!draft.file.trim()) next.folder = "Each specific-file block needs a video";
      else if (!parseYoutubeUrl(draft.file)) next.folder = "Not a YouTube video URL";
    } else if (tubeList) {
      if (!draft.folder.trim()) next.folder = "Type a YouTube playlist URL.";
      else if (!canonicalPlaylistUrl(draft.folder)) next.folder = "Not a YouTube playlist URL";
    } else if (video) {
      if (!draft.file.trim()) next.folder = "Each specific-file block needs a video";
      else if (isYoutubeLink(draft.file)) next.folder = "That is a YouTube link. Choose YouTube, then add it.";
    } else if (!draft.folder.trim()) {
      next.folder = "Each block needs a folder";
    } else if (isYoutubeLink(draft.folder)) {
      next.folder = draft.mode === "next-episode"
        ? "Not a YouTube playlist URL"
        : "That is a YouTube link. Choose YouTube, then add it.";
    }
    if (sourceMissing) {
      next.folder = draft.mode === "specific-file" ? t.sourceMissingVideo : t.sourceMissingFolder;
    }
    if (next.time || next.folder) {
      setFieldError(next);
      return;
    }
    if (slotOpRef.current) return;
    const youtubeFile = tubeVideo ? parseYoutubeUrl(draft.file) : null;
    const file = youtubeFile ?? draft.file.trim();
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
      folder: playlist
        ? ""
        : tubeVideo
          ? ""
          : video
            ? parentDir(file)
            : tubeList
              ? (canonicalPlaylistUrl(draft.folder) ?? draft.folder.trim())
              : draft.folder.trim(),
      ...((video || tubeVideo) && !playlist ? { file: youtubeFile ?? file } : {}),
      mode: draft.mode,
      ...(playlist ? { name: draft.name.trim(), items: draft.items.map(toEntry) } : {}),
    };
    const blocks = draft.id
      ? schedule.blocks.map((item) => (item.id === draft.id ? block : item))
      : [...schedule.blocks, block];
    beginSlotOp("save");
    try {
      const res = await persist({ ...schedule, blocks });
      setFitMiss(res.misses.find((miss) => miss.blockId === block.id) ?? null);
      dismissTip();
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
    const removed = draft;
    const previous = schedule;
    const next = {
      ...schedule,
      blocks: schedule.blocks.filter((item) => item.id !== removed.id),
    };
    beginSlotOp("remove");
    setSchedule(next);
    dismissTip();
    setDraft(null);
    setFieldError({});
    try {
      await persist(next);
    } catch (e) {
      setSchedule(previous);
      setDraft(removed);
      setFieldError({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      endSlotOp();
    }
  }

  function stopMeasuring() {
    measureEpoch.current += 1;
    setMeasuring(false);
    setMeasured(null);
    setFileCount(0);
  }

  function chooseLength(source: "fixed" | "longest") {
    if (source === "fixed") stopMeasuring();
    setDraft((current) => {
      if (!current) return current;
      if (source === "longest") {
        return current.lengthChoice === "longest" ? current : { ...current, lengthChoice: "longest", end: "" };
      }
      if (current.lengthChoice !== "longest") return current;
      const mins = 60;
      return { ...current, lengthChoice: mins, end: endFromDuration(current.start, mins * 60) };
    });
    setFieldError((current) => ({ ...current, time: undefined }));
  }

  function chooseAddLength(source: "fixed" | "longest") {
    if (source === "fixed") stopMeasuring();
    setDraft((current) => {
      if (!current) return current;
      if (source === "longest") {
        return current.addLengthChoice === "longest" ? current : { ...current, addLengthChoice: "longest" };
      }
      if (current.addLengthChoice !== "longest") return current;
      return { ...current, addLengthChoice: 60 };
    });
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
    ? draft.mode === "playlist"
      ? draft.addSource === "youtube"
        ? draft.addMode === "specific-file"
          ? Boolean(parseYoutubeUrl(draft.addFile))
          : Boolean(canonicalPlaylistUrl(draft.addFolder))
        : draft.addMode === "specific-file"
          ? Boolean(draft.addFile.trim())
          : Boolean(draft.addFolder.trim())
      : draft.source === "youtube"
        ? draft.mode === "specific-file"
          ? Boolean(parseYoutubeUrl(draft.file))
          : Boolean(canonicalPlaylistUrl(draft.folder))
        : draft.mode === "specific-file"
          ? Boolean(draft.file.trim())
          : Boolean(draft.folder.trim())
    : false;
  const stackSec = draft?.mode === "playlist" ? stackSeconds(draft.items) : null;
  const editingGap = draft && gapEdit ? draft.items.find((item) => item.id === gapEdit.itemId) : undefined;
  const editingGapSet = editingGap ? gapOf(editingGap) > 0 : false;
  const addSec = draft?.mode === "playlist" && pathChosen ? addSeconds(draft, matched) : null;
  const addPreviewSec =
    draft?.mode === "playlist" && addSec != null ? knownStackSeconds(draft.items) + addSec : null;
  const addPreviewEnd = draft && addPreviewSec != null ? endFace(draft.start, addPreviewSec) : undefined;
  const addPreviewSpill = draft && addPreviewSec != null ? spillsPastDay(draft.start, addPreviewSec) : false;
  const stackBusy = draft?.mode === "playlist" && draft.items.some(stackItemNeedsProbe);
  const activeSec = draft ? (chosenSeconds(draft, matched) ?? 0) : 0;
  const fixedMin = draft && draft.lengthChoice !== "longest" ? fixedMinutes(draft) : null;
  const clashes = draft && activeSec ? dayClashes(draft, schedule.blocks, activeSec, youtubeTitles, board) : [];
  const lengthLabels = [...PRESETS.map((mins) => t.minutes(mins)), t.customLength];
  const lengthCh = Math.max(...lengthLabels.map((label) => label.length));
  const addDisabled = !draft
    ? true
    : draft.mode === "playlist"
      ? !draft.name.trim() ||
        draft.items.length === 0 ||
        Boolean(stackBusy) ||
        draft.items.some((item) => Boolean(item.error))
      : sourceMissing
        ? true
        : draft.lengthChoice === "longest"
          ? measuring || !pathChosen || !length || Boolean(matched?.error)
          : !pathChosen || fixedMin === null;
  const formStep = draft?.formStep ?? "how";
  const addPhase = draft?.addPhase ?? "list";
  const editingPart = Boolean(draft?.returnTo);
  const showHow = formStep === "how";
  const showWhen = formStep === "when";
  const showWhat = formStep === "what" && addPhase === "list";
  const showAddKind = formStep === "what" && addPhase === "kind";
  const showAddSource = formStep === "what" && addPhase === "source";
  const showSummary = formStep === "summary";
  const showBack =
    addPhase !== "list" || formStep === "when" || formStep === "what" || (editingPart && !showSummary);
  const addItemReady =
    draft?.mode === "playlist" && addPhase === "source"
      ? draft.addMode === "random-file" && draft.addLengthChoice !== "longest"
        ? (draft.addSource === "youtube"
            ? Boolean(canonicalPlaylistUrl(draft.addFolder))
            : Boolean(draft.addFolder.trim())) && addFixedMinutes(draft) != null
        : Boolean(measured?.length && measured.key === measureKey(draft) && !measured.error)
      : false;
  const ghostsByDay = draft
    ? Object.fromEntries(DAYS.map((day) => [day, ghostsOn(draft, day, schedule.blocks, board)]))
    : null;
  const savedBlock = draft?.id ? schedule.blocks.find((block) => block.id === draft.id) : undefined;
  const painted = savedBlock && draft ? placedOn(savedBlock, draft.origin, board) : null;
  const summaryEnd = !draft
    ? ""
    : draft.mode === "playlist"
      ? stackSec != null
        ? endFace(draft.start, stackSec)
        : draft.end ||
          (painted && startOnDraft(draft, draft.origin) === painted.start ? painted.end : "") ||
          "/"
      : activeSec
        ? endFace(draft.start, activeSec)
        : draft.end;
  const summaryMin = !draft
    ? null
    : draft.mode === "playlist" && stackSec != null
      ? Math.max(1, Math.ceil(stackSec / 60))
      : activeSec
        ? Math.max(1, Math.ceil(activeSec / 60))
        : fixedMin;
  const summaryLen =
    summaryMin != null && summaryMin > 0
      ? t.slotDurationOf(summaryMin)
      : draft && summaryEnd && summaryEnd !== "/"
        ? t.slotDurationOf(Math.max(1, toMin(summaryEnd) - toMin(draft.start)))
        : "";

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
          <div
            class="intermission-dismiss"
            onPointerDown={(event) => {
              event.preventDefault();
              setIntermissionOpen(false);
            }}
          />
        )}
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
            const pieces = piecesFor(day, schedule.blocks, board);
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
                    const placed = placedOn(piece.block, piece.origin, board);
                    const draftTime = draft ? startOnDraft(draft, piece.origin) : "";
                    const picked =
                      draft?.id === piece.block.id &&
                      draft.origin === piece.origin &&
                      draftTime === placed.start;
                    const spill = piece.origin !== day;
                    const calculating = slotIsBuilding(board, piece.block.id, building);
                    const stackLines =
                      piece.block.mode === "playlist"
                        ? fromPlaylist(piece.block, piece.origin, board)
                        : [];
                    return (
                      <button
                        key={`${piece.block.id}-${piece.origin}-${piece.start}`}
                        type="button"
                        class={`slot${slotKind(piece.block)}${picked ? " pick" : ""}${spill ? " spill" : ""}`}
                        style={rowStyle(span)}
                        title={slotHover(piece.block, youtubeTitles)}
                        aria-busy={calculating ? "true" : undefined}
                        onClick={() => openSlot(piece.block, piece.origin)}
                      >
                        {calculating ? (
                          <span class="slot-calc">
                            <span class="spin" aria-hidden="true" />
                            {t.calculating}
                          </span>
                        ) : null}
                        <span class="tm">
                          {clockFace(piece.start)}–{clockFace(piece.end)}
                          {spill ? ` · ${t.day[piece.origin]}` : ""}
                        </span>
                        <b>{slotLabel(piece.block, youtubeTitles)}</b>
                        {stackLines.length ? (
                          <span class="stack-lines">
                            {stackLines.map((item, index) => (
                              <Fragment key={item.id}>
                                <span>{playlistGridLine(item, t, youtubeTitles)}</span>
                                {index < stackLines.length - 1 && gapOf(item) > 0 ? (
                                  <span>{t.playlistGapLine(gapOf(item))}</span>
                                ) : null}
                              </Fragment>
                            ))}
                          </span>
                        ) : null}
                        <i>{t.lengthOf(span)}</i>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {draft && (
          <div
            class="scrim"
            onClick={closeDraft}
          />
        )}
        {draft && (
          <form
            ref={formRef}
            class={confirmRemove ? "add-form asking" : "add-form"}
            aria-busy={slotOp ? "true" : undefined}
            onSubmit={(event) => {
              event.preventDefault();
              if (showSummary || (showWhat && !editingPart)) void commit();
            }}
          >
            <header>
              <b>{draft.id ? t.editSlot(t.dayName[draft.origin]) : t.newSlot(t.dayName[draft.origin])}</b>
              <span class={`mode-pill ${blockClass(draft.mode)}`}>
                {blockLabel(draft.mode, t)}
                {showSummary && draft.mode !== "playlist" && changeButton("how")}
              </span>
              {draft.id && (
                <button
                  type="button"
                  class="icon-btn trash"
                  aria-label={t.deleteSlot}
                  onClick={() => setConfirmRemove(true)}
                >
                  <TrashIcon />
                </button>
              )}
            </header>
            {!showSummary && !editingPart && (
              <div class="step-tabs" role="tablist">
                {(["how", "when", "what"] as const).map((step) => (
                  <button
                    key={step}
                    type="button"
                    role="tab"
                    aria-selected={formStep === step}
                    class={formStep === step ? "on" : ""}
                    onClick={() => jumpStep(step)}
                  >
                    {step === "how" ? t.stepHow : step === "when" ? t.stepWhen : t.stepWhat}
                  </button>
                ))}
              </div>
            )}
            <div key={slideKey} class={slide ? `step-body ${slide}` : "step-body"}>
            {showSummary && (
              <div class="summary">
                <div class="summary-title">
                  <span>
                    {draft.mode === "playlist"
                      ? draft.name || t.playlistName
                      : draft.mode === "specific-file" && draft.source === "youtube"
                        ? youtubeTitles[parseYoutubeUrl(draft.file) ?? ""] || draft.file
                        : draft.source === "youtube"
                          ? youtubeTitles[canonicalPlaylistUrl(draft.folder) ?? ""] || draft.folder
                          : draft.mode === "specific-file"
                            ? draft.file.split(/[\\/]/).pop() || draft.file
                            : draft.folder}
                  </span>
                  {changeButton(draft.mode === "playlist" ? "name" : "what")}
                </div>
                <div class="summary-fact">
                  <span>
                    {t.dayName[draft.origin]} {startOnDraft(draft, draft.origin)}
                    {" – "}
                    {summaryEnd}
                  </span>
                  <span class="len">{summaryLen}</span>
                  {changeButton("when")}
                </div>
                {draft.mode === "playlist" ? (
                  <>
                    <div class="summary-label">
                      <span class="k">{t.playlistStack}</span>
                      {changeButton("what")}
                    </div>
                    {draft.items.length === 0 ? (
                      <p class="mode-note">{t.playlistEmpty}</p>
                    ) : (
                      <ol class="playlist summary">
                        {draft.items.map((item, index) => {
                          const clock = stackClocks(draft.start, draft.items)[index]!;
                          return (
                          <li key={item.id} class="playlist-item">
                            <span class="item-when">
                              <span>{clock.start}</span>
                              <span class="dash">–</span>
                              <span>{clock.end}</span>
                            </span>
                            <div class="playlist-copy">
                              <b>{itemLabel(item, youtubeTitles)}</b>
                              <span>{stackItemLine(item, t)}</span>
                            </div>
                            <hr />
                          </li>
                          );
                        })}
                      </ol>
                    )}
                  </>
                ) : (
                  <p class="summary-line">
                    {blockLabel(draft.mode, t)}
                    {summaryLen && ` · ${summaryLen}`}
                  </p>
                )}
              </div>
            )}
            {formStep === "name" && (
              <label>
                <span class="k">{t.playlistName}</span>
                <input
                  value={draft.name}
                  placeholder={t.playlistNamePlaceholder}
                  aria-invalid={fieldError.folder && !draft.name.trim() ? "true" : undefined}
                  onInput={(event) => {
                    setDraft({ ...draft, name: (event.target as HTMLInputElement).value });
                    setFieldError((current) => ({ ...current, folder: undefined }));
                  }}
                />
              </label>
            )}
            {showHow && (
            <div class="pick-mode">
              <div class="mode-list" role="radiogroup" aria-label={t.playHow}>
                {CHIP_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={draft.mode === mode}
                    class={draft.mode === mode ? `mode on ${blockClass(mode)}` : "mode"}
                    onClick={() => chooseMode(mode)}
                  >
                    <b>{blockLabel(mode, t)}</b>
                    <span>{blockHint(mode, t)}</span>
                  </button>
                ))}
              </div>
            </div>
            )}
            {(showWhat || ((showAddKind || showAddSource) && draft.mode === "playlist")) && draft.mode === "playlist" ? (
              <div class="folder-block">
                {showWhat && (
                <>
                {!editingPart && (
                <label>
                  <span class="k">{t.playlistName}</span>
                  <input
                    value={draft.name}
                    placeholder={t.playlistNamePlaceholder}
                    aria-invalid={fieldError.folder && !draft.name.trim() ? "true" : undefined}
                    onInput={(event) => {
                      setDraft({ ...draft, name: (event.target as HTMLInputElement).value });
                      setFieldError((current) => ({ ...current, folder: undefined }));
                    }}
                  />
                </label>
                )}
                <span class="k stack-head">{t.playlistStack}</span>
                {draft.items.length === 0 ? (
                  <p class="mode-note">{t.playlistEmpty}</p>
                ) : (
                  <ol class="playlist">
                    {draft.items.map((item, index) => {
                      const clock = stackClocks(draft.start, draft.items)[index]!;
                      return (
                      <Fragment key={item.id}>
                      <li class="playlist-item">
                        <span class="item-when">
                          <span>{clock.start}</span>
                          <span class="dash">–</span>
                          <span>{clock.end}</span>
                        </span>
                        <div class="playlist-copy">
                          <b>{itemLabel(item, youtubeTitles)}</b>
                          <span>{stackItemLine(item, t)}</span>
                        </div>
                        <div class="playlist-tools">
                          <button
                            type="button"
                            disabled={index === 0}
                            aria-label={t.moveUp}
                            title={t.moveUp}
                            onClick={() => moveStackItem(item.id, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === draft.items.length - 1}
                            aria-label={t.moveDown}
                            title={t.moveDown}
                            onClick={() => moveStackItem(item.id, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            class="x"
                            aria-label={t.remove}
                            title={t.remove}
                            onClick={() => removeStackItem(item.id)}
                          >
                            ×
                          </button>
                        </div>
                      </li>
                      {index < draft.items.length - 1 && (
                        <li class="playlist-gap">
                          <hr />
                          {gapOf(item) > 0 ? <span class="gap-mins">{t.minutes(gapOf(item))}</span> : null}
                          <span class="cloud-host" onMouseEnter={placeCloud} onMouseLeave={hideCloud}>
                            <button
                              type="button"
                              class={gapOf(item) > 0 ? "gap-plus on" : "gap-plus"}
                              aria-label={t.playlistGapAdd}
                              onFocus={showCloud}
                              onBlur={blurCloud}
                              onClick={() => openItemGap(item)}
                            >
                              +
                            </button>
                            <span class="cloud" role="tooltip">
                              {t.playlistGapTip}
                            </span>
                          </span>
                        </li>
                      )}
                      </Fragment>
                      );
                    })}
                  </ol>
                )}
                {draft.items.length > 0 && (
                  <p class="tally">
                    {t.videoCount(draft.items.length)}
                    {stackSec != null && (
                      <> · {t.slotDurationOf(Math.max(1, Math.ceil(stackSec / 60)))}</>
                    )}
                    <span class="slash">/</span>
                    {t.startsMark} · {draft.start} - {t.endsMark} ·{" "}
                    {stackSec != null
                      ? `${endFace(draft.start, stackSec)}${spillsPastDay(draft.start, stackSec) ? ` ${t.day[nextDay(draft.origin)]}` : ""}`
                      : "/"}
                  </p>
                )}
                <button type="button" class="wide" onClick={beginAdd}>
                  {t.addToPlaylist}
                </button>
                </>
                )}
                {(showAddKind || showAddSource) && (
                <div class="add-next">
                  {showAddKind && (
                  <div class="mode-list" role="radiogroup" aria-label={t.addToPlaylist}>
                    {ADD_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={draft.addMode === mode}
                        class={draft.addMode === mode ? `mode on ${modeClass(mode)}` : "mode"}
                        onClick={() => {
                          if (mode === "random-file") stopMeasuring();
                          slideTo("slide-next");
                          const keepList = mode !== "specific-file" && draft.addMode !== "specific-file";
                          setDraft({
                            ...draft,
                            addMode: mode,
                            addSource: keepList ? draft.addSource : "path",
                            addFolder: mode === "specific-file" || (!keepList && isYoutubeLink(draft.addFolder))
                              ? ""
                              : draft.addFolder,
                            addFile: mode === "specific-file" && !isYoutubeUrl(draft.addFile) ? draft.addFile : "",
                            addLengthChoice: mode === "random-file" ? 60 : "longest",
                            addPhase: "source",
                          });
                        }}
                      >
                        <b>{modeLabel(mode, t)}</b>
                        <span>{modeHint(mode, t)}</span>
                      </button>
                    ))}
                  </div>
                  )}
                  {showAddSource && (
                  <>
                    <SourcePick mode={draft.addMode} source={draft.addSource} onPick={choosePlaySource} />
                  {draft.addSource === "youtube" && (
                    <p class="mode-note">
                      {draft.addMode === "next-episode"
                        ? t.youtubePlaylistNote
                        : draft.addMode === "random-file"
                          ? t.youtubeRandomNote
                          : t.youtubeCaveat}
                    </p>
                  )}
                  {draft.addSource === "youtube" ? (
                    <div class="path-field">
                      <div class="field">
                        <input
                          value={draft.addMode === "specific-file" ? draft.addFile : draft.addFolder}
                          placeholder={
                            draft.addMode === "specific-file"
                              ? t.youtubePlaceholder
                              : t.youtubePlaylistPlaceholder
                          }
                          aria-invalid={fieldError.folder ? "true" : undefined}
                          onInput={(event) => {
                            const value = (event.target as HTMLInputElement).value;
                            setDraft(
                              draft.addMode === "specific-file"
                                ? { ...draft, addFile: value, addFolder: "" }
                                : { ...draft, addFolder: value, addFile: "" },
                            );
                            setFieldError((current) => ({ ...current, folder: undefined }));
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <FolderPath
                      key={draft.addMode}
                      kind={draft.addMode === "specific-file" ? "video" : "folder"}
                      value={draft.addMode === "specific-file" ? draft.addFile : draft.addFolder}
                      placeholder={draft.addMode === "specific-file" ? t.videoPlaceholder : t.folderPlaceholder}
                      invalid={Boolean(fieldError.folder)}
                      actionLabel={picking === "draft" ? t.choosing : t.browse}
                      actionBusy={picking === "draft"}
                      listLabel={draft.addMode === "specific-file" ? t.video : t.folder}
                      onChange={(value) => {
                        setDraft(
                          draft.addMode === "specific-file"
                            ? { ...draft, addFile: value, addFolder: parentDir(value) }
                            : { ...draft, addFolder: value },
                        );
                        setFieldError((current) => ({ ...current, folder: undefined }));
                      }}
                      onAction={() => void choosePath()}
                    />
                  )}
                  {draft.addSource === "youtube" &&
                    draft.addMode === "specific-file" &&
                    draft.addFile.trim() &&
                    !parseYoutubeUrl(draft.addFile) && (
                      <p class="field-error">{t.error("Not a YouTube video URL")}</p>
                    )}
                  {draft.addSource === "youtube" &&
                    draft.addMode !== "specific-file" &&
                    draft.addFolder.trim() &&
                    !canonicalPlaylistUrl(draft.addFolder) && (
                      <p class="field-error">{t.error("Not a YouTube playlist URL")}</p>
                    )}
                  {measuring && pathChosen && !(draft.addMode === "random-file" && draft.addLengthChoice !== "longest") ? (
                    <div class="wait">
                      <div class="wait-line">
                        <span class="spin" aria-hidden="true" />
                        <span class="measure-label">{t.measuringVideos}</span>
                      </div>
                    </div>
                  ) : addPreviewEnd ? (
                    <div class="picked">
                      <div>
                        <span class="k">{t.videoDuration}</span>
                        <span class="value">
                          {length && (draft.addSource === "youtube" || draft.addMode === "random-file") && length.title
                            ? `${length.title} · ${t.slotDurationOf(lengthMins)}`
                            : t.slotDurationOf(Math.max(1, Math.ceil((addSec ?? 0) / 60)))}
                        </span>
                      </div>
                      <p class="when-note">
                        {t.startsMark} · {draft.start} · {t.endsMark} · {addPreviewEnd}
                        {addPreviewSpill ? ` ${t.day[nextDay(draft.origin)]}` : ""}
                      </p>
                    </div>
                  ) : null}
                  {matched?.error && <p class="field-error">{t.error(matched.error)}</p>}
                  {pathChosen && !measuring && matched && !length && !matched.error && (
                    <p class="field-error">{t.noVideo}</p>
                  )}
                  {pathChosen && draft.addMode === "random-file" && (
                    <fieldset class="source">
                      <legend class="k">{t.playlistRandomCap}</legend>
                      <div class="source-grid" role="radiogroup" aria-label={t.playlistRandomCap}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={draft.addLengthChoice !== "longest"}
                          class={draft.addLengthChoice !== "longest" ? "mode on" : "mode"}
                          onClick={() => chooseAddLength("fixed")}
                        >
                          <b>{t.fixedLength}</b>
                          <span>{t.standardSlot}</span>
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={draft.addLengthChoice === "longest"}
                          class={draft.addLengthChoice === "longest" ? "mode on" : "mode"}
                          onClick={() => chooseAddLength("longest")}
                        >
                          <b>{t.longestFile}</b>
                        </button>
                        {draft.addLengthChoice === "longest" && (
                          <span class="cloud-host" onMouseEnter={placeCloud} onMouseLeave={hideCloud}>
                            <button
                              type="button"
                              class="info"
                              aria-label={t.playlistRandomCap}
                              onFocus={showCloud}
                              onBlur={blurCloud}
                            >
                              <InfoMark />
                            </button>
                            <span class="cloud" role="tooltip">
                              {t.playlistLongestHint}
                            </span>
                          </span>
                        )}
                      </div>
                    </fieldset>
                  )}
                  {pathChosen && draft.addMode === "random-file" && draft.addLengthChoice !== "longest" && (
                    <div class="fixed">
                      <span class="k">{t.playlistRandomCap}</span>
                      <DurationPick
                        lengthChoice={draft.addLengthChoice}
                        customMin={draft.addCustomMin}
                        lengthCh={lengthCh}
                        t={t}
                        tip={t.playlistRandomHint}
                        onChoice={(value) =>
                          setDraft((current) => (current ? { ...current, addLengthChoice: value } : current))
                        }
                        onCustom={(value) =>
                          setDraft((current) => (current ? { ...current, addCustomMin: value } : current))
                        }
                      />
                      {draft.addLengthChoice === "custom" &&
                        draft.addCustomMin.trim() !== "" &&
                        addFixedMinutes(draft) === null && <p class="field-error">{t.needMinutes}</p>}
                    </div>
                  )}
                  {draft.addMode === "next-episode" && pathChosen && (
                    <span class="cloud-host" onMouseEnter={placeCloud} onMouseLeave={hideCloud}>
                      <button type="button" class="info" aria-label={t.playlistNextHint} onFocus={showCloud} onBlur={blurCloud}>
                        <InfoMark />
                      </button>
                      <span class="cloud" role="tooltip">
                        {t.playlistNextHint}
                      </span>
                    </span>
                  )}
                  {fieldError.folder && <p class="field-error">{t.error(fieldError.folder)}</p>}
                  </>
                  )}
                </div>
                )}
              </div>
            ) : showWhat ? (
            <div class="folder-block">
              {(draft.mode === "specific-file" ||
                draft.mode === "next-episode" ||
                draft.mode === "random-file") && (
                <SourcePick mode={draft.mode} source={draft.source} onPick={choosePlaySource} />
              )}
              <span class="k">
                {draft.source === "youtube" && draft.mode === "specific-file"
                  ? t.chooseYoutube
                  : draft.source === "youtube"
                    ? t.choosePlaylist
                    : draft.mode === "specific-file"
                      ? t.chooseVideo
                      : t.chooseFolder}
              </span>
              {draft.source === "youtube" ? (
                <div class="path-field">
                  <div class="field">
                    <input
                      value={draft.mode === "specific-file" ? draft.file : draft.folder}
                      placeholder={
                        draft.mode === "specific-file" ? t.youtubePlaceholder : t.youtubePlaylistPlaceholder
                      }
                      aria-invalid={fieldError.folder ? "true" : undefined}
                      onInput={(event) => {
                        const value = (event.target as HTMLInputElement).value;
                        setDraft(
                          draft.mode === "specific-file"
                            ? { ...draft, file: value, folder: "" }
                            : { ...draft, folder: value, file: "" },
                        );
                        setFieldError((current) => ({ ...current, folder: undefined }));
                      }}
                    />
                  </div>
                </div>
              ) : (
                <FolderPath
                  key={`${draft.mode}:${draft.source}`}
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
              {draft.source === "youtube" && draft.mode === "specific-file" && (
                <p class="mode-note">{t.youtubeCaveat}</p>
              )}
              {draft.source === "youtube" && draft.mode === "next-episode" && (
                <p class="mode-note">{t.youtubePlaylistNote}</p>
              )}
              {draft.source === "youtube" && draft.mode === "random-file" && (
                <p class="mode-note">{t.youtubeRandomNote}</p>
              )}
              {draft.source === "youtube" &&
                draft.mode === "specific-file" &&
                draft.file.trim() &&
                !parseYoutubeUrl(draft.file) &&
                !fieldError.folder && <p class="field-error">{t.error("Not a YouTube video URL")}</p>}
              {draft.source === "youtube" &&
                draft.mode !== "specific-file" &&
                draft.folder.trim() &&
                !canonicalPlaylistUrl(draft.folder) &&
                !fieldError.folder && <p class="field-error">{t.error("Not a YouTube playlist URL")}</p>}
              {sourceMissing && (
                <p class="field-error">
                  {draft.mode === "specific-file" ? t.sourceMissingVideo : t.sourceMissingFolder}
                </p>
              )}
              {!sourceMissing && fieldError.folder && <p class="field-error">{t.error(fieldError.folder)}</p>}
              {pathChosen && (
              <>
              {draft.mode !== "next-episode" && !(draft.mode === "specific-file" && draft.source === "youtube") && (
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
              {(draft.mode === "specific-file" && draft.source === "youtube") || draft.lengthChoice === "longest" ? (
                measuring && pathChosen ? (
                  <div class="wait">
                    <div class="wait-line">
                      <span class="spin" aria-hidden="true" />
                      <span class="cloud-host" onMouseEnter={placeCloud} onMouseLeave={hideCloud}>
                        <span class="measure-label">{t.measuringVideos}</span>
                        <span class="cloud" role="tooltip">
                          {t.elapsed(elapsedClock(elapsedSec))}
                        </span>
                      </span>
                      <span class="cloud-host" onMouseEnter={placeCloud} onMouseLeave={hideCloud}>
                        <button type="button" class="info" aria-label={t.whySlow} onFocus={showCloud} onBlur={blurCloud}>
                          <InfoMark />
                        </button>
                        <span class="cloud" role="tooltip">
                          {draft.source === "youtube" ? t.youtubeProbeCache : t.probeCache}
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
                    {draft.source === "youtube" && draft.mode === "specific-file" && (
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
                  <DurationPick
                    lengthChoice={draft.lengthChoice}
                    customMin={draft.customMin}
                    lengthCh={lengthCh}
                    t={t}
                    onChoice={(value) =>
                      setDraft((current) => (current ? { ...current, lengthChoice: value } : current))
                    }
                    onCustom={(value) =>
                      setDraft((current) => (current ? { ...current, customMin: value } : current))
                    }
                  />
                  {draft.lengthChoice === "custom" && draft.customMin.trim() !== "" && fixedMin === null && (
                    <p class="field-error">{t.needMinutes}</p>
                  )}
                </div>
              )}
              </>
              )}
            </div>
            ) : null}
            {showWhen && (
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
                  .filter((item) => item.day === day || (spills && item.day === nextDay(day)))
                  .sort((a, b) => toMin(a.start) - toMin(b.start))[0];
                const prev = prevOnDay(day, start, schedule.blocks, draft.id);
                const next = nextOnDay(day, start, schedule.blocks, draft.id);
                const end = activeSec ? endFace(start, activeSec) : undefined;
                const endLabel =
                  draft.mode === "playlist" && draft.items.length === 0 ? "/" : (end ?? "/");
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
            )}
            {(showWhat || showSummary) && clashes[0] && (
              <p class="warn" role="status">
                {t.overlaps} {clashes[0].title}, {clashes[0].start}–{clashes[0].end}.
              </p>
            )}
            {draft.mode !== "playlist" &&
              draft.lengthChoice === "longest" &&
              !measuring &&
              pathChosen &&
              matched &&
              !length &&
              !matched.error && (
              <p class="field-error">{t.noVideo}</p>
            )}
            {draft.mode !== "playlist" && matched?.error && (
              <p class="field-error">{t.error(matched.error)}</p>
            )}
            {fieldError.time && <p class="field-error">{t.error(fieldError.time)}</p>}
            </div>
            <div class="actions">
              {addPhase === "list" && (
              <button
                type="button"
                class="cancel"
                disabled={slotOp !== null}
                onClick={closeDraft}
              >
                {t.cancel}
              </button>
              )}
              {showBack && (
                <button type="button" disabled={slotOp !== null} onClick={goBack}>
                  {t.back}
                </button>
              )}
              {showAddSource && (
                <button
                  type="button"
                  class="primary"
                  disabled={!addItemReady || slotOp !== null}
                  onClick={addStackItem}
                >
                  {t.add}
                </button>
              )}
              {showWhen && !editingPart && (
                <button
                  type="button"
                  class="primary"
                  disabled={clashes.length > 0 || slotOp !== null}
                  onClick={goNext}
                >
                  {t.next}
                </button>
              )}
              {(showSummary || (showWhat && !editingPart)) && (
                <button
                  type="submit"
                  class={slotOp === "save" ? "primary working" : "primary"}
                  disabled={addDisabled || clashes.length > 0 || slotOp !== null}
                >
                  {slotOpSlow && slotOp === "save" && <span class="spin" aria-hidden="true" />}
                  {draft.id ? t.save : t.add}
                </button>
              )}
              {editingPart && !showSummary && addPhase === "list" && (
                <button type="button" class="primary" disabled={slotOp !== null} onClick={keepPart}>
                  {t.save}
                </button>
              )}
            </div>
            {fieldError.form && (
              <p class="field-error" ref={formErrorRef} role="alert">
                {t.error(fieldError.form)}
              </p>
            )}
            {confirmRemove && (
              <div class="ask" role="alertdialog" aria-modal="true" aria-labelledby="delete-ask">
                <div class="ask-card">
                  <p id="delete-ask">{t.deleteAsk}</p>
                  <div class="actions">
                    <button type="button" onClick={() => setConfirmRemove(false)}>
                      {t.keepSlot}
                    </button>
                    <button
                      type="button"
                      class={slotOp === "remove" ? "danger working" : "danger"}
                      disabled={slotOp !== null}
                      onClick={() => void removeDraft()}
                    >
                      {slotOpSlow && slotOp === "remove" && <span class="spin" aria-hidden="true" />}
                      {t.deleteSlot}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        )}
        {draft && gapEdit && (
          <>
            <div
              class="scrim gap-scrim"
              onClick={() => {
                dismissTip();
                setGapEdit(null);
                setGapError(null);
              }}
            />
            <div class="add-form gap-form" role="dialog" aria-labelledby="gap-title" aria-modal="true">
              <header>
                <b id="gap-title">{t.playlistGapTitle}</b>
              </header>
              <p class="mode-note">{t.playlistGapNote}</p>
              <label class="custom">
                <input
                  ref={gapInputRef}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={gapEdit.minutes}
                  placeholder="5"
                  aria-label={t.playlistGapTitle}
                  onInput={(event) => {
                    setGapEdit({ ...gapEdit, minutes: (event.target as HTMLInputElement).value });
                    setGapError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveGap();
                    }
                  }}
                />
                <em>{t.minutesUnit}</em>
              </label>
              {gapError && <p class="field-error">{t.error(gapError)}</p>}
              <div class="actions">
                <button
                  type="button"
                  class="cancel"
                  onClick={() => {
                    setGapEdit(null);
                    setGapError(null);
                  }}
                >
                  {t.cancel}
                </button>
                {editingGapSet && (
                  <button type="button" class="quiet" onClick={clearGap}>
                    {t.remove}
                  </button>
                )}
                <button type="button" class="primary" onClick={saveGap}>
                  {editingGapSet ? t.save : t.add}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {saved && !draft && <p class="muted">{t.saved}</p>}
    </section>
  );
}
