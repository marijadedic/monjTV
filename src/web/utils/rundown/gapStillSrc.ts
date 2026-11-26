export function gapStillSrc(filePath: string): string {
  return `/api/player/intermission-still?v=2&file=${encodeURIComponent(filePath)}`;
}
