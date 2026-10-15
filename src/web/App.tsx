import { useEffect, useState } from "preact/hooks";
import { GroveFrame } from "./Grove.tsx";
import { Today } from "./pages/Today.tsx";
import { Admin } from "./pages/Admin.tsx";
import { useI18n, type Lang } from "./i18n.tsx";

type Theme = "dark" | "dusk" | "light";

const THEMES: Theme[] = ["dark", "dusk", "light"];
const LANGS: Lang[] = ["en", "hr"];

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem("monjtv-theme");
    if (stored === "dark" || stored === "dusk" || stored === "light") return stored;
  } catch {
    /* private mode */
  }
  return "dark";
}

function formatClock(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function App() {
  const { lang, setLang, t } = useI18n();
  const admin = location.pathname.startsWith("/admin");
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [clock, setClock] = useState(formatClock);
  const themeLabel: Record<Theme, string> = { dark: t.dark, dusk: t.meadow, light: t.light };
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
    const id = setInterval(() => setClock(formatClock()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {theme === "dusk" && <GroveFrame />}
      <div class={admin ? "shell wide" : "shell"}>
        <header class="top">
          <a class="brand" href="/">
            monjTV
          </a>
          <time class="clock" dateTime={clock}>
            {clock}
          </time>
          <details class="prefs">
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
            </div>
          </details>
        </header>
        <nav class="folders" aria-label={t.sections}>
          <a href="/" class={admin ? "" : "on"} aria-current={admin ? undefined : "page"}>
            {t.today}
          </a>
          <a href="/admin" class={admin ? "on" : ""} aria-current={admin ? "page" : undefined}>
            {t.admin}
          </a>
        </nav>
        <main>{admin ? <Admin /> : <Today />}</main>
      </div>
    </>
  );
}
