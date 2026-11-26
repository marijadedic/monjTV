export function ModeOption({
  pressed,
  className,
  title,
  hint,
  onPick,
}: {
  pressed: boolean;
  className?: string;
  title: string;
  hint?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={pressed}
      class={pressed ? `mode on${className ? ` ${className}` : ""}` : "mode"}
      onClick={onPick}
    >
      <b>{title}</b>
      {hint ? <span>{hint}</span> : null}
    </button>
  );
}
