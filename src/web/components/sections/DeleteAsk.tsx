import "./styles/DeleteAsk.css";
import { useI18n } from "../../i18n.tsx";
import { ActionButton } from "../buttons/ActionButton.tsx";

export function DeleteAsk({
  working,
  busy,
  disabled,
  onKeep,
  onDelete,
}: {
  working: boolean;
  busy: boolean;
  disabled: boolean;
  onKeep: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      class="ask"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-ask"
    >
      <div class="ask-card">
        <p id="delete-ask">{t.deleteAsk}</p>
        <div class="actions">
          <button type="button" onClick={onKeep}>
            {t.keepSlot}
          </button>
          <ActionButton
            className="danger"
            working={working}
            busy={busy}
            disabled={disabled}
            onClick={onDelete}
          >
            {t.deleteSlot}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
