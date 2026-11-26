import type { RundownItem } from "../../../shared/types.ts";
import { isYoutubeUrl } from "../../../shared/youtube.ts";
import type { useI18n } from "../../i18n.tsx";
import { folderName } from "@utils/label/folderName.ts";

export function scheduleSource(item: RundownItem, t: ReturnType<typeof useI18n>["t"]): string {
  if (isYoutubeUrl(item.path)) return t.youtube;
  return folderName(item.path);
}
