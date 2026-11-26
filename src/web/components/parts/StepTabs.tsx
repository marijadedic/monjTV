import { FORM_STEPS } from "../../constants/formSteps.ts";
import { useI18n } from "../../i18n.tsx";
import type { FormStep } from "../../types/FormStep.ts";

export function StepTabs({
  step,
  onJump,
}: {
  step: FormStep;
  onJump: (step: "how" | "when" | "what") => void;
}) {
  const { t } = useI18n();
  const label = { how: t.stepHow, when: t.stepWhen, what: t.stepWhat };
  return (
    <div class="step-tabs" role="tablist">
      {FORM_STEPS.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={step === item}
          class={step === item ? "on" : ""}
          onClick={() => onJump(item)}
        >
          {label[item]}
        </button>
      ))}
    </div>
  );
}
