import type { ComponentChildren } from "preact";

export function CloseButton({
  label,
  title,
  disabled,
  children = "×",
  onClick,
}: {
  label: string;
  title?: string;
  disabled?: boolean;
  children?: ComponentChildren;
  onClick: () => void;
}) {
  return (
    <button type="button" class="x" aria-label={label} title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
