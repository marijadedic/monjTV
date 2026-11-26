import { addFixedMinutes } from "@utils/length/addFixedMinutes.ts";
import type { Draft } from "../../types/Draft.ts";

export function addMeasureCap(draft: Draft): number | undefined {
  if (draft.mode !== "playlist" || draft.addMode !== "random-file") return undefined;
  if (draft.addLengthChoice === "longest") return undefined;
  return addFixedMinutes(draft) ?? undefined;
}
