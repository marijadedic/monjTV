import "./styles/FieldNote.css";
import type { ComponentChildren, Ref } from "preact";

export function FieldNote({
  children,
  alert,
  nodeRef,
}: {
  children: ComponentChildren;
  alert?: boolean;
  nodeRef?: Ref<HTMLParagraphElement>;
}) {
  return (
    <p class="field-error" ref={nodeRef} role={alert ? "alert" : undefined}>
      {children}
    </p>
  );
}
