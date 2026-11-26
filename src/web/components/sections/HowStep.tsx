import type { BlockMode } from "../../../shared/types.ts";
import { CHIP_MODES } from "../../constants/chipModes.ts";
import { useI18n } from "../../i18n.tsx";
import { blockClass } from "../../utils/label/blockClass.ts";
import { blockHint } from "../../utils/label/blockHint.ts";
import { blockLabel } from "../../utils/label/blockLabel.ts";
import { ModeList } from "../inputs/ModeList.tsx";

export function HowStep({ mode, onPick }: { mode: BlockMode; onPick: (mode: BlockMode) => void }) {
  const { t } = useI18n();
  return (
    <div class="pick-mode">
      <ModeList
        label={t.playHow}
        modes={CHIP_MODES}
        selected={mode}
        classFor={blockClass}
        titleFor={(item) => blockLabel(item, t)}
        hintFor={(item) => blockHint(item, t)}
        onPick={onPick}
      />
    </div>
  );
}
