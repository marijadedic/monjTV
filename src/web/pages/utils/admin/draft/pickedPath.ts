import type { Draft } from "../../../../types/Draft.ts";
import { parentDir } from "@utils/source/parentDir.ts";

export function pickedPath(current: Draft, chosen: string): Draft {
  if (current.mode === "playlist") {
    if (current.addMode === "specific-file") {
      return { ...current, addFile: chosen, addFolder: parentDir(chosen) };
    }
    return { ...current, addFolder: chosen };
  }
  if (current.mode === "specific-file") {
    return { ...current, file: chosen, folder: parentDir(chosen) };
  }
  return { ...current, folder: chosen };
}
