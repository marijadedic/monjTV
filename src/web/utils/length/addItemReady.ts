import type { SlotLength } from "../../../shared/types.ts";
import { canonicalPlaylistUrl } from "../../../shared/youtube.ts";
import type { Draft } from "../../types/Draft.ts";
import { addFixedMinutes } from "@utils/length/addFixedMinutes.ts";
import { measureKey } from "@utils/length/measureKey.ts";

export function addItemReady(
  draft: Draft,
  measured: { key: string; length: SlotLength | null; error?: string } | null,
): boolean {
  if (draft.mode !== "playlist" || draft.addPhase !== "source") return false;

  if (draft.addMode === "random-file" && draft.addLengthChoice !== "longest") {
    const folder =
      draft.addSource === "youtube" ? canonicalPlaylistUrl(draft.addFolder) : draft.addFolder.trim();
    return Boolean(folder) && addFixedMinutes(draft) != null;
  }

  if (!measured?.length || measured.error) return false;
  return measured.key === measureKey(draft);
}
