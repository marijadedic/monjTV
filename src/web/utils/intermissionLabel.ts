import type { IntermissionItem } from "../../shared/types.ts";
import { canonicalYoutubeIntermission, youtubeLabel } from "../../shared/youtube.ts";
import { fileTitle } from "./fileTitle.ts";
import { folderLabel } from "./folderLabel.ts";

export function intermissionLabel(item: IntermissionItem, titles: Readonly<Record<string, string>> = {}): string {
  if (item.kind === "youtube") {
    const url = canonicalYoutubeIntermission(item.source);
    if (url && titles[url]) return titles[url];
    return youtubeLabel(item.source);
  }
  if (item.kind === "video") return fileTitle(item.source);
  return folderLabel(item.source);
}
