# monjTV

monjTV is a weekly TV schedule. One long-lived [mpv](https://mpv.io/) window is the player. The browser is the remote. **Today** tab shows what is on, and **Admin** is where you build the week. Playback is an mpv window, so a phone or another computer on the LAN can run the remote while the picture stays on the TV.

The server keeps one mpv process idle and swaps the current file when the wall clock says the next one should start.

You have to provide your own local movie library. 😁

## What you need


| Tool                              | Why                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js `^20.19.0` or `>=22.12.0` | Vite 8 will not start on older Node. `node -v` should print v20.19+ or v22.12+.                                                                         |
| mpv on `PATH`                     | The picture. `mpv --version` should print a version.                                                                                                    |
| ffprobe on `PATH`                 | Comes with FFmpeg. Used to measure each file when the day's rundown is built. `ffprobe -version` should print a version.                                |
| A graphical session               | mpv opens a fullscreen window on the machine running the server. A headless SSH session with no display will start the API and then fail to show video. |


Install the system tools, then clone.

**macOS** (Homebrew):

```bash
brew install node mpv ffmpeg
```

**Debian and Ubuntu:**

```bash
sudo apt update
sudo apt install mpv ffmpeg
```

**Fedora:**

```bash
sudo dnf install mpv ffmpeg nodejs
```

**Raspberry Pi OS** (64-bit with desktop, Debian 13 / Trixie):

The Pi is the machine plugged into the TV. Use a terminal on the desktop so mpv opens on the HDMI screen.

```bash
sudo apt update
sudo apt install nodejs npm mpv ffmpeg
```

`node -v` should print v20.19 or newer. That is the Node package in Trixie. Bookworm images include Node 18, which is too old for this app, so use the current Raspberry Pi OS image.

On Linux, **Browse** opens `zenity`, `kdialog`, `qarma`, or `yad` when one of those is already installed. It does not install one. Otherwise you will have to type the folder path when selecting a movie/show location folder.

Confirm the three binaries before continuing:

```bash
node -v
mpv --version
ffprobe -version
```



## Get the code

```bash
git clone https://github.com/marijadedic/monjTV.git
cd monjTV
npm install
```

Video files stay where they already are on disk. monjTV does not import or copy them. A block points at a folder. The server walks that folder, skips names that start with `.`, and keeps files with these extensions:

`mkv` `mp4` `avi` `webm` `mov` `m4v` `ts` `m2ts` `wmv` `mpg` `mpeg`

It looks at most 5 folders deep and stops after 2000 videos.

## Run it while you are working on it

`npm run dev` starts two processes and stops both if either one exits:

- API: [http://127.0.0.1:3000](http://127.0.0.1:3000) (Hono, bound to `0.0.0.0`)
- UI: [http://127.0.0.1:5173](http://127.0.0.1:5173) (Vite). Requests to `/api/` are proxied to port 3000.

```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Leave this terminal running. Stop it with Ctrl+C.

In this mode the UI is on port 5173, on this machine. Another device on the LAN should use a production run (below), which serves the UI and the API together on port 3000.

The dev server does not start mpv by itself. Use **Start TV** on Today, or:

```bash
curl -X POST http://127.0.0.1:3000/api/player/start
```



## Run it for the TV

`npm start` builds the UI, then starts the API. Port 3000 serves `dist/client` and the API. This is the process that should run on the machine.

```bash
npm start
```

When that build already exists, start the API without building again:

```bash
npm run start:server
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). From another device on the same network, open `http://<this-machine-ip>:3000`. **Shut down** in Options quits mpv, closes the monjTV browser tab on this machine, and exits the server. In a terminal session, Ctrl+C stops it too.

`PORT` changes the listen port for either command (the default is `3000`):

```bash
PORT=3001 npm start
```



### Launcher script

`scripts/start.sh` is the same production run, in the background:

1. If `http://127.0.0.1:3000/api/health` is already up, it leaves that server alone.
2. Otherwise it runs `npm run start:server` when `dist/client/index.html` exists, and `npm start` when that file is missing. The server is detached, so the launcher can exit. Logs go to `logs/monjtv.log`.
3. It opens the UI in the default browser (`open` on macOS, `xdg-open` on Linux) and leaves that window in front. Closing that tab leaves the server running. Click the icon again and the remote opens. mpv starts from **Start TV** on Today.

```bash
chmod +x scripts/start.sh
./scripts/start.sh
```

`logs/` is gitignored. **Shut down** in Options stops a server started this way. If the page is already closed:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <pid>
```

Run `scripts/start.sh` from a terminal inside the graphical session on the machine, so mpv inherits the display:

```bash
echo "$DISPLAY"          # X11, often :0
echo "$WAYLAND_DISPLAY"  # Wayland
```



### Desktop icon

`node scripts/install-desktop.mjs` checks the operating system and installs an icon for this checkout:


| System                          | What appears                                        |
| ------------------------------- | --------------------------------------------------- |
| Raspberry Pi OS and other Linux | `monjTV` on the desktop and in the application menu |
| macOS                           | `monjTV.app` on the Desktop                         |
| Windows                         | a Desktop shortcut                                  |


Linux and the Pi use the same `.desktop` file. The icon runs `scripts/start.sh` on macOS and Linux, and `scripts/start.ps1` on Windows. Both start the server and open the remote. On macOS the icon asks Terminal to do that, because a Desktop app cannot read the project folder. Run the installer from the graphical session. Run it again after you move the folder. The icon stores this checkout's path and the Node that ran the installer.

`scripts/install-desktop.sh` runs that same installer on macOS and Linux. `npm run desktop` is the same command.

## First session

1. Put at least one video in a folder the server can read. That folder has to be on the machine (or a drive mounted there). The path you save is the path the server opens.
2. Start the app (`npm run dev`, or `npm start`).
3. Open **Admin**.
4. Click an empty stretch of a day column. A ghost of that slice stays on the hour, and the form opens over the week.
5. Set the days, start, end, folder, and mode, then commit the form. **Browse** opens a folder dialog on the machine running the server, which is the machine with the screen. macOS uses the system picker. On Linux, Browse opens `zenity`, `kdialog`, `qarma`, or `yad` when one of those is already installed, on the machine running the server. Otherwise type an absolute path (`/home/you/videos/cartoons`). Existing folders on the server are listed under the field as you type. The folder must already exist.
6. Open **Today** and press **Start TV**. mpv goes fullscreen and loads whatever fits right now.

Blocks on the same day cannot overlap, and a block ends the same day it starts (`18:00`–`19:30` is valid; `22:00`–`01:00` is not). Saving the schedule rebuilds today and keeps items that are already playing or finished.

**Options** in the header holds language (English or Croatian), theme (Dark, Meadow, Light), and **Shut down**. Language and theme stay in the browser. **Shut down** is a filled red stop. In Croatian the label is **Ugasi monjTV**. It quits mpv, closes the monjTV browser tab on this machine, and exits the server.

## How a day plays

`schedule.json` is the weekly grid. Each block has days, a start, an end, a folder, and a mode:

- `next-episode` walks the folder in order and remembers the last file that finished. The next start continues after that file, and wraps to the beginning after the last file.
- `random-file` picks a file and avoids the recent ones. Shuffle on Today only replaces a `random-file` item that is still `planned`.

`today.json` is that date's rundown: concrete files, planned times, and a status of `planned`, `playing`, `done`, or `skipped`. The UI shows this list. mpv plays one file at a time from it. It is not an mpv playlist.

The wall clock picks the block. Every file starts at `00:00`. Starting the app halfway through a slot does not seek into the episode.

A file that has already started plays out, even if its block ends. Before a file starts, it has to fit in the time left in the block plus 8 minutes. With under 3 minutes left, it does not start. A file that does not fit is marked `skipped`, progress stays where it was, and the server moves on to the next block that does fit.

Progress updates when a file reaches the end (`eof`). Stopping mpv puts a `playing` item back to `planned`, and puts back to `planned` any item that this start marked `skipped`.

If the clock is outside every block and a fallback folder is set, mpv plays a random file from that folder until the next block. Those plays are not rundown items and do not change episode progress. Set the fallback folder at the bottom of Admin.

If `ffprobe` is missing or cannot read a file, that file is treated as 45 minutes long, and the rundown times drift. Install FFmpeg if the rails look wrong.

## Pages

**Today** (`/`) is a time rail. The current show is in the on-air strip and again on the rail. **Start TV** starts mpv if it is not running and plays what fits now. **Shuffle** replaces one planned random-file item.

**Admin** (`/admin`) is a clock of day columns. A new slot is a click on empty time. The form saves when it is committed.

## Data

`data/` is local state and is gitignored. A missing or empty file is created from an empty fallback on read. Invalid JSON is left on disk; the process uses the empty fallback in memory.


| File                 | Contents                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| `data/schedule.json` | The week: `blocks` and `fallbackFolder`.                                 |
| `data/today.json`    | Today's rundown. Rebuilt when the date changes or the schedule is saved. |
| `data/progress.json` | `lastCompleted` (last finished path per folder) and `recentRandom`.      |


A schedule with one weekday block looks like this:

```json
{
  "blocks": [
    {
      "id": "6f1c0c4e-0b1a-4f0e-9c2a-8e5d7a1b3c90",
      "days": ["mon", "tue", "wed", "thu", "fri"],
      "start": "16:00",
      "end": "18:00",
      "folder": "/home/you/videos/cartoons",
      "mode": "next-episode"
    }
  ],
  "fallbackFolder": "/home/you/videos/music"
}
```

Days are `mon` `tue` `wed` `thu` `fri` `sat` `sun`. Times are `HH:mm`.

## Commands


| Command                            | What it does                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `npm install`                      | Install JavaScript dependencies.                                             |
| `npm run dev`                      | Vite on port 5173 and the API on port 3000, with reload.                     |
| `npm run build`                    | Write the UI to `dist/client`. `npm start` does this.                        |
| `npm start`                        | Build the UI, then serve it and the API on port 3000.                        |
| `npm run start:server`             | Start the API on port 3000 when `dist/client` already exists.                |
| `npm run typecheck`                | `tsc --noEmit`.                                                              |
| `./scripts/start.sh`               | Start the server in the background and open the UI.                          |
| `node scripts/install-desktop.mjs` | Install a desktop icon for this operating system.                            |


Health check:

```bash
curl -s http://127.0.0.1:3000/api/health
```

A healthy server returns `{"ok":true}`.

## When something fails

`mpv is not installed or not on PATH`**.** The Start TV request returns this when `spawn("mpv")` cannot find the binary. Install mpv and open a new terminal so `PATH` includes it. `which mpv` should print a path.

`mpv IPC socket did not appear`**.** mpv started and the server could not connect to its socket within 8 seconds. This is usually a missing display: run the server from the desktop session on the machine. `logs/monjtv.log` has the mpv stderr when you used `scripts/start.sh`.

**Browse on Linux asks you to type the path.** None of `zenity`, `kdialog`, `qarma`, or `yad` is installed. The path field takes an absolute path. When one of those programs is already installed, the dialog opens on the server's screen.

**The rail is empty.** Today is built from blocks whose days include today. A Monday-only block does not appear on Thursday. An empty schedule, or a folder with no recognized videos, also leaves the rail empty. Outside every block, a fallback folder still plays in mpv and shows its title in the on-air strip.

**Another computer cannot open the UI.** Use `npm start`, then `http://<machine-ip>:3000`. Port 5173 is the dev UI on the machine. If the page does not load, allow inbound TCP 3000 on the machine's firewall.


**Durations are all about 45 minutes.** `ffprobe` is missing or could not read the files. Install FFmpeg, delete `data/today.json`, and save the schedule again so the rundown is probed once more.