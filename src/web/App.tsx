import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "./api.ts";
import { GroveFrame } from "./Grove.tsx";
import { pageHref } from "./href.ts";
import { TvSchedule } from "./pages/TvSchedule.tsx";
import { Admin } from "./pages/Admin.tsx";
import { RecentWindow } from "./Recent.tsx";
import { useI18n, type Lang } from "./i18n.tsx";

type Theme = "dark" | "dusk" | "light" | "teletext";

const THEMES: Theme[] = ["dark", "dusk", "light", "teletext"];
const LANGS: Lang[] = ["en", "hr"];

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem("monjtv-theme");
    if (stored === "dark" || stored === "dusk" || stored === "light" || stored === "teletext") return stored;
  } catch {
    /* private mode */
  }
  return "dark";
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getFullYear()}`;
}

function dateStamp(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function App() {
  const { lang, setLang, t } = useI18n();
  const admin = location.pathname.startsWith("/admin");
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [now, setNow] = useState(() => new Date());
  const [off, setOff] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const prefsRef = useRef<HTMLDetailsElement>(null);
  const themeLabel: Record<Theme, string> = {
    dark: t.dark,
    dusk: t.meadow,
    light: t.light,
    teletext: t.teletext,
  };
  const langLabel: Record<Lang, string> = { en: "EN", hr: "HR" };
  const langName: Record<Lang, string> = { en: t.english, hr: t.croatian };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("monjtv-theme", theme);
    } catch {
      /* private mode */
    }
  }, [theme]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  async function shutDown() {
    if (off) return;
    setOff(true);
    try {
      await api.shutdown();
    } catch (err) {
      // The tab may already be gone, or the server may already have exited.
      if (!(err instanceof TypeError)) setOff(false);
    }
  }

  useEffect(() => {
    function closePrefs() {
      const prefs = prefsRef.current;
      if (prefs?.open) prefs.open = false;
    }
    function onPointerDown(event: PointerEvent) {
      const prefs = prefsRef.current;
      if (!prefs?.open) return;
      const target = event.target;
      if (!(target instanceof Node) || prefs.contains(target)) return;
      prefs.open = false;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closePrefs();
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      {theme === "dusk" && <GroveFrame />}
      <div class={admin ? "shell wide" : "shell tv-chrome"}>
        <header class="top">
          <a class="brand" href={pageHref("/")}>
            monjTV
          </a>
          <div class="when">
            <time class="clock" dateTime={formatClock(now)}>
              {formatClock(now)}
            </time>
            <time class="date" dateTime={dateStamp(now)}>
              {formatDate(now)}
            </time>
          </div>
          <details class="prefs" ref={prefsRef}>
            <summary>{t.options}</summary>
            <div class="prefs-body">
              <span class="prefs-label">{t.language}</span>
              <div class="seg lang" role="radiogroup" aria-label={t.language}>
                {LANGS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={lang === id}
                    aria-label={langName[id]}
                    class={lang === id ? "on" : ""}
                    onClick={() => setLang(id)}
                  >
                    {langLabel[id]}
                  </button>
                ))}
              </div>
              <span class="prefs-label">{t.theme}</span>
              <div class="themes" role="radiogroup" aria-label={t.theme}>
                {THEMES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={theme === id}
                    data-choice={id}
                    class={theme === id ? "on" : ""}
                    onClick={() => setTheme(id)}
                  >
                    <span class="swatch" aria-hidden="true" />
                    {themeLabel[id]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                class="prefs-recent"
                onClick={() => {
                  if (prefsRef.current) prefsRef.current.open = false;
                  setRecentOpen(true);
                }}
              >
                {t.recentPlayed}
              </button>
              <button type="button" class="prefs-quit" disabled={off} onClick={() => void shutDown()}>
                {t.shutDown}
              </button>
            </div>
          </details>
        </header>
        <nav class="folders" aria-label={t.sections}>
          <a href={pageHref("/")} class={admin ? "" : "on"} aria-current={admin ? undefined : "page"}>
            {t.tv}
          </a>
          <a href={pageHref("/admin")} class={admin ? "on" : ""} aria-current={admin ? "page" : undefined}>
            {t.admin}
          </a>
        </nav>
        <main>{off ? <p class="empty">{t.off}</p> : admin ? <Admin /> : <TvSchedule />}</main>
      </div>
      {recentOpen && <RecentWindow onClose={() => setRecentOpen(false)} />}
    </>
  );
}
