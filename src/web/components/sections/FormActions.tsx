import "./styles/FormActions.css";
import { useI18n } from "../../i18n.tsx";
import { ActionButton } from "../buttons/ActionButton.tsx";

export function FormActions({
  busy,
  showCancel,
  showBack,
  showAdd,
  addDisabled,
  showNext,
  nextDisabled,
  showSave,
  existing,
  saveWorking,
  saveBusy,
  saveDisabled,
  showKeep,
  onCancel,
  onBack,
  onAdd,
  onNext,
  onKeep,
}: {
  busy: boolean;
  showCancel: boolean;
  showBack: boolean;
  showAdd: boolean;
  addDisabled: boolean;
  showNext: boolean;
  nextDisabled: boolean;
  showSave: boolean;
  existing: boolean;
  saveWorking: boolean;
  saveBusy: boolean;
  saveDisabled: boolean;
  showKeep: boolean;
  onCancel: () => void;
  onBack: () => void;
  onAdd: () => void;
  onNext: () => void;
  onKeep: () => void;
}) {
  const { t } = useI18n();
  return (
    <div class="actions">
      {showCancel && (
        <button type="button" class="cancel" disabled={busy} onClick={onCancel}>
          {t.cancel}
        </button>
      )}
      {showBack && (
        <button type="button" disabled={busy} onClick={onBack}>
          {t.back}
        </button>
      )}
      {showAdd && (
        <button type="button" class="primary" disabled={addDisabled} onClick={onAdd}>
          {t.add}
        </button>
      )}
      {showNext && (
        <button type="button" class="primary" disabled={nextDisabled} onClick={onNext}>
          {t.next}
        </button>
      )}
      {showSave && (
        <ActionButton
          type="submit"
          className="primary"
          working={saveWorking}
          busy={saveBusy}
          disabled={saveDisabled}
        >
          {existing ? t.save : t.add}
        </ActionButton>
      )}
      {showKeep && (
        <button type="button" class="primary" disabled={busy} onClick={onKeep}>
          {t.save}
        </button>
      )}
    </div>
  );
}
