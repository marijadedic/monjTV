import "./styles/FolderPath.css";
export function YoutubeField({
  value,
  placeholder,
  invalid,
  onChange,
  onEnter,
}: {
  value: string;
  placeholder: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  onEnter?: () => void;
}) {
  return (
    <div class="path-field">
      <div class="field">
        <input
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid ? "true" : undefined}
          onInput={(event) => onChange((event.target as HTMLInputElement).value)}
          onKeyDown={
            onEnter
              ? (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  onEnter();
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
