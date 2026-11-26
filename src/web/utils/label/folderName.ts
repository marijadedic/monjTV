import { folderLabel } from "./folderLabel.ts";
import { parentDir } from "../source/parentDir.ts";

export function folderName(filePath: string): string {
  const parent = parentDir(filePath);
  if (!parent) return filePath;
  const name = folderLabel(parent);
  return name || filePath;
}
