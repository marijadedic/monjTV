import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { Day } from "../shared/types.ts";

export type Lang = "en" | "hr";

const STORAGE_KEY = "monjtv-lang";

type Copy = {
  sections: string;
  tv: string;
  today: string;
  yesterday: string;
  tomorrow: string;
  days: string;
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
  noSlotsDay: string;
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
  markDone: string;
  markDoneLabel: string;
  markSkipped: string;
  markSkippedLabel: string;
  itemOptions: string;
  previousEpisode: string;
  nextEpisodeButton: string;
  previousEpisodeLabel: string;
  nextEpisodeLabel: string;
  markDoneEpisode: string;
  markDoneEpisodeAired: string;
  markDoneMovie: string;
  markDoneMovieAired: string;
  markSkippedEpisode: string;
  markSkippedMovie: string;
  shuffleHint: string;
  playNow: string;
  startTv: string;
  options: string;
  recentPlayed: string;
  recentHint: string;
  recentEmpty: string;
  recentOrder: string;
  close: string;
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
  videoDuration: string;
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
  youtubePlaylist: string;
  choosePlaylist: string;
  youtubePlaylistPlaceholder: string;
  youtubePlaylistNote: string;
  youtubeRandomNote: string;
  playlist: string;
  playlistHint: string;
  playlistName: string;
  playlistNamePlaceholder: string;
  playlistStack: string;
  addToPlaylist: string;
  playlistEmpty: string;
  playlistGapAdd: string;
  playlistGapTip: string;
  playlistGapTitle: string;
  playlistGapNote: string;
  playlistGapLine: (mins: number) => string;
  playlistRandomHint: string;
  playlistNextHint: string;
  playlistRandomCap: string;
  moveUp: string;
  moveDown: string;
  chooseYoutube: string;
  youtubePlaceholder: string;
  youtubeCaveat: string;
  youtubeProbeCache: string;
  youtubeIntermission: string;
  video: string;
  videoPlaceholder: string;
  alsoOn: string;
  playHow: string;
  stepHow: string;
  stepWhen: string;
  stepWhat: string;
  back: string;
  next: string;
  startsMark: string;
  endsMark: string;
  prevAt: string;
  laterAt: string;
  videoCount: (count: number) => string;
  playlistLongestHint: string;
  ifEmpty: string;
  intermission: string;
  intermissionCut: string;
  intermissionPlaceholder: string;
  intermissionFrom: string;
  intermissionYoutubeInFolder: string;
  intermissionEmpty: string;
  intermissionPick: string;
  intermissionRandom: string;
  intermissionRandomHint: string;
  none: string;
  change: string;
  deleteAsk: string;
  keepSlot: string;
  deleteSlot: string;
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
  slotWouldEnd: string;
  prevSlotEnds: string;
  nextSlotBegins: string;
  noSlotsAfter: string;
  onlySlot: string;
  overlaps: string;
  calculating: string;
  measuring: string;
  followsVideo: string;
  until: (time: string) => string;
  noVideo: string;
};

const en: Copy = {
  sections: "Sections",
  tv: "TV schedule",
  today: "Today",
  yesterday: "Yesterday",
  tomorrow: "Tomorrow",
  days: "Days",
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
  noSlotsDay: "No slots queued.",
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
  markDone: "Mark as done",
  markDoneLabel: "Mark as done",
  markSkipped: "Mark as skipped",
  markSkippedLabel: "Mark as skipped",
  itemOptions: "Options",
  previousEpisode: "Previous",
  nextEpisodeButton: "Next",
  previousEpisodeLabel: "Previous episode",
  nextEpisodeLabel: "Next episode",
  markDoneEpisode: "Marks it watched and plays the next episode in this slot.",
  markDoneEpisodeAired: "Marks it watched. Later airings move on.",
  markDoneMovie: "Marks it watched and picks another movie for this slot.",
  markDoneMovieAired: "Marks it watched.",
  markSkippedEpisode: "Puts this episode back for the next airing.",
  markSkippedMovie: "Takes this movie off recently played.",
  shuffleHint: "Picks another movie for this slot. This one is not marked watched.",
  playNow: "Play now",
  startTv: "Start TV",
  options: "Options",
  recentPlayed: "Recently played",
  recentHint: "Random slots leave these out until the other files have played. Remove one to let it be picked again.",
  recentEmpty: "No videos are on this list.",
  recentOrder: "Most recent first",
  close: "Close",
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
  videoDuration: "Video duration",
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
  findLongest: "Find the longest running video in the folder or playlist",
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
  randomHint: "Picks a folder, or a YouTube playlist. Each file plays once before it comes around again.",
  nextHint: "Walks a folder in order, or a YouTube playlist.",
  oneVideo: "One video",
  oneHint: "Plays one file, or one YouTube video.",
  youtube: "YouTube",
  playlist: "Playlist",
  playlistHint:
    "Videos play one after another. A plus between them can add minutes of intermission. The slot lasts as long as the files that air that day.",
  playlistName: "Name on the schedule",
  playlistNamePlaceholder: "Saturday night",
  playlistStack: "Videos in this slot",
  addToPlaylist: "Add a video",
  playlistEmpty: "Add videos to this playlist.",
  playlistGapAdd: "Add intermission between these videos",
  playlistGapTip: "Add minutes of the selected intermission between these two videos.",
  playlistGapTitle: "Intermission between videos",
  playlistGapNote:
    "Plays the selected Intermission for this many minutes, then the next video. A later slot still cuts that file off.",
  playlistGapLine: (mins) => `${mins} min intermission`,
  playlistRandomHint: "Skips a longer file. The file that plays sets the length.",
  playlistLongestHint:
    "The slot uses the file that plays. Until a day picks one, this row has no cap in the total.",
  playlistNextHint: "Walks the folder or YouTube playlist in order. Each airing uses that episode’s length.",
  playlistRandomCap: "Longest file it will pick",
  moveUp: "Move up",
  moveDown: "Move down",
  chooseYoutube: "YouTube URL",
  youtubePlaceholder: "https://www.youtube.com/watch?v=…",
  youtubePlaylist: "YouTube playlist",
  choosePlaylist: "YouTube playlist URL",
  youtubePlaylistPlaceholder: "https://www.youtube.com/playlist?list=…",
  youtubePlaylistNote:
    "Walks the playlist in order, like episodes in a folder. A video that finishes is remembered, so the next airing continues. This needs the internet.",
  youtubeRandomNote:
    "Picks a video that has not played yet this pass, and skips one that does not fit. This needs the internet.",
  youtubeCaveat:
    "Use a finished YouTube video, not a live stream. This needs the internet and will not play as offline TV.",
  youtubeProbeCache:
    "The length comes from yt-dlp. Keep yt-dlp updated; YouTube changes often. This needs the internet.",
  youtubeIntermission:
    "A YouTube video, playlist, or live stream. A link that includes a list plays that playlist in order, then starts again. Playback needs the internet.",
  video: "Video",
  videoPlaceholder: "/path/to/video.mp4",
  alsoOn: "Also play on",
  playHow: "Choose how it plays",
  stepHow: "How",
  stepWhen: "When",
  stepWhat: "What",
  back: "Back",
  next: "Next",
  startsMark: "Starts",
  endsMark: "Ends",
  prevAt: "Prev at",
  laterAt: "Next at",
  videoCount: (count) => (count === 1 ? "1 video" : `${count} videos`),
  ifEmpty: "Plays when nothing is on, and after a slot’s video ends early.",
  intermission: "Intermission",
  intermissionCut: "A new slot cuts it off.",
  intermissionPlaceholder: "/path/to/folder or a YouTube URL",
  intermissionFrom: "Source",
  intermissionYoutubeInFolder: "That is a YouTube link. Choose YouTube, then add it.",
  intermissionEmpty: "Nothing here yet. Add a folder, a video, or a YouTube link.",
  intermissionPick: "The selected one plays.",
  intermissionRandom: "Start at a random point",
  intermissionRandomHint: "Each time an intermission video starts, it opens somewhere in that video.",
  none: "None",
  change: "Change",
  deleteAsk: "Are you sure you want to delete this slot?",
  keepSlot: "Keep",
  deleteSlot: "Delete",
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
  saved: "Saved. The TV schedule was rebuilt.",
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
  slotWouldEnd: "Slot would end at",
  prevSlotEnds: "Previous slot ends at",
  nextSlotBegins: "Next slot begins at",
  noSlotsAfter: "No slots scheduled after this slot",
  onlySlot: "Only slot today",
  overlaps: "Overlaps",
  calculating: "Calculating...",
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
  "Only an episode or a random movie can be marked done":
    "Gotovim se mogu označiti samo epizoda ili nasumični film.",
  "A file that is on the air cannot be marked done":
    "Datoteka koja je na programu ne može se označiti gotovom.",
  "Only a finished episode can be marked skipped":
    "Preskočenom se može označiti samo gotova epizoda.",
  "Only a video that already aired can be marked skipped":
    "Preskočenom se može označiti samo video koji je već bio na programu.",
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
  "mode must be next-episode, random-file, or specific-file":
    "Način mora biti sljedeća epizoda, nasumična datoteka ili jedan video.",
  "mode must be next-episode, random-file, specific-file, or playlist":
    "Način mora biti sljedeća epizoda, nasumična datoteka, jedan video ili popis.",
  "Each playlist needs a name": "Popis treba ime.",
  "Each playlist needs at least one video": "Popis treba barem jedan video.",
  "playlist items must be next-episode, random-file, or specific-file":
    "Stavke popisa moraju biti sljedeća epizoda, nasumična datoteka ili jedan video.",
  "Type a YouTube playlist URL.": "Upišite URL YouTube popisa.",
  "Invalid playlist item": "Neispravna stavka popisa.",
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

  match = /^Overlapping (?:slots|blocks) on (\w+): (.+)$/.exec(message);
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
  tv: "TV raspored",
  today: "Danas",
  yesterday: "Jučer",
  tomorrow: "Sutra",
  days: "Dani",
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
  noSlotsDay: "Nema blokova.",
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
  markDone: "Označi kao gotovo",
  markDoneLabel: "Označi kao gotovo",
  markSkipped: "Označi kao preskočeno",
  markSkippedLabel: "Označi kao preskočeno",
  itemOptions: "Mogućnosti",
  previousEpisode: "Prethodna",
  nextEpisodeButton: "Sljedeća",
  previousEpisodeLabel: "Prethodna epizoda",
  nextEpisodeLabel: "Sljedeća epizoda",
  markDoneEpisode: "Označuje gledanim i u ovom terminu pušta sljedeću epizodu.",
  markDoneEpisodeAired: "Označuje gledanim. Sljedeća prikazivanja idu dalje.",
  markDoneMovie: "Označuje gledanim i za ovaj termin bira drugi film.",
  markDoneMovieAired: "Označuje gledanim.",
  markSkippedEpisode: "Ova epizoda ostaje za sljedeće prikazivanje.",
  markSkippedMovie: "Miče ovaj film iz nedavno puštenih.",
  shuffleHint: "Bira drugi film za ovaj termin. Ovaj se ne označuje gledanim.",
  playNow: "Pusti sada",
  startTv: "Pokreni TV",
  options: "Opcije",
  recentPlayed: "Nedavno pušteno",
  recentHint: "Nasumični blokovi ih preskaču dok ostale datoteke ne dođu na red. Uklonite jednu da se može opet odabrati.",
  recentEmpty: "Na ovom popisu nema videa.",
  recentOrder: "Najnovije prvo",
  close: "Zatvori",
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
  videoDuration: "Trajanje videa",
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
  findLongest: "Pronađi najdulji video u mapi ili na popisu",
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
  randomHint: "Bira mapu ili YouTube popis. Svaka datoteka ide jednom prije nego što opet dođe na red.",
  nextHint: "Ide redom kroz mapu ili YouTube popis.",
  oneVideo: "Jedan video",
  oneHint: "Pušta jednu datoteku ili jedan YouTube video.",
  youtube: "YouTube",
  playlist: "Popis",
  playlistHint:
    "Pušta videe redom. Plus između njih može dodati minute pauze. Blok traje koliko videi koji se tog dana puštaju.",
  playlistName: "Ime na rasporedu",
  playlistNamePlaceholder: "Subotnja večer",
  playlistStack: "Videi u ovom bloku",
  addToPlaylist: "Dodaj video",
  playlistEmpty: "Dodajte videe na ovaj popis.",
  playlistGapAdd: "Dodaj pauzu između ovih videa",
  playlistGapTip: "Dodaje minute odabrane pauze između ova dva videa.",
  playlistGapTitle: "Pauza između videa",
  playlistGapNote:
    "Pušta odabranu pauzu ovoliko minuta, zatim sljedeći video. Kasniji blok i dalje prekida tu datoteku.",
  playlistGapLine: (mins) => `${mins} min pauze`,
  playlistRandomHint: "Preskače dulji video. Trajanje bloka je video koji ide.",
  playlistLongestHint:
    "Blok traje koliko video koji ide. Dok dan ne odabere video, ovaj red nema granicu u zbroju.",
  playlistNextHint: "Ide redom kroz mapu ili YouTube popis. Svako puštanje traje koliko ta epizoda.",
  playlistRandomCap: "Najdulji video koji smije ići",
  moveUp: "Gore",
  moveDown: "Dolje",
  chooseYoutube: "YouTube URL",
  youtubePlaceholder: "https://www.youtube.com/watch?v=…",
  youtubePlaylist: "YouTube popis",
  choosePlaylist: "URL YouTube popisa",
  youtubePlaylistPlaceholder: "https://www.youtube.com/playlist?list=…",
  youtubePlaylistNote:
    "Ide redom kroz popis, kao epizode u mapi. Video koji završi se pamti, pa sljedeće puštanje nastavlja. Treba internet.",
  youtubeRandomNote:
    "Bira video koji još nije išao u ovom krugu i preskače onaj koji ne stane. Treba internet.",
  youtubeCaveat:
    "Stavite gotov YouTube video, ne prijenos uživo. Treba internet i neće raditi kao televizija bez mreže.",
  youtubeProbeCache:
    "Trajanje dolazi iz yt-dlp. Održavajte yt-dlp ažurnim; YouTube se često mijenja. Treba internet.",
  youtubeIntermission:
    "YouTube video, popis ili prijenos uživo. Poveznica s popisom pušta taj popis redom, pa kreće ispočetka. Reprodukcija treba internet.",
  video: "Video",
  videoPlaceholder: "/putanja/do/videa.mp4",
  alsoOn: "Pusti i na",
  playHow: "Odaberi kako se pušta",
  stepHow: "Kako",
  stepWhen: "Kada",
  stepWhat: "Što",
  back: "Natrag",
  next: "Dalje",
  startsMark: "Počinje",
  endsMark: "Završava",
  prevAt: "Prije u",
  laterAt: "Dalje u",
  videoCount: (count) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} video`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} videa`;
    return `${count} videa`;
  },
  ifEmpty: "Reproducira se kad ništa nije na rasporedu, i kad video u bloku završi ranije.",
  intermission: "Pauza",
  intermissionCut: "Novi blok prekida reprodukciju.",
  intermissionPlaceholder: "/putanja/do/mape ili YouTube URL",
  intermissionFrom: "Izvor",
  intermissionYoutubeInFolder: "To je YouTube poveznica. Odaberite YouTube, pa dodajte.",
  intermissionEmpty: "Još nema ničega. Dodajte mapu, video ili YouTube poveznicu.",
  intermissionPick: "Pušta se odabrano.",
  intermissionRandom: "Kreni na nasumičnom mjestu",
  intermissionRandomHint: "Svaki put kad video pauze krene, otvara se negdje u tom videu.",
  none: "nije odabrano",
  change: "Promijeni",
  deleteAsk: "Jeste li sigurni da želite obrisati ovaj termin?",
  keepSlot: "Zadrži",
  deleteSlot: "Obriši",
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
  saved: "Spremljeno. TV raspored je ponovno složen.",
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
  slotWouldEnd: "Blok bi završio u",
  prevSlotEnds: "Prethodni blok završava u",
  nextSlotBegins: "Sljedeći blok počinje u",
  noSlotsAfter: "Nema zakazanih blokova nakon ovog bloka",
  onlySlot: "Jedini blok danas",
  overlaps: "Preklapa se",
  calculating: "Računanje...",
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
