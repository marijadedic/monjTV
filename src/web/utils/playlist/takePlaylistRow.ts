import { parseYoutubeUrl } from "../../../shared/youtube.ts";
import type { PlaylistEntry, RundownItem } from "../../../shared/types.ts";

export function takePlaylistRow(unused: RundownItem[], entry: PlaylistEntry): RundownItem | undefined {
  const byId = unused.findIndex((item) => item.entryId === entry.id);
  if (byId >= 0) return unused.splice(byId, 1)[0];
  const byShape = unused.findIndex((item) => {
    if (item.entryId) return false;
    const itemMode = (item.mode as string) === "youtube" ? "specific-file" : item.mode;
    if (itemMode !== entry.mode) return false;
    if (entry.mode === "specific-file") {
      const url = parseYoutubeUrl(entry.file ?? "");
      return item.path === (url ?? (entry.file ?? "").trim());
    }
    return (item.folder ?? "") === entry.folder;
  });
  if (byShape >= 0) return unused.splice(byShape, 1)[0];
  return undefined;
}
