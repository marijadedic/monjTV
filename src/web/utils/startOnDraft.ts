import type { Day } from "../../shared/types.ts";
import type { Draft } from "../types/Draft.ts";

export function startOnDraft(draft: Draft, day: Day): string {
  if (day === draft.origin) return draft.start;
  return draft.starts[day] ?? draft.start;
}
