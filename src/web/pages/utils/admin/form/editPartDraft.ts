import type { Draft } from "../../../../types/Draft.ts";

export function editPartDraft(current: Draft, step: "how" | "when" | "what" | "name"): Draft {
  return { ...current, formStep: step, returnTo: "summary", addPhase: "list" };
}
