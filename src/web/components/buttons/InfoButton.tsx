import type { ComponentChildren } from "preact";
import { blurCloud, showCloud } from "../../utils/tip/cloud.ts";
import { CloudHost } from "../parts/CloudHost.tsx";
import { InfoMark } from "../parts/InfoMark.tsx";

export function InfoButton({ label, tip }: { label: string; tip: ComponentChildren }) {
  return (
    <CloudHost>
      <button type="button" class="info" onFocus={showCloud} onBlur={blurCloud} aria-label={label}>
        <InfoMark />
      </button>
      <span class="cloud" role="tooltip">
        {tip}
      </span>
    </CloudHost>
  );
}
