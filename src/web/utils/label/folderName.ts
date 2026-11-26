import { folderLabel } from "@utils/label/folderLabel.ts";
import { parentDir } from "@utils/source/parentDir.ts";

export function folderName(filePath: string): string {
  const parent = parentDir(filePath);
  if (!parent) return filePath;
  const name = folderLabel(parent);
  return name || filePath;
}
