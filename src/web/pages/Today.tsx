import { useEffect, useState } from "preact/hooks";
import type { ItemStatus, PlayerStatus, RundownItem, TodayRundown } from "../../shared/types.ts";
import { itemCoversNow, itemHasPassed, itemProgress, itemStartsLater, secondsOf } from "../../shared/window.ts";
import { api } from "../api.ts";
import { pageHref } from "../href.ts";
import { useI18n } from "../i18n.tsx";

function showsFrame(mode: RundownItem["mode"]): boolean {
  return mode === "next-episode" || mode === "random-file" || mode === "specific-file";
}

function stillSrc(item: RundownItem): string {
  return `/api/today/items/${encodeURIComponent(item.id)}/still?file=${encodeURIComponent(item.path)}`;
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

export function Today() {
  const { t } = useI18n();
  const pill: Record<ItemStatus, string> = {
    planned: t.planned,
    playing: t.onAir,
    done: t.done,
    skipped: t.skipped,
  };
  const [today, setToday] = useState<TodayRundown | null>(null);
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [missed, setMissed] = useState<Record<string, true>>({});

  async function refresh() {
    const [nextToday, nextStatus] = await Promise.all([api.today(), api.status()]);
    setToday(nextToday);
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

  async function start() {
    setBusy("start");
    setError(null);
    try {
      setStatus(await api.startPlayer());
      setToday(await api.today());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function shuffle(item: RundownItem) {
    setBusy(item.id);
    setError(null);
    try {
      setToday(await api.shuffle(item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function step(item: RundownItem, direction: "prev" | "next") {
    setBusy(`${item.id}:${direction}`);
    setError(null);
    try {
      setToday(await api.stepEpisode(item.id, direction));
      setStatus(await api.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const current = today?.items.find((item) => item.id === status?.currentItemId) ?? null;
  const sec = nowSec(now);
  const next = today ? nextPlanned(today.items, sec) : null;
  const due = !current && !status?.fallbackTitle && today ? onNowPlanned(today.items, sec) : null;
  const held = today && !current ? heldItem(today.items, sec) : null;
  const gapTitle = !current && status?.fallbackTitle ? status.fallbackTitle : null;
  const gapPath = gapTitle && status?.fallbackPath && !missed[status.fallbackPath] ? status.fallbackPath : null;
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

  const showColumn = Boolean(today && (today.items.length > 0 || gapTitle));
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

  return (
    <section class="today">
      {status?.error && <p class="error">{t.error(status.error)}</p>}
      {error && <p class="error">{t.error(error)}</p>}
      {today && today.items.length === 0 && !gapTitle && (
        <div class="empty">
          <p>{t.noSlots}</p>
          <a href={pageHref("/admin")}>{t.addInAdmin}</a>
        </div>
      )}
      {showColumn && today && (
        <>
          <div class={`now-strip${stripStill || gapPath ? " has-still" : ""}`}>
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
          {today.items.length > 0 && (
            <>
              <hr class="today-break" />
              <div class="rail">
                {today.items.map((item) => {
                  const passed = itemHasPassed(item, sec);
                  const cardStill = showsFrame(item.mode) && !missed[item.path];
                  const airing = air?.id === item.id;
                  const coming = Boolean(gapTitle && next?.id === item.id);
                  const wontStart = held?.id === item.id;
                  return (
                    <div key={item.id} class={`rail-item ${item.status}${airing ? " playing" : ""}${passed ? " passed" : ""}`}>
                      <i class="dot" />
                      <article class={`card ${item.status}${airing ? " playing" : ""}${passed ? " passed" : ""}${cardStill ? " has-still" : ""}`}>
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
                            {item.status !== "planned" && item.status !== "playing" && !airing && (
                              <span class={`pill ${item.status}`}>{pill[item.status]}</span>
                            )}
                          </div>
                          <div class="muted" title={item.path}>
                            {modeLabel(item.mode)} · {sourceLabel(item)}
                            {wontStart ? ` · ${t.willNotStart}` : ""}
                          </div>
                          {canStepEpisode(item, passed) && episodeButtons(item)}
                        </div>
                        {item.mode === "random-file" && !airing && !passed && (
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
            </>
          )}
        </>
      )}
    </section>
  );
}
