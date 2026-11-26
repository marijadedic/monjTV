import type { ComponentChildren } from "preact";
import { hideCloud, placeCloud } from "../../utils/tip/cloud.ts";

export function CloudHost({ children }: { children: ComponentChildren }) {
  return (
    <span class="cloud-host" onMouseEnter={placeCloud} onMouseLeave={hideCloud}>
      {children}
    </span>
  );
}
