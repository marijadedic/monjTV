import { useEffect, useState } from "preact/hooks";
import { dateOffset, weekdayOfKey } from "../../shared/dates.ts";
import type { ItemStatus, PlayerStatus, RundownItem, TvBoard } from "../../shared/types.ts";
import { itemCoversNow, itemHasPassed, itemProgress, itemStartsLater, secondsOf } from "../../shared/window.ts";
import { canonicalYoutubeIntermission, youtubeId } from "../../shared/youtube.ts";
import { api } from "../api.ts";
import { pageHref } from "../href.ts";
import { useI18n } from "../i18n.tsx";

function showsFrame(mode: RundownItem["mode"]): boolean {
  return mode === "next-episode" || mode === "random-file" || mode === "specific-file";
}

function stillSrc(item: RundownItem): string {
  return `/api/tv/items/${encodeURIComponent(item.id)}/still?file=${encodeURIComponent(item.path)}`;
}

function gapStillSrc(filePath: string): string {
  return `/api/player/intermission-still?file=${encodeURIComponent(filePath)}`;
}

function folderName(filePath: string): string {
  const parts = filePath.split(/[/\\]/).filter(Boolean);
  if (parts.length < 2) return filePath;
  return parts[parts.length - 2]!;
}

function nowSec(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function onNowPlanned(items: RundownItem[], sec: number): RundownItem | null {
  let chosen: RundownItem | null = null;
  for (const item of items) {
    if (item.status !== "planned" || !itemCoversNow(item, sec)) continue;
    if (!chosen || secondsOf(item.start) >= secondsOf(chosen.start)) chosen = item;
  }
  return chosen;
}

function nextPlanned(items: RundownItem[], sec: number): RundownItem | null {
  let chosen: RundownItem | null = null;
  let chosenStart = Infinity;
  for (const item of items) {
    if (!itemStartsLater(item, sec)) continue;
    const start = secondsOf(item.start);
    if (start < chosenStart) {
      chosen = item;
      chosenStart = start;
    }
  }
  return chosen;
}

function canStepEpisode(item: RundownItem, passed: boolean): boolean {
  return item.mode === "next-episode" && !passed;
}

function heldItem(items: RundownItem[], sec: number): RundownItem | null {
  let winner: RundownItem | null = null;
  for (const item of items) {
    if (item.status !== "planned" || !itemCoversNow(item, sec)) continue;
    if (!winner || secondsOf(item.start) >= secondsOf(winner.start)) winner = item;
  }
  for (const item of items) {
    if (item.status !== "planned" || !itemCoversNow(item, sec)) continue;
    if (winner && item.id !== winner.id) return item;
  }
  return null;
}

export function TvSchedule() {
  const { t } = useI18n();
  const pill: Record<ItemStatus, string> = {
    planned: t.planned,
    playing: t.onAir,
    done: t.done,
    skipped: t.skipped,
  };
  const [board, setBoard] = useState<TvBoard | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [missed, setMissed] = useState<Record<string, true>>({});
  const [watchTitle, setWatchTitle] = useState<string | null>(null);

  async function refresh() {
    const [nextBoard, nextStatus] = await Promise.all([api.tv(), api.status()]);
    setBoard(nextBoard);
    setStatus(nextStatus);
  }

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

  const items = day?.items ?? [];
  const current = live ? (items.find((item) => item.id === status?.currentItemId) ?? null) : null;
  const sec = nowSec(now);
  const next = live ? nextPlanned(items, sec) : null;
  const due = live && !current && !status?.fallbackTitle ? onNowPlanned(items, sec) : null;
  const held = live && !current ? heldItem(items, sec) : null;
  const liveFiller = live && !current && status?.fallbackTitle ? status.fallbackTitle : null;
  const namedLive = liveFiller && !liveFiller.startsWith("YouTube · ") ? liveFiller : null;
  const fillerName = live ? watchTitle || status?.intermissionTitle || null : null;
  const gapTitle = namedLive || (!current && !due ? fillerName : null) || liveFiller;
  const gapFile =
    gapTitle && status?.fallbackPath
      ? status.fallbackPath
      : gapTitle && status?.intermissionKind === "video"
        ? status.intermissionSource
        : null;
  const gapPath = gapFile && !missed[gapFile] ? gapFile : null;
  const watchId =
    gapTitle && !gapPath && status?.intermissionKind === "youtube" && status.intermissionSource
      ? youtubeId(status.intermissionSource)
      : null;
  const watchStill = watchId && !missed[watchId] ? watchId : null;
  const air = current ?? due;
  const stripStill = air && showsFrame(air.mode) && !missed[air.path] ? air : null;

  function hideStill(filePath: string) {
    setMissed((currentMissed) => ({ ...currentMissed, [filePath]: true }));
  }
  const fraction = air ? itemProgress(air, sec) : 0;
  const modeLabel = (mode: RundownItem["mode"]) => {
    if (mode === "next-episode") return t.nextEpisode;
    if (mode === "specific-file") return t.oneVideo;
    if (mode === "youtube") return t.youtube;
    return t.random;
  };

  function sourceLabel(item: RundownItem): string {
    if (item.mode === "youtube") return t.youtube;
    return folderName(item.path);
  }

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
  const episodeItem = current?.mode === "next-episode" ? current : due?.mode === "next-episode" ? due : null;

  function episodeButtons(item: RundownItem) {
    const pending = busy === `${item.id}:prev` || busy === `${item.id}:next`;
    return (
      <div class="episode-step">
        <button onClick={() => step(item, "prev")} disabled={pending} aria-label={t.previousEpisodeLabel}>
          {t.previousEpisode}
        </button>
        <button onClick={() => step(item, "next")} disabled={pending} aria-label={t.nextEpisodeLabel}>
          {t.nextEpisodeButton}
        </button>
      </div>
    );
  }

  const rail =
    day && items.length > 0 ? (
      <div class="rail">
        {items.map((item) => {
          const passed = past || (live && itemHasPassed(item, sec));
          const shown: ItemStatus = past ? (item.mode === "next-episode" ? "skipped" : "done") : item.status;
          const canEdit = !past && (live || !item.overnight);
          const cardStill = showsFrame(item.mode) && !missed[item.path];
          const airing = Boolean(live && air?.id === item.id);
          const coming = Boolean(live && gapTitle && next?.id === item.id);
          const wontStart = Boolean(live && held?.id === item.id);
          return (
            <div key={item.id} class={`rail-item ${shown}${airing ? " playing" : ""}${passed ? " passed" : ""}`}>
              <i class="dot" />
              <article class={`card ${shown}${airing ? " playing" : ""}${passed ? " passed" : ""}${cardStill ? " has-still" : ""}`}>
                {cardStill && (
                  <img
                    key={item.path}
                    class="still"
                    src={stillSrc(item)}
                    alt=""
                    onError={() => hideStill(item.path)}
                  />
                )}
                <div class="time">
                  {item.start}–{item.end}
                </div>
                <div>
                  <div class="title-row">
                    {coming && <span class="next-plain">{t.nextMark}</span>}
                    <div class="title">{item.title}</div>
                    {airing && <span class="pill on-air">{t.onAir}</span>}
                    {shown !== "planned" && shown !== "playing" && !airing && (
                      <span class={`pill ${shown}`}>{pill[shown]}</span>
                    )}
                  </div>
                  <div class="muted" title={item.path}>
                    {modeLabel(item.mode)} · {sourceLabel(item)}
                    {wontStart ? ` · ${t.willNotStart}` : ""}
                  </div>
                  {canEdit && canStepEpisode(item, passed) && episodeButtons(item)}
                </div>
                {canEdit && item.mode === "random-file" && !airing && !passed && (
                  <div>
                    <button onClick={() => shuffle(item)} disabled={busy === item.id}>
                      {t.shuffle}
                    </button>
                  </div>
                )}
              </article>
            </div>
          );
        })}
      </div>
    ) : null;

  return (
    <section class={`tv${past ? " is-past" : ""}`}>
      {status?.error && <p class="error">{t.error(status.error)}</p>}
      {error && <p class="error">{t.error(error)}</p>}
      {board && (
        <div class="day-tabs" role="tablist" aria-label={t.days}>
          {board.days.map((entry) => {
            const on = entry.date === day?.date;
            const offset = dateOffset(board.today, entry.date);
            return (
              <button
                key={entry.date}
                type="button"
                role="tab"
                id={`day-${entry.date}`}
                aria-selected={on}
                aria-controls="tv-day"
                class={`${on ? "on" : ""}${offset < 0 ? " past" : ""}`}
                onClick={() => setSelected(entry.date)}
              >
                {tabLabel(entry.date)}
              </button>
            );
          })}
        </div>
      )}
      {day && items.length === 0 && !gapTitle && (
        <div class="empty" id="tv-day" role="tabpanel">
          <p>{live ? t.noSlots : t.noSlotsDay}</p>
          <a href={pageHref("/admin")}>{t.addInAdmin}</a>
        </div>
      )}
      {live && showColumn && day && (
        <div id="tv-day" role="tabpanel" aria-labelledby={`day-${day.date}`}>
          <div class={`now-strip${stripStill || gapPath || watchStill ? " has-still" : ""}`}>
            {stripStill && (
              <img
                key={stripStill.path}
                class="still"
                src={stillSrc(stripStill)}
                alt=""
                onError={() => hideStill(stripStill.path)}
              />
            )}
            {gapPath && (
              <img
                key={gapPath}
                class="still"
                src={gapStillSrc(gapPath)}
                alt=""
                onError={() => hideStill(gapPath)}
              />
            )}
            {watchStill && (
              <img
                key={watchStill}
                class="still"
                src={`https://i.ytimg.com/vi/${watchStill}/hqdefault.jpg`}
                alt=""
                onError={() => hideStill(watchStill)}
              />
            )}
            <div>
              {air ? (
                <>
                  <span class="pill on-air">{t.onAir}</span>
                  <h2 class="strip-title">{air.title}</h2>
                  <div class="muted" title={air.path}>
                    {air.start}–{air.end} · {modeLabel(air.mode)} · {sourceLabel(air)}
                  </div>
                  <div
                    class="track"
                    role="progressbar"
                    aria-valuenow={Math.round(fraction * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t.progress}
                  >
                    <i style={{ width: `${fraction * 100}%` }} />
                  </div>
                </>
              ) : gapTitle ? (
                <>
                  <span class="pill gap">{t.intermission}</span>
                  <h2 class="strip-title">{gapTitle}</h2>
                  {next && (
                    <p class="will-line">
                      <span class="next-plain">{t.nextMark}</span>
                      <b>
                        {next.title} · {next.start}
                      </b>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h2 class="strip-title">{t.nothingOn}</h2>
                  {next ? (
                    <div class="muted">{t.startsAt(next.title, next.start)}</div>
                  ) : (
                    status?.waitingUntil && <div class="muted">{t.nextAt(status.waitingUntil)}</div>
                  )}
                </>
              )}
            </div>
            <div class="now-actions">
              {episodeItem && episodeButtons(episodeItem)}
              <button class="primary" onClick={start} disabled={busy === "start"}>
                {status?.running ? t.playNow : t.startTv}
              </button>
            </div>
          </div>
          {rail && (
            <>
              <hr class="tv-break" />
              {rail}
            </>
          )}
        </div>
      )}
      {!live && rail && (
        <div id="tv-day" role="tabpanel" aria-labelledby={day ? `day-${day.date}` : undefined}>
          {rail}
        </div>
      )}
    </section>
  );
}
