import type { IntermissionKind } from "../../../shared/types.ts";
import { canonicalYoutubeIntermission, isYoutubeLink } from "../../../shared/youtube.ts";

export function pendingSource(
  kind: IntermissionKind,
  value: string,
): { source: string; error: "youtube" | "youtube-in-path" | null } {
  const trimmed = value.trim();
  if (!trimmed) return { source: "", error: null };
  if (kind === "youtube") {
    const parsed = canonicalYoutubeIntermission(trimmed);
    if (!parsed) return { source: trimmed, error: "youtube" };
    return { source: parsed, error: null };
  }
  if (isYoutubeLink(trimmed)) return { source: trimmed, error: "youtube-in-path" };
  return { source: trimmed, error: null };
}
