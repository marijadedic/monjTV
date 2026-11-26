import type { ComponentChildren } from "preact";
import { Spinner } from "./Spinner.tsx";

export function MeasureWait({ label, note }: { label: ComponentChildren; note?: string }) {
  return (
    <div class="wait">
      <div class="wait-line">
        <Spinner />
        {label}
      </div>
      {note ? <p class="slow">{note}</p> : null}
    </div>
  );
}
