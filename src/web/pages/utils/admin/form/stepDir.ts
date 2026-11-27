import { FORM_STEPS } from "../../../../constants/formSteps.ts";
import type { Draft } from "../../../../types/Draft.ts";

export function stepDir(
  draft: Draft,
  step: (typeof FORM_STEPS)[number],
): "slide-next" | "slide-back" | null {
  if (draft.formStep === step && draft.addPhase === "list") return null;
  const from = FORM_STEPS.indexOf(
    draft.formStep === "summary"
      ? "what"
      : (draft.formStep as (typeof FORM_STEPS)[number]),
  );
  return FORM_STEPS.indexOf(step) >= from ? "slide-next" : "slide-back";
}
