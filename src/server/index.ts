import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { isItemMode, type PlaylistEntry, type ScheduleBlock } from "../shared/types.ts";
import { PORT } from "../shared/constants.ts";
import { assertVideo, browse, isDir, isVideoFile, pickFile, pickFolder, suggestPaths } from "./files.ts";
import { clientDir } from "./paths.ts";
import { getStatus, intermissionStillAllowed, replayItem, shutdownPlayer, startPlayer, syncIntermission } from "./player.ts";
import { forgetRandomPlayed, forgetUnusedFolders, loadProgress, recentPlays } from "./progress.ts";
import {
  ensureBoard,
  findRundownItem,
  loadToday,
  missesForBlocks,
  rebuildTodayPreservingPlayback,
  shuffleItem,
  slotLength,
  stepEpisode,
  videoCount,
} from "./rundown.ts";
import { assertFolder, changedBlocks, loadSchedule, saveSchedule, sourceChanged } from "./schedule.ts";
import { assertYoutubeVideo, youtubeTitles } from "./youtube.ts";
import { frameOf } from "./still.ts";
import { closeAppTabs, portsFrom } from "./tabs.ts";

const app = new Hono();
let httpServer: { close: () => void } | undefined;
let stopping = false;
let closePorts = [PORT];

// Liveness check.
app.get("/api/health", (c) => c.json({ ok: true }));

// Return the saved weekly schedule.
app.get("/api/schedule", async (c) => {
  return c.json(await loadSchedule());
});

// Save the schedule and rebuild today around current playback.
app.put("/api/schedule", async (c) => {
  const body = (await c.req.json()) as Parameters<typeof saveSchedule>[0];
  try {
    const previous = await loadSchedule();
    for (const block of body.blocks ?? []) {
      if (!sourceChanged(previous.blocks, block)) continue;
      await assertBlockSource(block);
    }
    const saved = await saveSchedule(body);
    const playbackSame =
      previous.activeIntermission === saved.activeIntermission &&
      JSON.stringify(previous.blocks) === JSON.stringify(saved.blocks) &&
      JSON.stringify(previous.intermissions) === JSON.stringify(saved.intermissions);
    if (playbackSame) {
      await syncIntermission();
      return c.json({ schedule: saved, today: await loadToday(), misses: [] });
    }
    await forgetUnusedFolders(previous.blocks, saved.blocks);
    const today = await rebuildTodayPreservingPlayback();
    const misses = await missesForBlocks(changedBlocks(previous.blocks, saved.blocks));
    await syncIntermission();
    return c.json({ schedule: saved, today, misses });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// Titles for the YouTube links on the timetable.
app.post("/api/youtube/titles", async (c) => {
  const body = await c.req.json().catch(() => null);
  const urls = Array.isArray(body?.urls)
    ? body.urls.filter((url: unknown): url is string => typeof url === "string").slice(0, 40)
    : [];
  return c.json({ titles: await youtubeTitles(urls) });
});

// Length of the video a slot will play. A random folder uses its longest video.
app.get("/api/video-count", async (c) => {
  const file = (c.req.query("file") ?? "").trim();
  if (file) return c.json({ count: 0, exists: await isVideoFile(file) });
  const folder = (c.req.query("folder") ?? "").trim();
  const exists = folder.length > 0 && (await isDir(folder));
  return c.json({ count: exists ? await videoCount(folder) : 0, exists });
});

app.get("/api/slot-length", async (c) => {
  const mode = c.req.query("mode");
  if (!isItemMode(mode)) {
    return c.json(
      { error: "mode must be next-episode, random-file, specific-file, or youtube" },
      400,
    );
  }
  try {
    const length = await slotLength({
      mode,
      folder: c.req.query("folder") ?? "",
      file: c.req.query("file") ?? "",
    });
    return c.json({ length });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// The eight saved days, building any day that is not on disk yet.
app.get("/api/tv", async (c) => {
  return c.json(await ensureBoard());
});

// Serve one cached frame for a local-file rundown item.
app.get("/api/tv/items/:id/still", async (c) => {
  const item = await findRundownItem(c.req.param("id"));
  if (!item || item.mode === "youtube") return c.notFound();
  const file = await frameOf(item.path);
  if (!file) return c.notFound();
  const bytes = await readFile(file);
  return c.body(bytes, 200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "private, max-age=86400",
  });
});

// One cached frame for the local file filling a gap. The query must be that file.
app.get("/api/player/intermission-still", async (c) => {
  const filePath = c.req.query("file") ?? "";
  if (!(await intermissionStillAllowed(filePath))) return c.notFound();
  const file = await frameOf(filePath);
  if (!file) return c.notFound();
  const bytes = await readFile(file);
  return c.body(bytes, 200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "private, max-age=86400",
  });
});

// Swap one random rundown item for another file.
app.post("/api/tv/:date/items/:id/shuffle", async (c) => {
  try {
    return c.json(await shuffleItem(c.req.param("date"), c.req.param("id")));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// Move a next-episode item to the previous or next file in its folder.
app.post("/api/tv/:date/items/:id/episode", async (c) => {
  const body = await c.req.json().catch(() => null);
  const direction = body?.direction === "prev" ? -1 : body?.direction === "next" ? 1 : 0;
  if (!direction) return c.json({ error: "direction must be prev or next" }, 400);
  try {
    const date = c.req.param("date");
    const itemId = c.req.param("id");
    const board = await stepEpisode(date, itemId, direction);
    await replayItem(itemId);
    return c.json(board);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// Open the system video picker and return the chosen file.
app.post("/api/browse/pick-file", async (c) => {
  try {
    return c.json({ path: await pickFile() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// Open the system folder picker and return the chosen path.
app.post("/api/browse/pick", async (c) => {
  try {
    return c.json({ path: await pickFolder() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// Child folders, or videos, that match a path being typed.
app.get("/api/browse/suggest", async (c) => {
  const kind = c.req.query("kind") === "video" ? "video" : "folder";
  try {
    return c.json(await suggestPaths(c.req.query("path") ?? "", kind));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// List folders and videos for the folder picker.
app.get("/api/browse", async (c) => {
  try {
    return c.json(await browse(c.req.query("path")));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// Recently played random files, newest first in each folder.
app.get("/api/recent", async (c) => {
  return c.json(await recentPlays());
});

// Take one file off that list so a random slot can pick it again.
app.post("/api/recent/remove", async (c) => {
  const body = await c.req.json().catch(() => null);
  const folder = typeof body?.folder === "string" ? body.folder : "";
  const filePath = typeof body?.path === "string" ? body.path : "";
  if (!folder || !filePath) return c.json({ error: "folder and path are required" }, 400);
  return c.json(await forgetRandomPlayed(folder, filePath));
});

// Start mpv and begin playback.
app.post("/api/player/start", async (c) => {
  try {
    return c.json(await startPlayer());
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// Current playback status.
app.get("/api/player/status", async (c) => {
  return c.json(await getStatus());
});

// Quit mpv, close the browser tab, and exit the process.
app.post("/api/shutdown", async (c) => {
  if (!stopping) {
    stopping = true;
    closePorts = portsFrom(c.req.header("origin") ?? c.req.header("referer") ?? "");
    // Close while this request is still open. A page cannot close its own tab,
    // and trying to leaves about:blank before a later close can see the URL.
    await closeAppTabs(closePorts);
    setTimeout(() => {
      void finishShutdown();
    }, 30);
  }
  return c.json({ ok: true });
});

const clientIndex = path.join(clientDir, "index.html");
if (existsSync(clientIndex)) {
  app.use("*", async (c, next) => {
    await next();
    if (c.req.path.startsWith("/api") || c.req.path.startsWith("/assets/")) return;
    // The TV schedule is always "/", so a cached copy of that document hides a new build.
    // Admin is a different address and was loading the new files.
    c.res.headers.set("Cache-Control", "no-store");
  });
  app.use(
    "/*",
    serveStatic({
      root: path.relative(process.cwd(), clientDir) || ".",
    }),
  );
  // Serve the client app for non-API routes.
  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api")) return c.notFound();
    return c.html(await readFile(clientIndex, "utf8"));
  });
}

// A new or edited slot still points at a real folder, video, or YouTube URL.
async function assertBlockSource(block: ScheduleBlock): Promise<void> {
  if (block.mode === "playlist") {
    for (const item of block.items ?? []) await assertEntrySource(item);
    return;
  }
  if (block.mode === "specific-file") await assertVideo(block.file ?? "");
  else if (block.mode === "youtube") await assertYoutubeVideo(block.file ?? "");
  else await assertFolder(block.folder);
}

async function assertEntrySource(item: PlaylistEntry): Promise<void> {
  if (item.mode === "specific-file") await assertVideo(item.file ?? "");
  else if (item.mode === "youtube") await assertYoutubeVideo(item.file ?? "");
  else await assertFolder(item.folder);
}

// Create the local data files, then start the server.
async function main(): Promise<void> {
  await loadSchedule();
  await loadProgress();
  await loadToday();

  httpServer = serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`monjTV on http://0.0.0.0:${info.port}`);
    if (!existsSync(clientIndex)) {
      console.log("UI dev server: http://127.0.0.1:5173 (npm run dev)");
    }
  });
}

// Stop playback, then leave the port free. The tab is already closed.
async function finishShutdown(): Promise<void> {
  try {
    await shutdownPlayer();
  } finally {
    httpServer?.close();
    process.exit(0);
  }
}

void main();
