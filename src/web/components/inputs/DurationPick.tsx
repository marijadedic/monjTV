import { PRESETS } from "../../constants/presets.ts";
import { useI18n } from "../../i18n.tsx";
import type { LengthChoice } from "../../types/LengthChoice.ts";
import type { PresetMin } from "../../types/PresetMin.ts";
import type { TipKey } from "../../types/TipKey.ts";
import { isPreset } from "@utils/length/isPreset.ts";
import { InfoButton } from "../buttons/InfoButton.tsx";

export function DurationPick({
  lengthChoice,
  customMin,
  lengthCh,
  tip,
  onChoice,
  onCustom,
}: {
  lengthChoice: LengthChoice;
  customMin: string;
  lengthCh: number;
  tip?: string;
  onChoice: (value: PresetMin | "custom") => void;
  onCustom: (value: string) => void;
}) {
  const { t } = useI18n();
  if (lengthChoice === "longest") return null;
  const label =
    lengthChoice === "custom" ? t.customLength : t.minutes(lengthChoice);
  const tipKey: TipKey =
    lengthChoice === "custom" ? "custom" : (`${lengthChoice}` as TipKey);
  return (
    <div class="dur-pick">
      <select
        aria-label={t.chooseLength}
        value={String(lengthChoice)}
        style={{ width: `calc(${lengthCh + 1}ch + 2.2rem)` }}
        onChange={(event) => {
          const value = (event.target as HTMLSelectElement).value;
          if (value === "custom") onChoice("custom");
          else {
            const mins = Number(value);
            if (isPreset(mins)) onChoice(mins);
          }
        }}
      >
        {PRESETS.map((mins) => (
          <option key={mins} value={String(mins)}>
            {t.minutes(mins)}
          </option>
        ))}
        <option value="custom">{t.customLength}</option>
      </select>
      {lengthChoice === "custom" && (
        <label class="custom">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={customMin}
            placeholder="45"
            aria-label={t.customLength}
            onInput={(event) =>
              onCustom((event.target as HTMLInputElement).value)
            }
          />
          <em>{t.minutesUnit}</em>
        </label>
      )}
      <InfoButton
        label={t.aboutLength(label)}
        tip={tip ?? t.durationTip[tipKey]}
      />
    </div>
  );
}
