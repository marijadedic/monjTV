// The long-lived mpv process.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { isYoutubeUrl } from "../../shared/youtube.ts";
import { cachedYoutubeTitle, youtubeStreamUrls } from "../youtube/youtube.ts";
import { ensureYtdlp } from "../youtube/ytdlp.ts";

type MpvEvent = {
  event?: string;
  reason?: string;
  error?: string;
  request_id?: number;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

// Poll until the mpv IPC socket accepts a connection.
function waitForSocket(sockPath: string, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    // Try the socket, then retry until it appears or the timeout hits.
    const tick = () => {
      const sock = net.connect(sockPath);
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error("mpv IPC socket did not appear"));
          return;
        }
        setTimeout(tick, 80);
      });
    };
    tick();
  });
}

// Seconds, or a percent such as "40%". Empty when playback should open at the beginning.
function startArgOf(start: number | string): string {
  if (typeof start === "number") {
    if (!Number.isFinite(start) || start <= 0) return "";
    return String(Math.floor(start));
  }
  const trimmed = start.trim();
  if (!trimmed || trimmed === "0" || trimmed === "0%") return "";
  return trimmed;
}

// Display of the logged-in session, so mpv still opens on the TV when the server was started without one.
function sessionEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!env.XDG_RUNTIME_DIR && uid != null) env.XDG_RUNTIME_DIR = `/run/user/${uid}`;
  const runtime = env.XDG_RUNTIME_DIR;
  if (runtime && !env.WAYLAND_DISPLAY && existsSync(`${runtime}/wayland-0`)) {
    env.WAYLAND_DISPLAY = "wayland-0";
  }
  if (!env.DISPLAY && existsSync("/tmp/.X11-unix/X0")) env.DISPLAY = ":0";
  return env;
}

// True when this machine is a Raspberry Pi.
function isRaspberryPi(): boolean {
  if (process.platform !== "linux") return false;
  try {
    const model = readFileSync("/proc/device-tree/model", "utf8").replaceAll("\0", "");
    return /raspberry pi/i.test(model);
  } catch {
    return false;
  }
}

// Direct hardware decode on the Pi leaves a blue window. Copy the frames back.
function decodeArgs(): string[] {
  if (!isRaspberryPi()) return ["--hwdec=auto"];
  return [
    "--vo=gpu",
    "--gpu-api=opengl",
    "--hwdec=auto-copy",
    "--vd-lavc-software-fallback=yes",
    "--scale=bilinear",
    "--dither=no",
    "--deband=no",
  ];
}

export class Mpv {
  private proc: ChildProcess | null = null;
  private sock: net.Socket | null = null;
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sockPath = path.join(os.tmpdir(), `monjtv-${process.pid}.sock`);
  onEndFile: ((reason: string) => void) | null = null;
  onExit: (() => void) | null = null;
  private lastEndReason: string | null = null;
  private fileStarted = false;
  private sourcePath: string | null = null;

  // True while the mpv process is still alive.
  get running(): boolean {
    return this.proc !== null && this.proc.exitCode === null;
  }

  // Spawn mpv and connect to its IPC socket.
  async start(): Promise<void> {
    if (this.running) return;
    await unlink(this.sockPath).catch(() => undefined);
    const ytdlp = await ensureYtdlp();
    this.proc = spawn(
      "mpv",
      [
        "--idle=yes",
        "--fs",
        `--input-ipc-server=${this.sockPath}`,
        "--force-window=yes",
        "--keep-open=no",
        "--no-terminal",
        // The hook opens the watch page, and YouTube answers 403. Streams are loaded directly.
        // Turning the hook off during loadfile unloads it, and the new file ends before it is on screen.
        "--ytdl=no",
        `--script-opts=ytdl_hook-ytdl_path=${ytdlp}`,
        "--ytdl-format=bestvideo[height<=1080][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=1080][vcodec^=avc]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/18/best",
        "--ytdl-raw-options-append=no-playlist=",
        // Node solves YouTube's player challenge. Without it, some stream links never start.
        `--ytdl-raw-options-append=js-runtimes=node:${process.execPath}`,
        "--ytdl-raw-options-append=socket-timeout=30",
        "--ytdl-raw-options-append=extractor-retries=3",
        "--demuxer-lavf-o-append=reconnect=1",
        "--demuxer-lavf-o-append=reconnect_streamed=1",
        "--demuxer-lavf-o-append=reconnect_delay_max=5",
        "--cache=yes",
        "--demuxer-readahead-secs=20",
        "--demuxer-max-bytes=150MiB",
        ...decodeArgs(),
      ],
      { stdio: ["ignore", "ignore", "inherit"], env: sessionEnv() },
    );
    this.proc.once("exit", () => {
      this.cleanup();
      this.onExit?.();
    });
    await waitForSocket(this.sockPath);
    this.sock = net.createConnection(this.sockPath);
    this.sock.setEncoding("utf8");
    this.sock.on("data", (chunk: string) => this.onData(chunk));
    this.sock.on("error", () => undefined);
  }

  // Replace the current file. A start of seconds or a percent seeks into it.
  async loadFile(filePath: string, start: number | string = 0): Promise<void> {
    const startArg = startArgOf(start);
    if (!isYoutubeUrl(filePath)) {
      this.sourcePath = null;
      if (startArg) {
        await this.command(["loadfile", filePath, "replace", -1, { start: startArg }], 8_000);
        return;
      }
      await this.command(["loadfile", filePath, "replace"], 8_000);
      return;
    }
    await this.loadYoutube(filePath, start, startArg);
  }

  // Open the stream URL yt-dlp returns. The watch page through ytdl_hook comes back 403.
  private async loadYoutube(
    filePath: string,
    start: number | string,
    startArg: string,
  ): Promise<void> {
    const began = Date.now();
    const streams = await youtubeStreamUrls(filePath);
    this.sourcePath = filePath;
    const title = cachedYoutubeTitle(filePath);
    if (title) {
      await this.command(["set_property", "force-media-title", title]).catch(() => undefined);
    }
    this.watchNewFile();
    await this.command(["loadfile", streams.videoUrl, "replace"], 15_000);
    if (!(await this.waitForPlayback(20_000))) {
      this.sourcePath = null;
      console.error("youtube playback did not start", this.lastEndReason ?? "timeout");
      throw new Error("Could not play this YouTube video");
    }
    if (title) {
      await this.command(["set_property", "force-media-title", title]).catch(() => undefined);
    }
    if (streams.audioUrl) {
      await this.command(["audio-add", streams.audioUrl, "select"], 15_000).catch(() => undefined);
    }
    if (!startArg) return;
    if (typeof start === "string" && start.trim().endsWith("%")) {
      await this.command(["seek", Number.parseFloat(start), "absolute-percent"]).catch(() => undefined);
      return;
    }
    const extra = (Date.now() - began) / 1000;
    await this.command(["seek", Number(startArg) + extra, "absolute"]).catch(() => undefined);
  }

  // Ignore the file being replaced. Its end arrives before the new file starts.
  private watchNewFile(): void {
    this.fileStarted = false;
    this.lastEndReason = null;
  }

  // True when mpv has a file on screen and a clock.
  private async isPlaying(): Promise<boolean> {
    try {
      const idle = (await this.command(["get_property", "idle-active"], 1500)) as { data?: unknown };
      if (idle.data === true) return false;
      const pos = (await this.command(["get_property", "time-pos"], 1500)) as { data?: unknown };
      return typeof pos.data === "number" && Number.isFinite(pos.data);
    } catch {
      return false;
    }
  }

  // Wait until the stream is on screen, or until it has failed.
  private async waitForPlayback(timeoutMs: number): Promise<boolean> {
    const began = Date.now();
    while (Date.now() - began < timeoutMs) {
      const failed =
        this.fileStarted && (this.lastEndReason === "error" || this.lastEndReason === "unknown");
      if (failed) return false;
      if (await this.isPlaying()) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return this.isPlaying();
  }

  // Path of the file on screen. Empty when mpv is idle.
  async currentPath(): Promise<string | null> {
    if (!this.running || !this.sock) return null;
    try {
      const msg = (await this.command(["get_property", "path"])) as { data?: unknown };
      const actual = typeof msg.data === "string" ? msg.data : null;
      if (!actual) {
        this.sourcePath = null;
        return null;
      }
      return this.sourcePath ?? actual;
    } catch {
      return null;
    }
  }

  // Stop the current file without quitting mpv.
  async stopPlayback(): Promise<void> {
    if (!this.running) return;
    this.sourcePath = null;
    await this.command(["stop"]).catch(() => undefined);
  }

  // Quit mpv and tear down the IPC connection.
  async quit(): Promise<void> {
    if (!this.running) return;
    await this.command(["quit"]).catch(() => undefined);
    this.proc?.kill();
    this.cleanup();
  }

  // Send an IPC command and wait for its reply.
  private async command(args: unknown[], timeoutMs = 5000): Promise<unknown> {
    if (!this.sock) throw new Error("mpv is not running");
    const request_id = this.nextId++;
    const payload = JSON.stringify({ command: args, request_id }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(request_id, { resolve, reject });
      this.sock!.write(payload, (err) => {
        if (err) {
          this.pending.delete(request_id);
          reject(err);
        }
      });
      setTimeout(() => {
        if (this.pending.has(request_id)) {
          this.pending.delete(request_id);
          reject(new Error("mpv command timed out"));
        }
      }, timeoutMs);
    });
  }

  // Parse IPC lines, emit events, and settle pending commands.
  private onData(chunk: string): void {
    this.buf += chunk;
    const lines = this.buf.split("\n");
    this.buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: MpvEvent;
      try {
        msg = JSON.parse(line) as MpvEvent;
      } catch {
        continue;
      }
      if (msg.event === "start-file") {
        this.fileStarted = true;
        this.lastEndReason = null;
      }
      if (msg.event === "end-file") {
        this.lastEndReason = msg.reason ?? "unknown";
        this.onEndFile?.(this.lastEndReason);
      }
      if (msg.request_id !== undefined && this.pending.has(msg.request_id)) {
        const pending = this.pending.get(msg.request_id)!;
        this.pending.delete(msg.request_id);
        if (msg.error && msg.error !== "success") {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg);
        }
      }
    }
  }

  // Close the socket and drop process state.
  private cleanup(): void {
    this.sock?.destroy();
    this.sock = null;
    this.proc = null;
    this.sourcePath = null;
    this.pending.clear();
    unlink(this.sockPath).catch(() => undefined);
  }
}
