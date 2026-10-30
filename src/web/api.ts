import type {
  BlockMode,
  BrowseResult,
  PlayerStatus,
  RecentPlays,
  Schedule,
  SlotLength,
  SlotMiss,
  TodayRundown,
  TvBoard,
} from "../shared/types.ts";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error(text.trim() || res.statusText);
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  tv: () => req<TvBoard>("/api/tv"),
  schedule: () => req<Schedule>("/api/schedule"),
  saveSchedule: (schedule: Schedule) =>
    req<{ schedule: Schedule; today: TodayRundown; misses: SlotMiss[] }>("/api/schedule", {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),
  shuffle: (date: string, id: string) =>
    req<TvBoard>(`/api/tv/${date}/items/${id}/shuffle`, { method: "POST" }),
  stepEpisode: (date: string, id: string, direction: "prev" | "next") =>
    req<TvBoard>(`/api/tv/${date}/items/${id}/episode`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    }),
  browse: (path?: string) =>
    req<BrowseResult>(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  suggestPaths: (path: string, kind: "folder" | "video" = "folder") =>
    req<{ dirs: BrowseResult["dirs"]; videos: BrowseResult["videos"] }>(
      `/api/browse/suggest?path=${encodeURIComponent(path)}&kind=${kind}`,
    ),
  pickFolder: () => req<{ path: string | null }>("/api/browse/pick", { method: "POST" }),
  pickFile: () => req<{ path: string | null }>("/api/browse/pick-file", { method: "POST" }),
  videoCount: (folder: string, file = "") =>
    req<{ count: number; exists: boolean }>(
      `/api/video-count?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`,
    ),
  youtubeTitles: (urls: string[]) =>
    req<{ titles: Record<string, string> }>("/api/youtube/titles", {
      method: "POST",
      body: JSON.stringify({ urls }),
    }),
  slotLength: (mode: BlockMode, folder: string, file = "") =>
    req<{ length: SlotLength | null }>(
      `/api/slot-length?mode=${encodeURIComponent(mode)}&folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`,
    ),
  recent: () => req<RecentPlays>("/api/recent"),
  forgetRecent: (folder: string, filePath: string) =>
    req<RecentPlays>("/api/recent/remove", {
      method: "POST",
      body: JSON.stringify({ folder, path: filePath }),
    }),
  startPlayer: () => req<PlayerStatus>("/api/player/start", { method: "POST" }),
  status: () => req<PlayerStatus>("/api/player/status"),
  shutdown: () => req<{ ok: true }>("/api/shutdown", { method: "POST" }),
};
