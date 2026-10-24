import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { isYoutubeUrl } from "../shared/youtube.ts";
import { ensureYtdlp } from "./ytdlp.ts";

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

// Direct hardware decode on the Pi leaves a blue window. Copy the frames back.
function decodeArgs(): string[] {
  if (!isRaspberryPi()) return ["--hwdec=auto"];
  return [
    "--vo=gpu",
    "--gpu-api=opengl",
    "--hwdec=auto-copy",
    "--vd-lavc-software-fallback=yes",
  ];
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

export class Mpv {
  private proc: ChildProcess | null = null;
  private sock: net.Socket | null = null;
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private sockPath = path.join(os.tmpdir(), `monjtv-${process.pid}.sock`);
  onEndFile: ((reason: string) => void) | null = null;
  onExit: (() => void) | null = null;

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
        `--script-opts=ytdl_hook-ytdl_path=${ytdlp}`,
        "--ytdl-format=bestvideo[height<=1080][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[height<=1080][vcodec^=avc]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/18/best",
        "--ytdl-raw-options-append=no-playlist=",
        ...decodeArgs(),
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
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

  // Replace the current file. A positive start seeks that many seconds in.
  async loadFile(filePath: string, startSec = 0): Promise<void> {
    const start = Math.floor(startSec);
    const timeoutMs = isYoutubeUrl(filePath) ? 60_000 : 8_000;
    if (start > 0) {
      await this.command(["loadfile", filePath, "replace", -1, { start: String(start) }], timeoutMs);
      return;
    }
    await this.command(["loadfile", filePath, "replace"], timeoutMs);
  }

  // Stop the current file without quitting mpv.
  async stopPlayback(): Promise<void> {
    if (!this.running) return;
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
      if (msg.event === "end-file") {
        this.onEndFile?.(msg.reason ?? "unknown");
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
    this.pending.clear();
    unlink(this.sockPath).catch(() => undefined);
  }
}
