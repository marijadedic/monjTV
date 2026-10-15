# monjTV decisions

Record every architecture decision in this file. Do not add a separate ADR folder. Append a short entry when a decision is settled, and rewrite the entry when it changes.

## Product

mpv fullscreen is the TV. Today and Admin are the remote, on this machine or the LAN. A desktop launcher starts the app; playback is not a browser video.

## Stack

TypeScript. Hono serves the API on port 3000. The UI is Preact. `npm run dev` is Vite on port 5173 plus that API. Port 3000 serves `dist/client` only after `npm run build`.

One long-lived mpv process (`--idle=yes`, `--fs`, IPC `loadfile` with `replace`). Do not build a full-day playlist.

## Schedule and playback

`schedule.json` is the weekly grid: days, start, end, folder, and mode (`next-episode` or `random-file`). It may also name a `fallbackFolder` for time with no block. Blocks on the same day must not overlap, and a block ends the same day it starts.

`today.json` is that date’s rundown: concrete files, planned times, and status (`planned`, `playing`, `done`, `skipped`). It is built from the grid and probed durations. It is what the UI shows and what mpv plays. It is not an mpv playlist.

The wall clock chooses the block. Files always start at 00:00. Do not seek because the app started late.

A file already playing finishes even if its block ends. Before a file starts, it must fit the time left in the block plus 8 minutes of grace. Under 3 minutes left, do not start it. If it does not fit, mark it `skipped`, leave progress unchanged, and start the next block that does fit.

Progress updates only when a file ends (`eof`). `next-episode` stores the last completed path per folder and walks folder order, wrapping at the end. `random-file` avoids recent plays. Shuffle applies only to a `random-file` item that is still `planned`.

Saving the schedule rebuilds today and keeps items that are already playing or finished.

When the wall clock is outside every block and `fallbackFolder` is set, mpv plays a random file from that folder until the next block. Those plays are not rundown items and do not change episode progress. Files still start at 00:00.

Today and Admin are folder tabs. Language and theme live in Options. Today is a time rail: the current show is in the on-air strip and again on the rail. Admin is a clock of day columns. A new slot is a click on empty time, edited in a short panel, and saved when that panel is committed. Grove is Palatino on a daylight flower frame. Dark and Light stay system-ui, and the Options controls stay system-ui in Grove.

## Data

`data/` is local state (`schedule.json`, `today.json`, `progress.json`). It stays gitignored. A missing or empty file is created from an empty fallback on read. Invalid JSON is left on disk; the process uses the fallback in memory.

Server functions keep a one-line comment above the function.
