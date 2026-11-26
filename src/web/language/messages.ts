import type { Day } from "../../shared/types.ts";

export type ClockParts = {
  both: string;
  hours: string;
  minutes: string;
};

export type RunParts = {
  h: string;
  m: string;
  s: string;
  zero: string;
};

export type CountParts = {
  one: string;
  few: string;
  many: string;
};

export type ErrorPattern = {
  re: string;
  text: string;
  kind?: string;
};

export type ErrorBook = {
  exact: Record<string, string>;
  patterns: ErrorPattern[];
};

export type Messages = {
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
  nextAt: string;
  nothingOn: string;
  willStart: string;
  nextMark: string;
  startsAt: string;
  scheduled: string;
  willNotStart: string;
  missedStart: string;
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
  lengthOf: ClockParts;
  chooseFolder: string;
  chooseVideo: string;
  slotDuration: string;
  videoDuration: string;
  slotDurationOf: ClockParts;
  longestVideo: string;
  shortestVideo: string;
  fixedLength: string;
  standardSlot: string;
  longestFile: string;
  findLongest: string;
  chooseLength: string;
  customLength: string;
  minutes: string;
  minutesUnit: string;
  durationTip: Record<"30" | "60" | "90" | "120" | "260" | "custom", string>;
  aboutLength: string;
  measuringVideos: string;
  elapsed: string;
  whySlow: string;
  probeCache: string;
  manyFiles: string;
  needMinutes: string;
  newSlot: string;
  editSlot: string;
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
  playlistGapLine: string;
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
  videoCount: CountParts;
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
  runLength: RunParts;
  wontFitVideo: string;
  wontFitEpisode: string;
  wontFitFolder: string;
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
  until: string;
  sliceUntil: string;
  sliceContinues: string;
  sliceEnds: string;
  sliceFrom: string;
  fromDayUntil: string;
  startedDay: string;
  noVideo: string;
  errors: ErrorBook;
};

type PhraseKey =
  | "nextAt"
  | "startsAt"
  | "missedStart"
  | "lengthOf"
  | "slotDurationOf"
  | "minutes"
  | "aboutLength"
  | "elapsed"
  | "newSlot"
  | "editSlot"
  | "playlistGapLine"
  | "videoCount"
  | "runLength"
  | "wontFitVideo"
  | "wontFitEpisode"
  | "wontFitFolder"
  | "until"
  | "sliceUntil"
  | "sliceContinues"
  | "sliceEnds"
  | "sliceFrom"
  | "fromDayUntil"
  | "startedDay"
  | "errors";

export type Copy = Omit<Messages, PhraseKey> & {
  nextAt: (time: string) => string;
  startsAt: (title: string, time: string) => string;
  missedStart: (title: string, end: string) => string;
  lengthOf: (mins: number) => string;
  slotDurationOf: (mins: number) => string;
  minutes: (n: number) => string;
  aboutLength: (label: string) => string;
  elapsed: (clock: string) => string;
  newSlot: (day: string) => string;
  editSlot: (day: string) => string;
  playlistGapLine: (mins: number) => string;
  videoCount: (count: number) => string;
  runLength: (sec: number) => string;
  wontFitVideo: (title: string, length: string, limit: string) => string;
  wontFitEpisode: (title: string, length: string, limit: string) => string;
  wontFitFolder: (title: string, length: string, limit: string) => string;
  until: (time: string) => string;
  sliceUntil: (time: string) => string;
  sliceContinues: (day: string) => string;
  sliceEnds: (time: string) => string;
  sliceFrom: (time: string) => string;
  fromDayUntil: (day: string, time: string) => string;
  startedDay: (day: string) => string;
  error: (message: string) => string;
};
