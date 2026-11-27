import type { SlotLength } from "../../../shared/types.ts";
import type { Draft } from "../../types/Draft.ts";
import { addFixedMinutes } from "@utils/length/addFixedMinutes.ts";
import { measureKey } from "@utils/length/measureKey.ts";

export function addSeconds(
  draft: Draft,
  measured: { key: string; length: SlotLength | null } | null,
): number | null {
  if (draft.addMode === "random-file" && draft.addLengthChoice !== "longest") {
    const mins = addFixedMinutes(draft);
    return mins ? mins * 60 : null;
  }
  if (measured?.key === measureKey(draft) && measured.length)
    return measured.length.durationSec;
  return null;
}
