import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import type { Schedule } from "../shared/types.ts";
import { PORT } from "../shared/constants.ts";
import { browse } from "./files.ts";
import { clientDir } from "./paths.ts";
import { getStatus, startPlayer } from "./player.ts";
import { loadProgress } from "./progress.ts";
import { ensureToday, loadToday, rebuildTodayPreservingPlayback, shuffleItem } from "./rundown.ts";
import { assertFolder, loadSchedule, saveSchedule } from "./schedule.ts";

const app = new Hono();

// Liveness check.
app.get("/api/health", (c) => c.json({ ok: true }));

// Return the saved weekly schedule.
app.get("/api/schedule", async (c) => {
  return c.json(await loadSchedule());
});

// Save the schedule and rebuild today around current playback.
app.put("/api/schedule", async (c) => {
  const body = (await c.req.json()) as Schedule;
  try {
    for (const block of body.blocks ?? []) {
      await assertFolder(block.folder);
    }
    const saved = await saveSchedule(body);
    const today = await rebuildTodayPreservingPlayback();
    return c.json({ schedule: saved, today });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

// Return today's rundown, building it if the date changed.
app.get("/api/today", async (c) => {
  return c.json(await ensureToday());
});

// Swap one random rundown item for another file.
app.post("/api/today/items/:id/shuffle", async (c) => {
  try {
    return c.json(await shuffleItem(c.req.param("id")));
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

  serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`monjTV on http://0.0.0.0:${info.port}`);
    if (!existsSync(clientIndex)) {
      console.log("UI dev server: http://127.0.0.1:5173 (npm run dev)");
    }
  });
}

void main();
