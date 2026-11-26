import type { Draft } from "../../../../types/Draft.ts";

export function keepPartDraft(current: Draft): Draft {
  return { ...current, formStep: "summary", returnTo: null, addPhase: "list" };
}
