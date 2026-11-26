import { modeLabel } from "@utils/label/modeLabel.ts";
import type { BlockMode } from "../../../shared/types.ts";
import type { useI18n } from "../../i18n.tsx";

export function blockLabel(mode: BlockMode, t: ReturnType<typeof useI18n>["t"]): string {
  if (mode === "playlist") return t.playlist;
  return modeLabel(mode, t);
}
