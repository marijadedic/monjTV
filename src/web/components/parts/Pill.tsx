import type { ComponentChildren } from "preact";

export function Pill({
  tone,
  children,
}: {
  tone: string;
  children: ComponentChildren;
}) {
  return <span class={`pill ${tone}`}>{children}</span>;
}
