import type { ComponentChildren } from "preact";
import { useI18n } from "../../i18n.tsx";
import { ModeOption } from "./ModeOption.tsx";

export function LengthMode({
  legend,
  fixedOn,
  longestOn,
  longestHint,
  info,
  onFixed,
  onLongest,
}: {
  legend: string;
  fixedOn: boolean;
  longestOn: boolean;
  longestHint?: string;
  info?: ComponentChildren;
  onFixed: () => void;
  onLongest: () => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset class="source">
      <legend class="k">{legend}</legend>
      <div class="source-grid" role="radiogroup" aria-label={legend}>
        <ModeOption
          pressed={fixedOn}
          title={t.fixedLength}
          hint={t.standardSlot}
          onPick={onFixed}
        />
        <ModeOption
          pressed={longestOn}
          title={t.longestFile}
          hint={longestHint}
          onPick={onLongest}
        />
        {info}
      </div>
    </fieldset>
  );
}
