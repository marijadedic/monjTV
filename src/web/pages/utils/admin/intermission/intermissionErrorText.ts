import type { useI18n } from "../../../../i18n.tsx";

export function intermissionErrorText(error: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (error === "youtube") return t.error("Not a YouTube video or playlist URL");
  if (error === "youtube-in-path") return t.intermissionYoutubeInFolder;
  return t.error(error);
}
