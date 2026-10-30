import { useEffect, useRef, useState } from "preact/hooks";
import type { RecentPlays } from "../shared/types.ts";
import { api } from "./api.ts";
import { useI18n } from "./i18n.tsx";

export function RecentWindow({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [plays, setPlays] = useState<RecentPlays>({ folders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    api
      .recent()
      .then((data) => {
        if (!gone) setPlays(data);
      })
      .catch((err: unknown) => {
        if (!gone) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeRef.current();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  async function forget(folder: string, filePath: string) {
    const key = `${folder}\0${filePath}`;
    if (forgetting) return;
    setForgetting(key);
    setError(null);
    try {
      setPlays(await api.forgetRecent(folder, filePath));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setForgetting(null);
    }
  }

  const empty = !loading && !error && plays.folders.length === 0;

  return (
    <>
      <div class="app-scrim" onClick={onClose} />
      <div class="recent-window" role="dialog" aria-modal="true" aria-labelledby="recent-title">
        <header>
          <div>
            <b id="recent-title">{t.recentPlayed}</b>
            <p>{t.recentHint}</p>
          </div>
          <button type="button" class="x" aria-label={t.close} onClick={onClose}>
            ×
          </button>
        </header>
        {error && <p class="error">{t.error(error)}</p>}
        {loading ? null : empty ? (
          <p class="recent-empty">{t.recentEmpty}</p>
        ) : (
          <div class="recent-folders">
            <p class="recent-order">{t.recentOrder}</p>
            {plays.folders.map((folder) => (
              <section key={folder.folder} class="recent-folder">
                <h2 title={folder.folder}>{folder.name}</h2>
                <ul class="recent-list">
                  {folder.videos.map((video, index) => {
                    const key = `${folder.folder}\0${video.path}`;
                    return (
                      <li key={video.path}>
                        <span class="n">{index + 1}</span>
                        <span class="name" title={video.path}>
                          <b>{video.title}</b>
                          {video.place && <span class="place">{video.place}</span>}
                        </span>
                        <button
                          type="button"
                          class="x"
                          aria-label={t.remove}
                          title={t.remove}
                          disabled={forgetting !== null}
                          onClick={() => void forget(folder.folder, video.path)}
                        >
                          {forgetting === key ? "…" : "×"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
