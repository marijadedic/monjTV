import { useI18n } from "../../i18n.tsx";

export function PlaylistNameField({
  value,
  invalid,
  onInput,
}: {
  value: string;
  invalid?: boolean;
  onInput: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <label>
      <span class="k">{t.playlistName}</span>
      <input
        value={value}
        placeholder={t.playlistNamePlaceholder}
        aria-invalid={invalid ? "true" : undefined}
        onInput={(event) => onInput((event.target as HTMLInputElement).value)}
      />
    </label>
  );
}
