import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { Day } from "../shared/types.ts";

export type Lang = "en" | "hr";

const STORAGE_KEY = "monjtv-lang";

type Copy = {
  sections: string;
  today: string;
  admin: string;
  theme: string;
  dark: string;
  grove: string;
  light: string;
  language: string;
  english: string;
  croatian: string;
  todayTitle: (date: string) => string;
  noBlocks: string;
  addInAdmin: string;
  onAir: string;
  waiting: string;
  nextAt: (time: string) => string;
  nothingOn: string;
  progress: string;
  minLeft: (n: number) => string;
  nextEpisode: string;
  random: string;
  planned: string;
  playing: string;
  done: string;
  skipped: string;
  shuffle: string;
  playNow: string;
  startTv: string;
  weekly: string;
  addBlock: string;
  save: string;
  saved: string;
  start: string;
  end: string;
  mode: string;
  randomFile: string;
  folderPlaceholder: string;
  choosing: string;
  browse: string;
  remove: string;
  day: Record<Day, string>;
  error: (message: string) => string;
};

const en: Copy = {
  sections: "Sections",
  today: "Today",
  admin: "Admin",
  theme: "Theme",
  dark: "Dark",
  grove: "Grove",
  light: "Light",
  language: "Language",
  english: "English",
  croatian: "Croatian",
  todayTitle: (date) => (date ? `Today · ${date}` : "Today"),
  noBlocks: "No blocks for today.",
  addInAdmin: "Add some in Admin",
  onAir: "On air",
  waiting: "Waiting",
  nextAt: (time) => `Next block at ${time}`,
  nothingOn: "Nothing is on right now.",
  progress: "Time through the current show",
  minLeft: (n) => `${n} min left`,
  nextEpisode: "Next episode",
  random: "Random",
  planned: "Planned",
  playing: "Playing",
  done: "Done",
  skipped: "Skipped",
  shuffle: "Shuffle",
  playNow: "Play now",
  startTv: "Start TV",
  weekly: "Weekly grid",
  addBlock: "Add block",
  save: "Save",
  saved: "Saved. Today’s rundown rebuilt.",
  start: "Start",
  end: "End",
  mode: "Mode",
  randomFile: "Random file",
  folderPlaceholder: "/path/to/folder",
  choosing: "Choosing…",
  browse: "Browse",
  remove: "Remove",
  day: { mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun" },
  error: (message) => message,
};

const hrDay: Record<Day, string> = {
  mon: "pon",
  tue: "uto",
  wed: "sri",
  thu: "čet",
  fri: "pet",
  sat: "sub",
  sun: "ned",
};

const hrExact: Record<string, string> = {
  "The folder picker is only available on macOS.": "Odabir mape dostupan je samo na macOS-u.",
  "Item not found": "Stavka nije pronađena.",
  "Only random items can be shuffled": "Promiješati se mogu samo nasumične stavke.",
  "Cannot shuffle a playing or finished item": "Stavka koja svira ili je gotova ne može se promiješati.",
  "Block missing from schedule": "Blok nedostaje u rasporedu.",
  "No other files in this folder": "U ovoj mapi nema drugih datoteka.",
  "Schedule must have a blocks array": "Raspored mora sadržavati blokove.",
  "Invalid block": "Neispravan blok.",
  "Each block needs at least one day": "Svaki blok treba barem jedan dan.",
  "start and end must be HH:mm": "Početak i kraj moraju biti u obliku HH:mm.",
  "mode must be next-episode or random-file": "Način mora biti sljedeća epizoda ili nasumična datoteka.",
  "Each block needs a folder": "Svaki blok treba mapu.",
  "mpv is not installed or not on PATH": "mpv nije instaliran ili nije na PATH-u.",
  "mpv is not running": "mpv nije pokrenut.",
};

function hrError(message: string): string {
  const exact = hrExact[message];
  if (exact) return exact;

  let match = /^Cannot read folder: (.+)$/.exec(message);
  if (match) return `Mapa se ne može pročitati: ${match[1]}`;

  match = /^Folder does not exist: (.+)$/.exec(message);
  if (match) return `Mapa ne postoji: ${match[1]}`;

  match = /^Block (.+) must end after it starts \(same day\)$/.exec(message);
  if (match) return `Blok ${match[1]} mora završiti nakon početka (isti dan).`;

  match = /^Overlapping blocks on (\w+): (.+)$/.exec(message);
  if (match) {
    const day = match[1] as Day;
    const label = hrDay[day] ?? match[1];
    return `Blokovi se preklapaju (${label}): ${match[2]}`;
  }

  match = /^Invalid time: (.+)$/.exec(message);
  if (match) return `Neispravno vrijeme: ${match[1]}`;

  return message;
}

const hr: Copy = {
  sections: "Odjeljci",
  today: "Danas",
  admin: "Admin",
  theme: "Tema",
  dark: "Tamno",
  grove: "Gaj",
  light: "Svijetlo",
  language: "Jezik",
  english: "English",
  croatian: "Hrvatski",
  todayTitle: (date) => (date ? `Danas · ${date}` : "Danas"),
  noBlocks: "Nema blokova za danas.",
  addInAdmin: "Dodaj ih u Adminu",
  onAir: "U eteru",
  waiting: "Čeka",
  nextAt: (time) => `Sljedeći blok u ${time}`,
  nothingOn: "Trenutno se ništa ne emitira.",
  progress: "Proteklo vrijeme trenutne emisije",
  minLeft: (n) => `još ${n} min`,
  nextEpisode: "Sljedeća epizoda",
  random: "Nasumično",
  planned: "Planirano",
  playing: "Svira",
  done: "Gotovo",
  skipped: "Preskočeno",
  shuffle: "Promiješaj",
  playNow: "Pusti sada",
  startTv: "Pokreni TV",
  weekly: "Tjedni raspored",
  addBlock: "Dodaj blok",
  save: "Spremi",
  saved: "Spremljeno. Današnji raspored je obnovljen.",
  start: "Početak",
  end: "Kraj",
  mode: "Način",
  randomFile: "Nasumična datoteka",
  folderPlaceholder: "/putanja/do/mape",
  choosing: "Odabir…",
  browse: "Odaberi",
  remove: "Ukloni",
  day: hrDay,
  error: hrError,
};

const copy: Record<Lang, Copy> = { en, hr };

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Copy;
};

const I18nContext = createContext<I18nValue | null>(null);

export function readLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "hr") return stored;
  } catch {
    /* private mode */
  }
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("hr")) {
    return "hr";
  }
  return "en";
}

export function I18nProvider({ children }: { children: ComponentChildren }) {
  const [lang, setLang] = useState<Lang>(readLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* private mode */
    }
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t: copy[lang] }}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
