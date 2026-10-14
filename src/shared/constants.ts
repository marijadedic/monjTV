export const PORT = Number(process.env.PORT ?? 3000);
export const GRACE_SEC = 8 * 60;
export const MIN_REMAINING_SEC = 3 * 60;
export const RECENT_RANDOM_LIMIT = 12;
export const VIDEO_EXT = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".webm",
  ".mov",
  ".m4v",
  ".ts",
  ".m2ts",
  ".wmv",
  ".mpg",
  ".mpeg",
]);
