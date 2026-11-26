import { folderLabel } from "./folderLabel.ts";

export function fileTitle(file: string): string {
  const base = folderLabel(file);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base;
  return base.slice(0, dot);
}
