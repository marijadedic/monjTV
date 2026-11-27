import "./styles/tv-schedule/schedule.css";
import "./styles/tv-schedule/type.css";
import { useEffect, useState } from "preact/hooks";
import { dateOffset, weekdayOfKey } from "../../shared/dates.ts";
import type { PlayerStatus, RundownItem, TvBoard } from "../../shared/types.ts";
import { itemProgress, prevDay } from "../../shared/window.ts";
import { canonicalYoutubeIntermission } from "../../shared/youtube.ts";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";
import { DayTabs, EmptyDay } from "../components/sections/DayTabs.tsx";
import { NowStrip } from "../components/sections/NowStrip.tsx";
import { ErrorNote } from "../components/parts/ErrorNote.tsx";
import { Rail, RailCard } from "../components/sections/Rail.tsx";
import { carryGroups } from "@utils/rundown/carryGroups.ts";
import { heldItem } from "@utils/rundown/heldItem.ts";
import { nextPlanned } from "@utils/rundown/nextPlanned.ts";
import { nowSec } from "@utils/clock/nowSec.ts";
import { onNowPlanned } from "@utils/rundown/onNowPlanned.ts";
import { gapStillFile } from "@utils/rundown/gapStillFile.ts";
import { playedPaths } from "@utils/rundown/playedPaths.ts";

export function TvSchedule() {
  const { t } = useI18n();
  const [board, setBoard] = useState<TvBoard | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [missed, setMissed] = useState<Record<string, true>>({});
  const [watchTitle, setWatchTitle] = useState<string | null>(null);
  const [played, setPlayed] = useState<ReadonlySet<string>>(() => new Set());
  const [menuKey, setMenuKey] = useState<string | null>(null);

  async function refresh() {
    const [boardResult, statusResult, recentResult] = await Promise.allSettled([
      api.tv(),
      api.status(),
      api.recent(),
    ]);
    if (boardResult.status === "fulfilled") {
      setBoard(boardResult.value);
      setError(null);
    }
    if (statusResult.status === "fulfilled") setStatus(statusResult.value);
    if (recentResult.status === "fulfilled")
      setPlayed(playedPaths(recentResult.value));
    if (boardResult.status === "rejected") throw boardResult.reason;
  }

  useEffect(() => {
    if (!menuKey) return;
    function onPointer(event: Event) {
      const target = event.target;
      if (target instanceof Element && target.closest(".item-menu")) return;
      setMenuKey(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuKey(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuKey]);

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
    const id = setInterval(() => {
      refresh().catch(() => undefined);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (status?.intermissionKind !== "youtube" || !status.intermissionSource) {
      setWatchTitle(null);
      return;
    }
    const url = canonicalYoutubeIntermission(status.intermissionSource);
    if (!url) return;
    let stop = false;
    api
      .youtubeTitles([url])
      .then((body) => {
        if (!stop) setWatchTitle(body.titles[url] || null);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [status?.intermissionKind, status?.intermissionSource]);

  const day = board
    ? (board.days.find((entry) => entry.date === selected) ??
      board.days.find((entry) => entry.date === board.today) ??
      board.days[0] ??
      null)
    : null;
  const live = Boolean(day && board && day.date === board.today);
  const past = Boolean(day && board && day.date < board.today);

  async function start() {
    setBusy("start");
    setError(null);
    try {
      setStatus(await api.startPlayer());
      setBoard(await api.tv());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function shuffle(item: RundownItem) {
    if (!day) return;
    setBusy(item.id);
    setError(null);
    try {
      setBoard(await api.shuffle(day.date, item.id));
      setStatus(await api.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function step(item: RundownItem, direction: "prev" | "next") {
    if (!day) return;
    setBusy(`${item.id}:${direction}`);
    setError(null);
    try {
      setBoard(await api.stepEpisode(day.date, item.id, direction));
      setStatus(await api.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function markDone(item: RundownItem) {
    if (!day) return;
    setBusy(`${item.id}:done`);
    setError(null);
    try {
      setBoard(await api.markDone(day.date, item.id));
      setPlayed(playedPaths(await api.recent()));
      setStatus(await api.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function markSkipped(item: RundownItem) {
    if (!day) return;
    setBusy(`${item.id}:skipped`);
    setError(null);
    try {
      setBoard(await api.markSkipped(day.date, item.id));
      setPlayed(playedPaths(await api.recent()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const items = day?.items ?? [];
  const current = live
    ? (items.find((item) => item.id === status?.currentItemId) ?? null)
    : null;
  const sec = nowSec(now);
  const next = live ? nextPlanned(items, sec) : null;
  const due =
    live && !current && !status?.fallbackTitle
      ? onNowPlanned(items, sec)
      : null;
  const held = live && !current ? heldItem(items, sec) : null;
  const liveFiller =
    live && !current && status?.fallbackTitle ? status.fallbackTitle : null;
  const namedLive =
    liveFiller && !liveFiller.startsWith("YouTube · ") ? liveFiller : null;
  const fillerName = live
    ? watchTitle || status?.intermissionTitle || null
    : null;
  const gapTitle =
    namedLive || (!current && !due ? fillerName : null) || liveFiller;
  const gapFile = gapStillFile(gapTitle, status);
  const air = current ?? due;

  function hideStill(filePath: string) {
    setMissed((currentMissed) => ({ ...currentMissed, [filePath]: true }));
  }
  const fraction = air ? itemProgress(air, sec) : 0;

  function capitalise(label: string): string {
    const first = label.charAt(0).toLocaleUpperCase();
    return first + label.slice(1);
  }

  function tabLabel(date: string): string {
    if (!board) return date;
    const offset = dateOffset(board.today, date);
    if (offset === -1) return t.yesterday;
    if (offset === 0) return t.today;
    if (offset === 1) return t.tomorrow;
    return capitalise(t.day[weekdayOfKey(date)]);
  }

  const showColumn = Boolean(day && (items.length > 0 || gapTitle));

  const fromDay = day ? t.dayName[prevDay(weekdayOfKey(day.date))] : "";
  const carried = past ? [] : carryGroups(items);
  const ownItems = past ? items : items.filter((item) => !item.overnight);
  const actions = {
    played,
    busy,
    menuKey,
    onStep: step,
    onShuffle: shuffle,
    onDone: markDone,
    onSkip: markSkipped,
    onMenu: setMenuKey,
    onHideStill: hideStill,
  };

  function card(item: RundownItem) {
    return (
      <RailCard
        key={item.id}
        item={item}
        past={past}
        live={live}
        sec={sec}
        missed={missed}
        airId={air?.id ?? null}
        gapTitle={gapTitle}
        nextId={next?.id ?? null}
        heldId={held?.id ?? null}
        fromDay={fromDay}
        {...actions}
      />
    );
  }

  const rail =
    day && items.length > 0 ? (
      <Rail
        carried={carried}
        ownItems={ownItems}
        fromDay={fromDay}
        card={card}
      />
    ) : null;

  return (
    <section class={`tv${past ? " is-past" : ""}`}>
      {status?.error && <ErrorNote message={status.error} />}
      {error && <ErrorNote message={error} />}
      {board && (
        <DayTabs
          days={board.days}
          today={board.today}
          selected={day?.date}
          labelFor={tabLabel}
          onSelect={setSelected}
        />
      )}
      {day && items.length === 0 && !gapTitle && <EmptyDay live={live} />}
      {live && showColumn && day && (
        <div id="tv-day" role="tabpanel" aria-labelledby={`day-${day.date}`}>
          <NowStrip
            air={air}
            fraction={fraction}
            gapTitle={gapTitle}
            gapFile={gapFile}
            missed={missed}
            next={next}
            waitingUntil={status?.waitingUntil || null}
            running={Boolean(status?.running)}
            onStart={() => void start()}
            {...actions}
          />
          {rail && (
            <>
              <hr class="tv-break" />
              {rail}
            </>
          )}
        </div>
      )}
      {!live && rail && (
        <div
          id="tv-day"
          role="tabpanel"
          aria-labelledby={day ? `day-${day.date}` : undefined}
        >
          {rail}
        </div>
      )}
    </section>
  );
}
