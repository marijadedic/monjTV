import type { ItemStatus } from "../../../shared/types.ts";
import type { useI18n } from "../../i18n.tsx";

export function statusPill(status: ItemStatus, t: ReturnType<typeof useI18n>["t"]): string {
  if (status === "playing") return t.onAir;
  if (status === "done") return t.done;
  if (status === "skipped") return t.skipped;
  return t.planned;
}
