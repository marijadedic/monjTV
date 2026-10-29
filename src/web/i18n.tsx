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
  meadow: string;
  light: string;
  teletext: string;
  language: string;
  english: string;
  croatian: string;
  noSlots: string;
  addInAdmin: string;
  onAir: string;
  waiting: string;
  nextAt: (time: string) => string;
  nothingOn: string;
  willStart: string;
  nextMark: string;
  startsAt: (title: string, time: string) => string;
  scheduled: string;
  willNotStart: string;
  missedStart: (title: string, end: string) => string;
  progress: string;
  nextEpisode: string;
  random: string;
  planned: string;
  playing: string;
  done: string;
  skipped: string;
  shuffle: string;
  previousEpisode: string;
  nextEpisodeButton: string;
  previousEpisodeLabel: string;
  nextEpisodeLabel: string;
  playNow: string;
  startTv: string;
  options: string;
  shutDown: string;
  off: string;
  week: string;
  add: string;
  save: string;
  cancel: string;
  moreDays: string;
  hideDays: string;
  length: string;
  lengthOf: (mins: number) => string;
  chooseFolder: string;
  chooseVideo: string;
  slotDuration: string;
  slotDurationOf: (mins: number) => string;
  longestVideo: string;
  shortestVideo: string;
  fixedLength: string;
  standardSlot: string;
  longestFile: string;
  findLongest: string;
  chooseLength: string;
  customLength: string;
  minutes: (n: number) => string;
  minutesUnit: string;
  durationTip: Record<"30" | "60" | "90" | "120" | "260" | "custom", string>;
  aboutLength: (label: string) => string;
  measuringVideos: string;
  elapsed: (clock: string) => string;
  whySlow: string;
  probeCache: string;
  manyFiles: string;
  needMinutes: string;
  newSlot: (day: string) => string;
  editSlot: (day: string) => string;
  folder: string;
  randomHint: string;
  nextHint: string;
  oneVideo: string;
  oneHint: string;
  youtube: string;
  youtubeHint: string;
  chooseYoutube: string;
  youtubePlaceholder: string;
  youtubeCaveat: string;
  youtubeProbeCache: string;
  youtubeIntermission: string;
  video: string;
  videoPlaceholder: string;
  alsoOn: string;
  playHow: string;
  ifEmpty: string;
  intermission: string;
  intermissionCut: string;
  intermissionPlaceholder: string;
  intermissionFrom: string;
  intermissionYoutubeInFolder: string;
  intermissionEmpty: string;
  intermissionPick: string;
  none: string;
  change: string;
  clickFirst: string;
  dayWord: string;
  dayName: Record<Day, string>;
  saved: string;
  start: string;
  end: string;
  mode: string;
  randomFile: string;
  folderPlaceholder: string;
  choosing: string;
  browse: string;
  remove: string;
  sourceMissingFolder: string;
  sourceMissingVideo: string;
  day: Record<Day, string>;
  error: (message: string) => string;
  runLength: (sec: number) => string;
  wontFitVideo: (title: string, length: string, limit: string) => string;
  wontFitEpisode: (title: string, length: string, limit: string) => string;
  wontFitFolder: (title: string, length: string, limit: string) => string;
  startTime: string;
  slotEnds: string;
  prevSlotEnds: string;
  nextSlotBegins: string;
  noSlotsAfter: string;
  onlySlot: string;
  overlaps: string;
  measuring: string;
  followsVideo: string;
  until: (time: string) => string;
  noVideo: string;
};

const en: Copy = {
  sections: "Sections",
  today: "Today",
  admin: "Admin",
  theme: "Theme",
  dark: "Dark",
  meadow: "Meadow",
  light: "Light",
  teletext: "Teletext",
  language: "Language",
  english: "English",
  croatian: "Croatian",
  noSlots: "No slots queued for today.",
  addInAdmin: "Add some in Admin",
  onAir: "On air",
  waiting: "Waiting",
  nextAt: (time) => `Next slot starts at ${time}`,
  nothingOn: "Nothing is on right now.",
  willStart: "Will start",
  nextMark: "Next -",
  startsAt: (title, time) => `${title} starts at ${time}`,
  scheduled: "Scheduled",
  willNotStart: "Will not start",
  missedStart: (title, end) => `${title} is scheduled until ${end}. It will not start.`,
  progress: "Time through the current show",
  nextEpisode: "Next episode",
  random: "Random",
  planned: "Planned",
  playing: "Playing",
  done: "Done",
  skipped: "Skipped",
  shuffle: "Shuffle",
  previousEpisode: "Previous",
  nextEpisodeButton: "Next",
  previousEpisodeLabel: "Previous episode",
  nextEpisodeLabel: "Next episode",
  playNow: "Play now",
  startTv: "Start TV",
  options: "Options",
  shutDown: "Shut down",
  off: "monjTV is off",
  week: "Weekly schedule",
  add: "Add",
  save: "Save",
  cancel: "Cancel",
  moreDays: "More days",
  hideDays: "Hide days",
  length: "Length",
  lengthOf: (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  },
  chooseFolder: "Choose folder",
  chooseVideo: "Choose video",
  slotDuration: "Slot duration",
  slotDurationOf: (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}min`;
    if (h) return `${h}h`;
    return `${m}min`;
  },
  longestVideo: "Longest video",
  shortestVideo: "Shortest video",
  fixedLength: "Fixed length",
  standardSlot: "Standard TV timeslot",
  longestFile: "Longest file",
  findLongest: "Find the longest running video in the folder",
  chooseLength: "Choose slot duration",
  customLength: "Custom",
  minutes: (n) => `${n} min`,
  minutesUnit: "min",
  durationTip: {
    "30": "Sitcom, news bulletin, cartoon.",
    "60": "Drama hour, talk show, documentary.",
    "90": "TV movie, long documentary.",
    "120": "Feature film.",
    "260": "4h 20m. A double feature, a long sports broadcast, or a marathon block.",
    custom: "Any length you type, in minutes.",
  },
  aboutLength: (label) => `What a ${label} slot usually holds`,
  measuringVideos: "Measuring the duration of videos",
  elapsed: (clock) => `Elapsed ${clock}`,
  whySlow: "Why measuring can take a while",
  probeCache:
    "Each file is timed with ffprobe. Lengths already timed in this server run are remembered in memory, so a second open of the same folder is quick. A restart times them again.",
  manyFiles: "This folder has a lot of videos. The first timing can take a while.",
  needMinutes: "Type a length of at least 1 minute.",
  newSlot: (day) => `New slot · ${day}`,
  editSlot: (day) => `Edit slot · ${day}`,
  folder: "Folder",
  randomHint: "Picks a folder. Skips recently played files.",
  nextHint: "Walks the folder in order.",
  oneVideo: "One video",
  oneHint: "Plays a specific file.",
  youtube: "YouTube",
  youtubeHint: "Plays one YouTube video in mpv.",
  chooseYoutube: "YouTube URL",
  youtubePlaceholder: "https://www.youtube.com/watch?v=…",
  youtubeCaveat:
    "Use a finished YouTube video, not a live stream. This needs the internet and will not play as offline TV.",
  youtubeProbeCache:
    "The length comes from yt-dlp. Keep yt-dlp updated; YouTube changes often. This needs the internet.",
  youtubeIntermission:
    "A YouTube video, playlist, or live stream. A playlist plays in order and starts again at the end. Playback needs the internet.",
  video: "Video",
  videoPlaceholder: "/path/to/video.mp4",
  alsoOn: "Also play on",
  playHow: "Select the type of playback",
  ifEmpty: "Plays when nothing is on, and after a slot’s video ends early.",
  intermission: "Intermission",
  intermissionCut: "A new slot cuts it off.",
  intermissionPlaceholder: "/path/to/folder or a YouTube URL",
  intermissionFrom: "Source",
  intermissionYoutubeInFolder: "That is a YouTube link. Choose YouTube, then add it.",
  intermissionEmpty: "Nothing here yet. Add a folder, a video, or a YouTube link.",
  intermissionPick: "The selected one plays.",
  none: "None",
  change: "Change",
  clickFirst: "Click to add the first slot",
  dayWord: "Day",
  dayName: {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  },
  saved: "Saved. Today’s rundown rebuilt.",
  start: "Start",
  end: "End",
  mode: "Mode",
  randomFile: "Random file",
  folderPlaceholder: "/path/to/folder",
  choosing: "Choosing…",
  browse: "Browse",
  remove: "Remove",
  sourceMissingFolder: "This folder was removed from disk. Remove the slot, or choose another folder.",
  sourceMissingVideo: "This video was removed from disk. Remove the slot, or choose another video.",
  day: { mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun" },
  error: (message) => message,
  runLength: (sec) => runLength(sec, false),
  wontFitVideo: (title, length, limit) =>
    `${title} is ${length}. This slot can play up to ${limit}, so it will not play.`,
  wontFitEpisode: (title, length, limit) =>
    `The next episode, ${title}, is ${length}. This slot can play up to ${limit}, so it will not play.`,
  wontFitFolder: (title, length, limit) =>
    `The shortest video, ${title}, is ${length}. This slot can play up to ${limit}, so nothing will play.`,
  startTime: "Start time",
  slotEnds: "Slot ends at",
  prevSlotEnds: "Previous slot ends at",
  nextSlotBegins: "Next slot begins at",
  noSlotsAfter: "No slots scheduled after this slot",
  onlySlot: "Only slot today",
  overlaps: "Overlaps",
  measuring: "Measuring…",
  followsVideo: "Follows the video",
  until: (time) => `Until ${time}`,
  noVideo: "No video found there.",
};

function runLength(sec: number, hr: boolean): string {
  const safe = Math.max(0, Math.round(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const parts: string[] = [];
  if (h) parts.push(hr ? `${h} h` : `${h}h`);
  if (m) parts.push(hr ? `${m} min` : `${m}m`);
  if (s) parts.push(hr ? `${s} s` : `${s}s`);
  if (parts.length === 0) return hr ? "0 min" : "0m";
  return parts.join(" ");
}

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
  "The folder picker is only available on macOS and Linux.":
    "Odabir mape dostupan je samo na macOS-u i Linuxu.",
  "Type the folder path.": "Upišite putanju mape.",
  "Item not found": "Stavka nije pronađena.",
  "Only random items can be shuffled": "Promiješati se mogu samo nasumične stavke.",
  "Cannot shuffle a playing or finished item": "Stavka koja svira ili je gotova ne može se promiješati.",
  "Only next-episode items can change episode": "Epizodu mogu mijenjati samo stavke sljedeće epizode.",
  "Cannot change a finished episode": "Završena epizoda ne može se promijeniti.",
  "No previous episode": "Nema prethodne epizode.",
  "No next episode": "Nema sljedeće epizode.",
  "Episode is no longer in this folder": "Te epizode više nema u mapi.",
  "direction must be prev or next": "Smjer mora biti prethodna ili sljedeća.",
  "Slot missing from schedule": "Blok nedostaje u rasporedu.",
  "No other files in this folder": "U ovoj mapi nema drugih datoteka.",
  "Schedule must have a slot array": "Raspored mora sadržavati blokove.",
  "Invalid slot": "Neispravan blok.",
  "Each slot needs at least one day": "Svaki blok treba barem jedan dan.",
  "start and end must be HH:mm": "Početak i kraj moraju biti u obliku HH:mm.",
  "mode must be next-episode, random-file, specific-file, or youtube":
    "Način mora biti sljedeća epizoda, nasumična datoteka, jedan video ili YouTube.",
  "Each specific-file slot needs a video": "Blok s jednim videom treba odabranu datoteku.",
  "Each YouTube slot needs a YouTube video URL": "YouTube blok treba YouTube URL videa.",
  "Not a YouTube video URL": "To nije YouTube URL videa.",
  "Not a YouTube video or playlist URL": "To nije YouTube video ni popis za reprodukciju.",
  "Not a YouTube playlist URL": "To nije YouTube popis za reprodukciju.",
  "Could not read this YouTube playlist": "Ovaj YouTube popis nije se mogao pročitati.",
  "This YouTube playlist has no videos": "U ovom YouTube popisu nema videa.",
  "Could not play this YouTube playlist": "Ovaj YouTube popis nije se mogao pustiti.",
  "yt-dlp is not installed or not on PATH": "yt-dlp nije instaliran ili nije na PATH-u.",
  "Could not read this YouTube video": "Ovaj YouTube video nije se mogao pročitati.",
  "Could not read this YouTube video's length": "Trajanje ovog YouTube videa nije se moglo pročitati.",
  "Live streams cannot be scheduled. Use a finished YouTube video, or put a live URL in Intermission.":
    "Prijenosi uživo ne idu u raspored. Stavite gotov YouTube video, ili URL uživo u Pauzu.",
  "Each slot needs a folder": "Svaki blok treba mapu.",
  "Type the video path.": "Upišite putanju videa.",
  "The file picker is only available on macOS and Linux.":
    "Odabir datoteke dostupan je samo na macOS-u i Linuxu.",
  "mpv is not installed or not on PATH": "mpv nije instaliran ili nije na PATH-u.",
  "mpv is not running": "mpv nije pokrenut.",
  "Choose a video, folder, or YouTube URL to set the length.":
    "Odaberite video, mapu ili YouTube URL da bi blok dobio trajanje.",
  "Still measuring the video.": "Video se još mjeri.",
  "Block must be shorter than 24 hours": "Blok mora biti kraći od 24 sata.",
  "Invalid intermission": "Neispravna pauza.",
  "That is a YouTube link. Choose YouTube, then add it.":
    "To je YouTube poveznica. Odaberite YouTube, pa dodajte.",
};

function hrError(message: string): string {
  const exact = hrExact[message];
  if (exact) return exact;

  let match = /^Cannot read folder: (.+)$/.exec(message);
  if (match) return `Mapa se ne može pročitati: ${match[1]}`;

  match = /^Folder does not exist: (.+)$/.exec(message);
  if (match) return `Mapa ne postoji: ${match[1]}`;

  match = /^Video does not exist: (.+)$/.exec(message);
  if (match) return `Video ne postoji: ${match[1]}`;

  match = /^Not a video file: (.+)$/.exec(message);
  if (match) return `Nije video datoteka: ${match[1]}`;

  match = /^Could not open a file picker\. Type the video path\.(?: (.+))?$/.exec(message);
  if (match) {
    return `Odabir datoteke nije uspio. Upišite putanju videa.${match[1] ? ` ${match[1]}` : ""}`;
  }

  match = /^Slot (.+) must end after it starts \(same day\)$/.exec(message);
  if (match) return `Blok ${match[1]} mora završiti nakon početka (isti dan).`;

  match = /^Overlapping slots on (\w+): (.+)$/.exec(message);
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
  meadow: "Livada",
  light: "Svijetlo",
  teletext: "Teletekst",
  language: "Jezik",
  english: "English",
  croatian: "Hrvatski",
  noSlots: "Nema blokova za danas.",
  addInAdmin: "Dodaj ih u Adminu",
  onAir: "trenutno se prikazuje",
  waiting: "Čeka",
  nextAt: (time) => `Sljedeći blok počinje u ${time}`,
  nothingOn: "Trenutno se ništa ne emitira.",
  willStart: "Počet će",
  nextMark: "Sljedeće -",
  startsAt: (title, time) => `${title} počinje u ${time}`,
  scheduled: "Na rasporedu",
  willNotStart: "Neće krenuti",
  missedStart: (title, end) => `${title} je na rasporedu do ${end}. Neće krenuti.`,
  progress: "Proteklo vrijeme trenutne emisije",
  nextEpisode: "Sljedeća epizoda",
  random: "Nasumično",
  planned: "Planirano",
  playing: "Svira",
  done: "Gotovo",
  skipped: "Preskočeno",
  shuffle: "Promiješaj",
  previousEpisode: "Prethodna",
  nextEpisodeButton: "Sljedeća",
  previousEpisodeLabel: "Prethodna epizoda",
  nextEpisodeLabel: "Sljedeća epizoda",
  playNow: "Pusti sada",
  startTv: "Pokreni TV",
  options: "Opcije",
  shutDown: "Ugasi monjTV",
  off: "monjTV je ugašen",
  week: "Tjedni raspored",
  add: "Dodaj",
  save: "Spremi",
  cancel: "Odustani",
  moreDays: "Više dana",
  hideDays: "Sakrij dane",
  length: "Trajanje",
  lengthOf: (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  },
  chooseFolder: "Odaberi mapu",
  chooseVideo: "Odaberi video",
  slotDuration: "Trajanje",
  slotDurationOf: (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h} h ${m} min`;
    if (h) return `${h} h`;
    return `${m} min`;
  },
  longestVideo: "Najdulji video",
  shortestVideo: "Najkraći video",
  fixedLength: "Fiksno trajanje",
  standardSlot: "Standardni TV termin",
  longestFile: "Najdulja datoteka",
  findLongest: "Pronađi najdulji video u mapi",
  chooseLength: "Odaberi trajanje bloka",
  customLength: "Proizvoljno",
  minutes: (n) => `${n} min`,
  minutesUnit: "min",
  durationTip: {
    "30": "Sitcom, vijesti, crtić.",
    "60": "Dramska serija, talk show, dokumentarac.",
    "90": "TV film, dulji dokumentarac.",
    "120": "Cjelovečernji film.",
    "260": "4 h 20 min. Dvostruka projekcija, duga sportska emisija ili maraton.",
    custom: "Bilo koje trajanje koje upišete, u minutama.",
  },
  aboutLength: (label) => `Što obično ide u termin od ${label}`,
  measuringVideos: "Mjerenje trajanja videa",
  elapsed: (clock) => `Proteklo ${clock}`,
  whySlow: "Zašto mjerenje može potrajati",
  probeCache:
    "Svaka se datoteka mjeri pomoću ffprobe. Trajanja izmjerena u ovom pokretanju poslužitelja pamte se u memoriji, pa je drugi otvor iste mape brz. Nakon ponovnog pokretanja mjerenje kreće ispočetka.",
  manyFiles: "U ovoj mapi ima puno videa. Prvo mjerenje može potrajati.",
  needMinutes: "Upišite trajanje od barem 1 minute.",
  newSlot: (day) => `Novi blok · ${day}`,
  editSlot: (day) => `Uredi blok · ${day}`,
  folder: "Mapa",
  randomHint: "Bira mapu. Preskače nedavno puštene datoteke.",
  nextHint: "Ide redom kroz mapu.",
  oneVideo: "Jedan video",
  oneHint: "Pušta određenu datoteku.",
  youtube: "YouTube",
  youtubeHint: "Pušta jedan YouTube video u mpv-u.",
  chooseYoutube: "YouTube URL",
  youtubePlaceholder: "https://www.youtube.com/watch?v=…",
  youtubeCaveat:
    "Stavite gotov YouTube video, ne prijenos uživo. Treba internet i neće raditi kao televizija bez mreže.",
  youtubeProbeCache:
    "Trajanje dolazi iz yt-dlp. Održavajte yt-dlp ažurnim; YouTube se često mijenja. Treba internet.",
  youtubeIntermission:
    "YouTube video, popis ili prijenos uživo. Popis ide redom i na kraju kreće ispočetka. Reprodukcija treba internet.",
  video: "Video",
  videoPlaceholder: "/putanja/do/videa.mp4",
  alsoOn: "Pusti i na",
  playHow: "Odaberi tip reprodukcije",
  ifEmpty: "Reproducira se kad ništa nije na rasporedu, i kad video u bloku završi ranije.",
  intermission: "Pauza",
  intermissionCut: "Novi blok prekida reprodukciju.",
  intermissionPlaceholder: "/putanja/do/mape ili YouTube URL",
  intermissionFrom: "Izvor",
  intermissionYoutubeInFolder: "To je YouTube poveznica. Odaberite YouTube, pa dodajte.",
  intermissionEmpty: "Još nema ničega. Dodajte mapu, video ili YouTube poveznicu.",
  intermissionPick: "Pušta se odabrano.",
  none: "nije odabrano",
  change: "Promijeni",
  clickFirst: "Klikni za dodati prvi blok",
  dayWord: "Dan",
  dayName: {
    mon: "Ponedjeljak",
    tue: "Utorak",
    wed: "Srijeda",
    thu: "Četvrtak",
    fri: "Petak",
    sat: "Subota",
    sun: "Nedjelja",
  },
  saved: "Spremljeno. Današnji raspored je obnovljen.",
  start: "Početak",
  end: "Kraj",
  mode: "Način",
  randomFile: "Nasumična datoteka",
  folderPlaceholder: "/putanja/do/mape",
  choosing: "Odabir…",
  browse: "Odaberi",
  remove: "Ukloni",
  sourceMissingFolder: "Ova mapa je uklonjena s diska. Uklonite blok ili odaberite drugu mapu.",
  sourceMissingVideo: "Ovaj video je uklonjen s diska. Uklonite blok ili odaberite drugi video.",
  day: hrDay,
  error: hrError,
  runLength: (sec) => runLength(sec, true),
  wontFitVideo: (title, length, limit) =>
    `${title} traje ${length}. U ovaj blok stane najviše ${limit}, pa se neće pustiti.`,
  wontFitEpisode: (title, length, limit) =>
    `Sljedeća epizoda, ${title}, traje ${length}. U ovaj blok stane najviše ${limit}, pa se neće pustiti.`,
  wontFitFolder: (title, length, limit) =>
    `Najkraći video, ${title}, traje ${length}. U ovaj blok stane najviše ${limit}, pa se ništa neće pustiti.`,
  startTime: "Vrijeme početka",
  slotEnds: "Blok završava u",
  prevSlotEnds: "Prethodni blok završava u",
  nextSlotBegins: "Sljedeći blok počinje u",
  noSlotsAfter: "Nema zakazanih blokova nakon ovog bloka",
  onlySlot: "Jedini blok danas",
  overlaps: "Preklapa se",
  measuring: "Mjerenje…",
  followsVideo: "Slijedi video",
  until: (time) => `Do ${time}`,
  noVideo: "Tamo nema videa.",
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
