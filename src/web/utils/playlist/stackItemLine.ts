import { modeLabel } from "@utils/label/modeLabel.ts";
import { stackItemNeedsProbe } from "@utils/length/stackItemNeedsProbe.ts";
import type { DraftItem } from "../../types/DraftItem.ts";
import type { useI18n } from "../../i18n.tsx";

export function stackItemLine(
  item: DraftItem,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const kind = modeLabel(item.mode, t);
  if (item.durationSec != null) {
    return `${kind} · ${t.slotDurationOf(Math.max(1, Math.ceil(item.durationSec / 60)))}`;
  }
  if (item.error) return `${kind} · ${t.error(item.error)}`;
  if (stackItemNeedsProbe(item)) return `${kind} · ${t.measuring}`;
  if (item.mode === "random-file" && item.lengthMin) return `${kind} · ${t.minutes(item.lengthMin)}`;
  return kind;
}
