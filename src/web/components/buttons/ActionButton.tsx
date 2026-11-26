import type { ComponentChildren } from "preact";
import { Spinner } from "../parts/Spinner.tsx";

export function ActionButton({
  className,
  working,
  busy,
  disabled,
  type = "button",
  onClick,
  children,
}: {
  className: string;
  working?: boolean;
  busy?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  children: ComponentChildren;
}) {
  return (
    <button
      type={type}
      class={working ? `${className} working` : className}
      disabled={disabled}
      onClick={onClick}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}
