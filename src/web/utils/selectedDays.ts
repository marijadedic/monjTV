import { DAYS, type Day } from "../../shared/types.ts";
import type { Draft } from "../types/Draft.ts";

export function selectedDays(draft: Draft): Day[] {
  return [draft.origin, ...DAYS.filter((day) => day !== draft.origin && draft.days.includes(day))];
}
