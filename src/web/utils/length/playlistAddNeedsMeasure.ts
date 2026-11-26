import type { Draft } from "../../types/Draft.ts";

export function playlistAddNeedsMeasure(draft: Draft): boolean {
  return draft.addMode !== "random-file" || draft.addLengthChoice === "longest";
}
