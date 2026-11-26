import type { IntermissionKind } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";
import { youtubeRefsOf } from "@utils/source/youtubeRefsOf.ts";

function addingYoutube(draft: Draft | null): string {
  if (!draft || draft.mode !== "playlist" || draft.addSource !== "youtube") return "";
  if (draft.addMode === "specific-file") return draft.addFile;
  return draft.addFolder;
}

export function draftTitleLines(draft: Draft | null, addKind: IntermissionKind, addDraft: string): string[] {
  return [
    addKind === "youtube" ? addDraft : "",
    draft?.mode === "specific-file" && draft.source === "youtube" ? draft.file : "",
    (draft?.mode === "next-episode" || draft?.mode === "random-file") && draft.source === "youtube"
      ? draft.folder
      : "",
    addingYoutube(draft),
    ...(draft?.items ?? []).flatMap((item) => youtubeRefsOf(item.mode, item.folder, item.file)),
  ].filter(Boolean);
}
