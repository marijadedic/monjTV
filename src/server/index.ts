import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { isBlockMode } from "../shared/types.ts";
import { PORT } from "../shared/constants.ts";
import { assertVideo, browse, isDir, isVideoFile, pickFile, pickFolder, suggestPaths } from "./files.ts";
import { clientDir } from "./paths.ts";
import { getStatus, intermissionFile, replayItem, shutdownPlayer, startPlayer, syncIntermission } from "./player.ts";
import { forgetUnusedFolders, loadProgress } from "./progress.ts";
import {
  ensureToday,
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
      if (block.mode === "specific-file") await assertVideo(block.file ?? "");
      else if (block.mode === "youtube") await assertYoutubeVideo(block.file ?? "");
      else await assertFolder(block.folder);
    }
    const saved = await saveSchedule(body);
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
  if (!isBlockMode(mode)) {
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

// Return today's rundown, building it if the date changed.
app.get("/api/today", async (c) => {
  return c.json(await ensureToday());
});

// Serve one cached frame for a local-file rundown item.
app.get("/api/today/items/:id/still", async (c) => {
  const today = await ensureToday();
  const item = today.items.find((entry) => entry.id === c.req.param("id"));
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
  const filePath = intermissionFile();
  if (!filePath || c.req.query("file") !== filePath) return c.notFound();
  const file = await frameOf(filePath);
  if (!file) return c.notFound();
  const bytes = await readFile(file);
  return c.body(bytes, 200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "private, max-age=86400",
  });
});

// Swap one random rundown item for another file.
app.post("/api/today/items/:id/shuffle", async (c) => {
  try {
    return c.json(await shuffleItem(c.req.param("id")));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// Move a next-episode item to the previous or next file in its folder.
app.post("/api/today/items/:id/episode", async (c) => {
  const body = await c.req.json().catch(() => null);
  const direction = body?.direction === "prev" ? -1 : body?.direction === "next" ? 1 : 0;
  if (!direction) return c.json({ error: "direction must be prev or next" }, 400);
  try {
    const itemId = c.req.param("id");
    const today = await stepEpisode(itemId, direction);
    await replayItem(itemId);
    return c.json(today);
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

// Create the local data files, then start the server.
async function main(): Promise<void> {
  await loadSchedule();
  await loadProgress();
  const today = await loadToday();
  if (!today.date) await ensureToday();

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
