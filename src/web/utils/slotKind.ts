import type { BlockMode } from "../../shared/types.ts";
import { folderLabel } from "./folderLabel.ts";

export function slotKind(block: { folder: string; mode: BlockMode }): string {
  if (block.mode === "playlist") return " stack";
  const name = folderLabel(block.folder).toLowerCase();
  if (name === "shows" || block.mode === "next-episode") return " shows";
  if (block.mode === "specific-file") return " film";
  return "";
}
