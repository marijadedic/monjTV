import { gapFields } from "@utils/playlist/gapFields.ts";
import type { DraftItem } from "../../types/DraftItem.ts";
import type { PlaylistEntry } from "../../../shared/types.ts";

export function fromEntry(item: PlaylistEntry, durationSec: number | null = null, title = ""): DraftItem {
  const lengthMin = item.mode === "random-file" ? item.lengthMin : undefined;
  return {
    id: item.id,
    mode: item.mode,
    folder: item.folder,
    file: item.file ?? "",
    title: item.mode === "random-file" ? "" : title,
    durationSec,
    ...(lengthMin ? { lengthMin } : {}),
    ...gapFields(item),
  };
}
