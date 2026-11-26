import type { BlockMode } from "../../../shared/types.ts";
import { useI18n } from "../../i18n.tsx";
import { blockClass } from "@utils/label/blockClass.ts";
import { blockLabel } from "@utils/label/blockLabel.ts";
import { ChangeButton } from "../buttons/ChangeButton.tsx";
import { DeleteButton } from "../buttons/DeleteButton.tsx";

export function SlotFormHeader({
  title,
  mode,
  showModeEdit,
  onEditMode,
  onDelete,
}: {
  title: string;
  mode: BlockMode;
  showModeEdit: boolean;
  onEditMode: () => void;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  return (
    <header>
      <b>{title}</b>
      <span class={`mode-pill ${blockClass(mode)}`}>
        {blockLabel(mode, t)}
        {showModeEdit && <ChangeButton label={t.change} onClick={onEditMode} />}
      </span>
      {onDelete && <DeleteButton label={t.deleteSlot} onClick={onDelete} />}
    </header>
  );
}
