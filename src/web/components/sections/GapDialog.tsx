import type { Ref } from "preact";
import { useI18n } from "../../i18n.tsx";
import { FieldNote } from "../parts/FieldNote.tsx";
import { Scrim } from "../parts/Scrim.tsx";

export function GapDialog({
  minutes,
  error,
  editing,
  inputRef,
  onMinutes,
  onSave,
  onDismiss,
  onCancel,
  onClear,
}: {
  minutes: string;
  error: string | null;
  editing: boolean;
  inputRef: Ref<HTMLInputElement>;
  onMinutes: (value: string) => void;
  onSave: () => void;
  onDismiss: () => void;
  onCancel: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <Scrim className="scrim gap-scrim" onClose={onDismiss} />
      <div class="add-form gap-form" role="dialog" aria-labelledby="gap-title" aria-modal="true">
        <header>
          <b id="gap-title">{t.playlistGapTitle}</b>
        </header>
        <p class="mode-note">{t.playlistGapNote}</p>
        <label class="custom">
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={minutes}
            placeholder="5"
            aria-label={t.playlistGapTitle}
            onInput={(event) => onMinutes((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSave();
              }
            }}
          />
          <em>{t.minutesUnit}</em>
        </label>
        {error && <FieldNote>{error}</FieldNote>}
        <div class="actions">
          <button type="button" class="cancel" onClick={onCancel}>
            {t.cancel}
          </button>
          {editing && (
            <button type="button" class="quiet" onClick={onClear}>
              {t.remove}
            </button>
          )}
          <button type="button" class="primary" onClick={onSave}>
            {editing ? t.save : t.add}
          </button>
        </div>
      </div>
    </>
  );
}
