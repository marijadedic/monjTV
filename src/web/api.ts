import type {
  BrowseResult,
  PlayerStatus,
  Schedule,
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
    req<{ schedule: Schedule; today: TodayRundown }>("/api/schedule", {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),
  shuffle: (id: string) =>
    req<TodayRundown>(`/api/today/items/${id}/shuffle`, { method: "POST" }),
  browse: (path?: string) =>
    req<BrowseResult>(`/api/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  suggestFolders: (path: string) =>
    req<{ dirs: BrowseResult["dirs"] }>(`/api/browse/suggest?path=${encodeURIComponent(path)}`),
  pickFolder: () => req<{ path: string | null }>("/api/browse/pick", { method: "POST" }),
  startPlayer: () => req<PlayerStatus>("/api/player/start", { method: "POST" }),
  status: () => req<PlayerStatus>("/api/player/status"),
};
