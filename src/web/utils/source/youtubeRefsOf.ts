import {
  canonicalPlaylistUrl,
  parseYoutubeUrl,
} from "../../../shared/youtube.ts";

export function youtubeRefsOf(
  mode: string,
  folder: string,
  file?: string,
): string[] {
  if (mode === "specific-file") {
    const url = parseYoutubeUrl(file ?? "");
    return url ? [url] : [];
  }
  if (mode === "next-episode" || mode === "random-file") {
    const url = canonicalPlaylistUrl(folder);
    return url ? [url] : [];
  }
  return [];
}
