import { modeClass } from "./modeClass.ts";
import type { BlockMode } from "../../../shared/types.ts";

export function blockClass(mode: BlockMode): string {
  if (mode === "playlist") return "stack";
  return modeClass(mode);
}
