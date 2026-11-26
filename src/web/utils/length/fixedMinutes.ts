import { minutesOfChoice } from "./minutesOfChoice.ts";
import type { Draft } from "../../types/Draft.ts";

export function fixedMinutes(draft: Draft): number | null {
  return minutesOfChoice(draft.lengthChoice, draft.customMin);
}
