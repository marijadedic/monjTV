import type { RecentPlays } from "../../../shared/types.ts";

export function playedPaths(recent: RecentPlays): Set<string> {
  const paths = new Set<string>();
  for (const folder of recent.folders) {
    for (const video of folder.videos) paths.add(video.path);
  }
  return paths;
}
