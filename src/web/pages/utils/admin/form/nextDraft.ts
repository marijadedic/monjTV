import type { Draft } from "../../../../types/Draft.ts";

export function nextDraft(current: Draft): Draft {
  return current.formStep === "when" ? { ...current, formStep: "what" } : current;
}
