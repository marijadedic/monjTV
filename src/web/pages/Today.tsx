import { useEffect, useState } from "preact/hooks";
import type { ItemStatus, PlayerStatus, RundownItem, TodayRundown } from "../../shared/types.ts";
import { api } from "../api.ts";
import { useI18n } from "../i18n.tsx";

function folderName(filePath: string): string {
  const parts = filePath.split(/[/\\]/).filter(Boolean);
  if (parts.length < 2) return filePath;
  return parts[parts.length - 2]!;
}

function hmToSec(hm: string): number | null {
  const [hRaw, mRaw] = hm.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 3600 + m * 60;
}

function nowSec(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function progressOf(item: RundownItem, sec: number): number {
  const start = hmToSec(item.start);
  const end = hmToSec(item.end);
  if (start == null || end == null || end <= start) return 0;
  return Math.min(1, Math.max(0, (sec - start) / (end - start)));
}

function minutesLeft(item: RundownItem, sec: number): number {
  const end = hmToSec(item.end);
  if (end == null) return 0;
  return Math.max(0, Math.ceil((end - sec) / 60));
}

export function Today() {
  const { t } = useI18n();
  const pill: Record<ItemStatus, string> = {
    planned: t.planned,
    playing: t.playing,
    done: t.done,
    skipped: t.skipped,
  };
  const [today, setToday] = useState<TodayRundown | null>(null);
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  async function refresh() {
    const [t, s] = await Promise.all([api.today(), api.status()]);
    setToday(t);
    setStatus(s);
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

  const current = today?.items.find((item) => item.id === status?.currentItemId) ?? null;
  const sec = nowSec(now);
  const fraction = current ? progressOf(current, sec) : 0;
  const modeLabel = (mode: RundownItem["mode"]) =>
    mode === "next-episode" ? t.nextEpisode : t.random;

  return (
    <section>
      <h1>{t.todayTitle(today?.date ?? "")}</h1>
      {status?.error && <p class="error">{t.error(status.error)}</p>}
      {error && <p class="error">{t.error(error)}</p>}
      {today && today.items.length === 0 && (
        <div class="empty">
          <p>{t.noBlocks}</p>
          <a href="/admin">{t.addInAdmin}</a>
        </div>
      )}
      {today && today.items.length > 0 && (
        <>
          <div class="now-strip">
            <div>
              {current ? (
                <>
                  <span class="pill playing">{t.onAir}</span>
                  <h2 class="strip-title">{current.title}</h2>
                  <div class="muted" title={current.path}>
                    {current.start}–{current.end} · {modeLabel(current.mode)} · {folderName(current.path)}
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
                  <div class="muted">{t.minLeft(minutesLeft(current, sec))}</div>
                </>
              ) : status?.waitingUntil ? (
                <>
                  <span class="pill">{t.waiting}</span>
                  <h2 class="strip-title">{t.nextAt(status.waitingUntil)}</h2>
                </>
              ) : (
                <>
                  <span class="pill">{t.today}</span>
                  <h2 class="strip-title">{today.items[0] ? today.items[0].title : t.today}</h2>
                  <div class="muted">{t.nothingOn}</div>
                </>
              )}
            </div>
            <button class="primary" onClick={start} disabled={busy === "start"}>
              {status?.running ? t.playNow : t.startTv}
            </button>
          </div>
          <div class="list">
            {today.items.map((item) => (
              <article key={item.id} class={`card ${item.status}`}>
                <div class="time">
                  {item.start}–{item.end}
                </div>
                <div>
                  <div class="title-row">
                    <div class="title">{item.title}</div>
                    <span class={`pill ${item.status}`}>{pill[item.status]}</span>
                  </div>
                  <div class="muted" title={item.path}>
                    {modeLabel(item.mode)} · {folderName(item.path)}
                  </div>
                </div>
                <div>
                  {item.mode === "random-file" &&
                    item.status !== "playing" &&
                    item.status !== "done" && (
                      <button onClick={() => shuffle(item)} disabled={busy === item.id}>
                        {t.shuffle}
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
