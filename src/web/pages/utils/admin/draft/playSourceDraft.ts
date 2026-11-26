import { endFromDuration } from "../../../../utils/clock/endFromDuration.ts";
import type { Draft } from "../../../../types/Draft.ts";
import type { PlaySource } from "../../../../types/PlaySource.ts";

export function playSourceDraft(current: Draft | null, source: PlaySource): Draft | null {
  if (!current) return current;
  if (current.mode === "playlist") {
    if (current.addSource === source) return current;
    return { ...current, addSource: source, addFolder: "", addFile: "" };
  }
  if (current.source === source) return current;
  const next: Draft = { ...current, source, folder: "", file: "" };
  if (current.mode === "specific-file" && source === "youtube") {
    return { ...next, lengthChoice: "longest", end: "" };
  }
  if (current.mode === "specific-file" && current.source === "youtube") {
    return { ...next, lengthChoice: 60, end: endFromDuration(current.start, 60 * 60) };
  }
  return next;
}
