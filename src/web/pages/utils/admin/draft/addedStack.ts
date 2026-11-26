import type { SlotLength } from "../../../../../shared/types.ts";
import { canonicalPlaylistUrl, parseYoutubeUrl } from "../../../../../shared/youtube.ts";
import type { Draft } from "../../../../types/Draft.ts";
import type { DraftItem } from "../../../../types/DraftItem.ts";
import { addFixedMinutes } from "@utils/length/addFixedMinutes.ts";
import { measureKey } from "@utils/length/measureKey.ts";
import { newItemId } from "@utils/playlist/newItemId.ts";
import { parentDir } from "@utils/source/parentDir.ts";

function addedFolder(draft: Draft, file: string): string {
  if (draft.addMode !== "specific-file") return canonicalPlaylistUrl(draft.addFolder) ?? draft.addFolder.trim();
  if (parseYoutubeUrl(file)) return "";
  return parentDir(file);
}

export function addedStack(
  draft: Draft,
  measured: { key: string; length: SlotLength | null } | null,
): Draft | null {
  if (draft.mode !== "playlist") return null;
  const randomFixed = draft.addMode === "random-file" && draft.addLengthChoice !== "longest";
  const mins = randomFixed ? addFixedMinutes(draft) : null;
  if (randomFixed) {
    if (!draft.addFolder.trim() || mins == null) return null;
  } else if (!measured?.length || measured.key !== measureKey(draft)) {
    return null;
  }
  const file =
    draft.addMode === "specific-file" ? (parseYoutubeUrl(draft.addFile) ?? draft.addFile.trim()) : "";
  const folder = addedFolder(draft, file);
  const measuredSec =
    measured?.key === measureKey(draft) && measured.length ? measured.length.durationSec : null;
  const item: DraftItem = {
    id: newItemId(),
    mode: draft.addMode,
    folder,
    file,
    title: draft.addMode === "random-file" ? "" : (measured?.length?.title ?? ""),
    durationSec: measuredSec,
    ...(randomFixed && mins ? { lengthMin: mins } : {}),
  };
  return {
    ...draft,
    items: [...draft.items, item],
    addFolder: "",
    addFile: "",
    addPhase: "list",
  };
}
