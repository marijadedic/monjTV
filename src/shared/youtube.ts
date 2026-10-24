const WATCH_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

// Canonical watch URL, or null when this is not a single YouTube video.
export function parseYoutubeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (WATCH_HOSTS.has(host)) {
    if (url.pathname === "/watch" || url.pathname === "/watch/") {
      id = url.searchParams.get("v");
    } else {
      const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
      if (match) id = match[2] ?? null;
    }
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function isYoutubeUrl(raw: string): boolean {
  return parseYoutubeUrl(raw) !== null;
}

export function youtubeId(raw: string): string | null {
  const url = parseYoutubeUrl(raw);
  return url ? new URL(url).searchParams.get("v") : null;
}

export function youtubeLabel(raw: string): string {
  const id = youtubeId(raw);
  return id ? `YouTube · ${id}` : "YouTube";
}
