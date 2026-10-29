const WATCH_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIDEO_ID = /^[\w-]{11}$/;
const PLAYLIST_ID = /^[\w-]{2,80}$/;

export type YoutubePlaylistRef = {
  id: string;
  /** Playlist page. Listing uses this so a start video is not played alone. */
  url: string;
  startVideoId: string | null;
  /** 0-based. Used when the start video is missing or no longer in the list. */
  startIndex: number;
};

function parseHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function isYoutubeHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host === "youtu.be" || WATCH_HOSTS.has(host);
}

function videoIdOf(url: URL): string | null {
  if (!isYoutubeHost(url)) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    const part = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (part && part !== "playlist") id = part;
  } else if (url.pathname === "/watch" || url.pathname === "/watch/") {
    id = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
    // /embed/videoseries?list= is a playlist, not a video called "videoseries".
    if (match?.[2] && match[2] !== "videoseries") id = match[2];
  }
  if (!id || !VIDEO_ID.test(id)) return null;
  return id;
}

// Canonical watch URL, or null when this is not a single YouTube video.
// A playlist query on the same link is ignored. Slots always play one video.
export function parseYoutubeUrl(raw: string): string | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  const id = videoIdOf(url);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function isYoutubeUrl(raw: string): boolean {
  return parseYoutubeUrl(raw) !== null;
}

// Playlist link, including a watch URL that also names a list.
export function parseYoutubePlaylist(raw: string): YoutubePlaylistRef | null {
  const url = parseHttpUrl(raw);
  if (!url || !isYoutubeHost(url)) return null;
  const id = url.searchParams.get("list");
  if (!id || !PLAYLIST_ID.test(id)) return null;
  const indexRaw = url.searchParams.get("index");
  const indexNum = indexRaw == null || indexRaw === "" ? NaN : Number(indexRaw);
  const startIndex = Number.isInteger(indexNum) && indexNum > 1 ? indexNum - 1 : 0;
  return {
    id,
    url: `https://www.youtube.com/playlist?list=${id}`,
    startVideoId: videoIdOf(url),
    startIndex,
  };
}

// Saved intermission URL. A list plays the playlist. A bare video plays that video.
export function canonicalYoutubeIntermission(raw: string): string | null {
  const playlist = parseYoutubePlaylist(raw);
  if (playlist) return formatPlaylistSource(playlist);
  return parseYoutubeUrl(raw);
}

export function formatPlaylistSource(playlist: YoutubePlaylistRef): string {
  if (playlist.startVideoId) {
    const index = playlist.startIndex > 0 ? `&index=${playlist.startIndex + 1}` : "";
    return `https://www.youtube.com/watch?v=${playlist.startVideoId}&list=${playlist.id}${index}`;
  }
  if (playlist.startIndex > 0) {
    return `https://www.youtube.com/playlist?list=${playlist.id}&index=${playlist.startIndex + 1}`;
  }
  return playlist.url;
}

export function isYoutubeLink(raw: string): boolean {
  return canonicalYoutubeIntermission(raw) !== null;
}

// Where playback of this playlist begins. The video id wins over a stale index.
export function playlistStartIndex(videoIds: readonly string[], ref: YoutubePlaylistRef): number {
  if (ref.startVideoId) {
    const at = videoIds.indexOf(ref.startVideoId);
    if (at >= 0) return at;
  }
  if (ref.startIndex > 0 && ref.startIndex < videoIds.length) return ref.startIndex;
  return 0;
}

export function youtubeId(raw: string): string | null {
  const url = parseYoutubeUrl(raw);
  return url ? new URL(url).searchParams.get("v") : null;
}

export function youtubeLabel(raw: string): string {
  const playlist = parseYoutubePlaylist(raw);
  if (playlist) return `YouTube · ${playlist.id}`;
  const id = youtubeId(raw);
  return id ? `YouTube · ${id}` : "YouTube";
}
