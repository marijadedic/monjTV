import type {
  BlockMode,
  BrowseResult,
  PlayerStatus,
  Schedule,
  SlotLength,
  SlotMiss,
  TodayRundown,
} from "../shared/types.ts";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  today: () => req<TodayRundown>("/api/today"),
  schedule: () => req<Schedule>("/api/schedule"),
  saveSchedule: (schedule: Schedule) =>
    req<{ schedule: Schedule; today: TodayRundown; misses: SlotMiss[] }>("/api/schedule", {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),
  shuffle: (id: string) =>
    req<TodayRundown>(`/api/today/items/${id}/shuffle`, { method: "POST" }),
  browse: (path?: string) =>
    req<BrowseResult>(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  suggestPaths: (path: string, kind: "folder" | "video" = "folder") =>
    req<{ dirs: BrowseResult["dirs"]; videos: BrowseResult["videos"] }>(
      `/api/browse/suggest?path=${encodeURIComponent(path)}&kind=${kind}`,
    ),
  pickFolder: () => req<{ path: string | null }>("/api/browse/pick", { method: "POST" }),
  pickFile: () => req<{ path: string | null }>("/api/browse/pick-file", { method: "POST" }),
  videoCount: (folder: string) =>
    req<{ count: number }>(`/api/video-count?folder=${encodeURIComponent(folder)}`),
  slotLength: (mode: BlockMode, folder: string, file = "") =>
    req<{ length: SlotLength | null }>(
      `/api/slot-length?mode=${encodeURIComponent(mode)}&folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`,
    ),
  startPlayer: () => req<PlayerStatus>("/api/player/start", { method: "POST" }),
  status: () => req<PlayerStatus>("/api/player/status"),
  shutdown: () => req<{ ok: true }>("/api/shutdown", { method: "POST" }),
};
