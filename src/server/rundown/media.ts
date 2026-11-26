// Length and title of a file or a YouTube video.
import { isYoutubeUrl, youtubeLabel } from "../../shared/youtube.ts";
import { probeDuration } from "../files/duration.ts";
import { titleFromPath } from "../files/files.ts";
import { episodePaths } from "../files/picker.ts";
import { cachedYoutubeTitle, probeYoutube } from "../youtube/youtube.ts";

// Length of a local file or a finished YouTube video.
export async function lengthOf(file: string): Promise<number> {
  if (!isYoutubeUrl(file)) return probeDuration(file);
  return (await probeYoutube(file)).durationSec;
}

// Length when the file can be timed. A live or unreadable YouTube video is skipped.
export async function tryLength(file: string): Promise<number | null> {
  try {
    const durationSec = await lengthOf(file);
    return durationSec > 0 ? durationSec : null;
  } catch {
    return null;
  }
}

// Title of a local file, or the cached name of a YouTube video.
export function nameOf(file: string): string {
  if (!isYoutubeUrl(file)) return titleFromPath(file);
  return cachedYoutubeTitle(file) ?? youtubeLabel(file);
}

// Files in a folder, or videos in a playlist. A failed playlist is an empty list.
export async function seriesFiles(folder: string): Promise<string[]> {
  try {
    return await episodePaths(folder);
  } catch {
    return [];
  }
}
