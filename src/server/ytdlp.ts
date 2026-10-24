import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { rootDir } from "./paths.ts";

export const toolsDir = path.join(rootDir, "tools");
export const ytdlpBin = path.join(toolsDir, "yt-dlp");

const RELEASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";

let ensuring: Promise<string> | null = null;

// Distro yt-dlp is often too old for YouTube. Prefer a current binary in tools/.
function assetName(): string {
  if (process.platform === "linux" && process.arch === "arm64") return "yt-dlp_linux_aarch64";
  if (process.platform === "linux") return "yt-dlp_linux";
  if (process.platform === "darwin") return "yt-dlp_macos";
  return "yt-dlp";
}

export async function ensureYtdlp(): Promise<string> {
  if (existsSync(ytdlpBin)) return ytdlpBin;
  if (!ensuring) {
    ensuring = downloadYtdlp()
      .catch(() => "yt-dlp")
      .finally(() => {
        ensuring = null;
      });
  }
  return ensuring;
}

async function downloadYtdlp(): Promise<string> {
  await mkdir(toolsDir, { recursive: true });
  const res = await fetch(`${RELEASE}/${assetName()}`, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Could not download yt-dlp (${res.status})`);
  }
  const tmp = `${ytdlpBin}.tmp`;
  await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
  await chmod(tmp, 0o755);
  await rename(tmp, ytdlpBin);
  return ytdlpBin;
}
