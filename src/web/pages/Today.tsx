import { useEffect, useState } from "preact/hooks";
import type { PlayerStatus, RundownItem, TodayRundown } from "../../shared/types.ts";
import { api } from "../api.ts";

export function Today() {
  const [today, setToday] = useState<TodayRundown | null>(null);
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <section>
      <div class="row">
        <h1>Today {today?.date ? `· ${today.date}` : ""}</h1>
        <button class="primary" onClick={start} disabled={busy === "start"}>
          {status?.running ? "Play now" : "Start TV"}
        </button>
      </div>
      {status?.waitingUntil && (
        <p class="muted">Waiting until {status.waitingUntil} for the next block.</p>
      )}
      {status?.error && <p class="error">{status.error}</p>}
      {error && <p class="error">{error}</p>}
      {!today?.items.length && <p class="muted">No blocks for today. Add some in Admin.</p>}
      <div class="list">
        {today?.items.map((item) => (
          <article key={item.id} class={`card ${item.status}`}>
            <div class="time">
              {item.start}–{item.end}
            </div>
            <div>
              <div class="title">{item.title}</div>
              <div class="muted">
                {item.mode === "next-episode" ? "Next episode" : "Random"} · {item.path}
              </div>
              <div class={`status ${item.status}`}>{item.status}</div>
            </div>
            <div>
              {item.mode === "random-file" &&
                item.status !== "playing" &&
                item.status !== "done" && (
                  <button onClick={() => shuffle(item)} disabled={busy === item.id}>
                    Shuffle
                  </button>
                )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
