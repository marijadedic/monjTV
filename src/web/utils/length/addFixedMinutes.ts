import { minutesOfChoice } from "./minutesOfChoice.ts";
import type { Draft } from "../../types/Draft.ts";

export function addFixedMinutes(draft: Draft): number | null {
  return minutesOfChoice(draft.addLengthChoice, draft.addCustomMin);
}
