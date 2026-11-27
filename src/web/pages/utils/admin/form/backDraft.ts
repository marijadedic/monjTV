import type { Draft } from "../../../../types/Draft.ts";

export function backDraft(current: Draft): Draft {
  if (current.addPhase === "source") return { ...current, addPhase: "kind" };
  if (current.addPhase === "kind") return { ...current, addPhase: "list" };
  if (current.returnTo === "summary")
    return { ...current, formStep: "summary", returnTo: null };
  if (current.formStep === "what") return { ...current, formStep: "when" };
  if (current.formStep === "when") return { ...current, formStep: "how" };
  return current;
}
