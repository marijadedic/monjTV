import type { SlotLength } from "../../../shared/types.ts";
import type { Draft } from "../../types/Draft.ts";
import { pathChosen } from "@utils/source/pathChosen.ts";
import { fixedMinutes } from "@utils/length/fixedMinutes.ts";
import { measureKey } from "@utils/length/measureKey.ts";
import { stackItemNeedsProbe } from "@utils/length/stackItemNeedsProbe.ts";

export function saveBlocked(
  draft: Draft,
  measured: { key: string; length: SlotLength | null; error?: string } | null,
  measuring: boolean,
  sourceMissing: boolean,
): boolean {
  if (draft.mode === "playlist") {
    const probing = draft.items.some(stackItemNeedsProbe);
    const broken = draft.items.some((item) => Boolean(item.error));
    return !draft.name.trim() || draft.items.length === 0 || probing || broken;
  }

  if (sourceMissing || !pathChosen(draft)) return true;
  if (draft.lengthChoice !== "longest") return fixedMinutes(draft) === null;

  const matched = measured?.key === measureKey(draft) ? measured : null;
  return measuring || !matched?.length || Boolean(matched?.error);
}
