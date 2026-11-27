import type { SlotLength } from "../../../shared/types.ts";
import type { Draft } from "../../types/Draft.ts";
import { fixedMinutes } from "@utils/length/fixedMinutes.ts";
import { measureKey } from "@utils/length/measureKey.ts";
import { stackSeconds } from "@utils/length/stackSeconds.ts";

export function chosenSeconds(
  draft: Draft,
  measured: { key: string; length: SlotLength | null } | null,
): number | null {
  if (draft.mode === "playlist") return stackSeconds(draft.items);
  if (draft.lengthChoice !== "longest") {
    const mins = fixedMinutes(draft);
    return mins ? mins * 60 : null;
  }
  if (!measured || measured.key !== measureKey(draft) || !measured.length)
    return null;
  return measured.length.durationSec;
}
