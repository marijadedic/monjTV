import {
  canonicalPlaylistUrl,
  isYoutubeUrl,
  parseYoutubeUrl,
} from "../../../../../shared/youtube.ts";
import type { BlockMode } from "../../../../../shared/types.ts";
import type { Draft } from "../../../../types/Draft.ts";
import type { DraftItem } from "../../../../types/DraftItem.ts";
import { parentDir } from "@utils/source/parentDir.ts";

function folderAfterSpecific(cleared: Draft): string {
  if (
    cleared.mode === "specific-file" &&
    cleared.file &&
    !isYoutubeUrl(cleared.file)
  ) {
    return parentDir(cleared.file) || cleared.folder;
  }
  if (canonicalPlaylistUrl(cleared.folder) || isYoutubeUrl(cleared.file))
    return "";
  return cleared.folder;
}

export function modeDraft(
  current: Draft | null,
  mode: BlockMode,
): Draft | null {
  if (!current) return current;
  const withStep = (next: Draft): Draft =>
    current.returnTo === "summary" ? next : { ...next, formStep: "when" };
  if (current.mode === mode) return withStep(current);
  if (mode === "playlist") {
    return withStep({
      ...current,
      mode,
      source: "path",
      folder: "",
      file: "",
      items: current.mode === "playlist" ? current.items : [],
      addMode: "specific-file",
      addSource: "path",
      addFolder: "",
      addFile: "",
      addLengthChoice: 60,
      addCustomMin: "",
      lengthChoice: "longest",
      end: current.items.length ? current.end : "",
    });
  }
  const cleared =
    current.mode === "playlist"
      ? { ...current, items: [] as DraftItem[], name: current.name }
      : current;
  if (mode === "specific-file") {
    const youtube = parseYoutubeUrl(cleared.file);
    if (youtube) {
      return withStep({
        ...cleared,
        mode,
        source: "youtube",
        file: youtube,
        folder: "",
        lengthChoice: "longest",
        end: "",
      });
    }
    const folder = canonicalPlaylistUrl(cleared.folder)
      ? ""
      : cleared.folder.trim().replace(/[\\/]+$/, "");
    const kept =
      cleared.file &&
      !isYoutubeUrl(cleared.file) &&
      parentDir(cleared.file) === folder;
    return withStep({
      ...cleared,
      mode,
      source: "path",
      folder,
      file: kept ? cleared.file : folder,
    });
  }
  const playlist =
    canonicalPlaylistUrl(cleared.folder) ?? canonicalPlaylistUrl(cleared.file);
  if ((mode === "next-episode" || mode === "random-file") && playlist) {
    const next = {
      ...cleared,
      mode,
      source: "youtube" as const,
      folder: playlist,
      file: "",
    };
    return withStep(
      next.lengthChoice === "longest" ? { ...next, lengthChoice: 60 } : next,
    );
  }
  const folder = folderAfterSpecific(cleared);
  const next = { ...cleared, mode, source: "path" as const, folder, file: "" };
  return withStep(
    mode === "next-episode" && next.lengthChoice === "longest"
      ? { ...next, lengthChoice: 60 }
      : next,
  );
}
