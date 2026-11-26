import type { PlayerStatus } from "../../../shared/types.ts";
import { parseYoutubeUrl } from "../../../shared/youtube.ts";

export function gapStillFile(gapTitle: string | null, status: PlayerStatus | null): string | null {
  if (!gapTitle || !status) return null;
  if (status.fallbackPath) return status.fallbackPath;
  if (status.intermissionKind === "video") return status.intermissionSource;
  if (status.intermissionKind === "youtube") return parseYoutubeUrl(status.intermissionSource ?? "");
  return null;
}
