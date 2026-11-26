import type { IntermissionKind } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";
import { youtubeRefsOf } from "../../../../utils/source/youtubeRefsOf.ts";

export function draftTitleLines(draft: Draft | null, addKind: IntermissionKind, addDraft: string): string[] {
  return [
    addKind === "youtube" ? addDraft : "",
    draft?.mode === "specific-file" && draft.source === "youtube" ? draft.file : "",
    (draft?.mode === "next-episode" || draft?.mode === "random-file") && draft.source === "youtube"
      ? draft.folder
      : "",
    draft?.mode === "playlist" && draft.addSource === "youtube"
      ? draft.addMode === "specific-file"
        ? draft.addFile
        : draft.addFolder
      : "",
    ...(draft?.items ?? []).flatMap((item) => youtubeRefsOf(item.mode, item.folder, item.file)),
  ].filter(Boolean);
}
