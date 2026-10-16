#!/usr/bin/env node
// Detect the OS and install a desktop icon that starts this checkout.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const startSh = path.join(root, "scripts", "start.sh");
const startPs1 = path.join(root, "scripts", "start.ps1");

const SAGE = [63, 107, 58];
const CREAM = [243, 234, 212];
const INK = [18, 20, 26];
const GOLD = [212, 162, 74];

// Paint a meadow TV mark. The same picture is the Linux PNG, the Mac icon, and the Windows icon.
export function renderIconPng(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const put = (x, y, rgb, cover) => {
    if (cover <= 0) return;
    const i = y * stride + 1 + x * 4;
    const dstA = raw[i + 3] / 255;
    const outA = cover + dstA * (1 - cover);
    const inv = outA === 0 ? 0 : 1 / outA;
    const keep = dstA * (1 - cover);
    raw[i] = Math.round((rgb[0] * cover + raw[i] * keep) * inv);
    raw[i + 1] = Math.round((rgb[1] * cover + raw[i + 1] * keep) * inv);
    raw[i + 2] = Math.round((rgb[2] * cover + raw[i + 2] * keep) * inv);
    raw[i + 3] = Math.round(outA * 255);
  };
  const s = size;
  const body = { x: s * 0.08, y: s * 0.08, w: s * 0.84, h: s * 0.84, r: s * 0.2 };
  const bezel = { x: s * 0.18, y: s * 0.16, w: s * 0.64, h: s * 0.5, r: s * 0.07 };
  const screen = { x: s * 0.22, y: s * 0.2, w: s * 0.56, h: s * 0.42, r: s * 0.05 };
  const bar = { x: s * 0.3, y: s * 0.48, w: s * 0.4, h: Math.max(2, s * 0.035), r: s * 0.02 };
  const neck = { x: s * 0.42, y: s * 0.7, w: s * 0.16, h: s * 0.08, r: s * 0.02 };
  const foot = { x: s * 0.3, y: s * 0.76, w: s * 0.4, h: Math.max(3, s * 0.045), r: s * 0.022 };
  const sunX = s * 0.36;
  const sunY = s * 0.33;
  const sunR = s * 0.055;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const screenCover = cover(sdRoundBox(px, py, screen));
      put(x, y, SAGE, cover(sdRoundBox(px, py, body)));
      put(x, y, CREAM, cover(sdRoundBox(px, py, neck)));
      put(x, y, CREAM, cover(sdRoundBox(px, py, foot)));
      put(x, y, CREAM, cover(sdRoundBox(px, py, bezel)));
      put(x, y, INK, screenCover);
      put(x, y, GOLD, Math.min(cover(Math.hypot(px - sunX, py - sunY) - sunR), screenCover));
      put(x, y, GOLD, Math.min(cover(sdRoundBox(px, py, bar)), screenCover));
    }
  }
  return encodePng(size, raw);
}

// Linux and Raspberry Pi share one Freedesktop entry, on the desktop and in the menu.
export function installLinux(png, home = os.homedir()) {
  const iconDir = path.join(home, ".local", "share", "icons");
  const appsDir = path.join(home, ".local", "share", "applications");
  mkdirSync(iconDir, { recursive: true });
  mkdirSync(appsDir, { recursive: true });
  const iconPath = path.join(iconDir, "monjtv.png");
  writeFileSync(iconPath, png);
  const entry = desktopEntry(iconPath);
  const menuPath = path.join(appsDir, "monjtv.desktop");
  writeFileSync(menuPath, entry);
  const desktop = linuxDesktopDir(home);
  let desktopPath = null;
  if (desktop) {
    desktopPath = path.join(desktop, "monjtv.desktop");
    writeFileSync(desktopPath, entry);
    chmodSync(desktopPath, 0o755);
    try {
      execFileSync("gio", ["set", desktopPath, "metadata::trusted", "true"], { stdio: "ignore" });
    } catch {
      // Raspberry Pi OS trusts an executable .desktop file without gio.
    }
  }
  try {
    execFileSync("update-desktop-database", [appsDir], { stdio: "ignore" });
  } catch {
    // The menu reads the file directly when the cache tool is absent.
  }
  return { menuPath, desktopPath, iconPath };
}

// macOS gets an app bundle on the Desktop. The Dock does not read .desktop files.
export function installDarwin(masterPng, desktopDir = path.join(os.homedir(), "Desktop")) {
  mkdirSync(desktopDir, { recursive: true });
  const appPath = path.join(desktopDir, "monjTV.app");
  rmSync(appPath, { recursive: true, force: true });
  const macOsDir = path.join(appPath, "Contents", "MacOS");
  const resources = path.join(appPath, "Contents", "Resources");
  mkdirSync(macOsDir, { recursive: true });
  mkdirSync(resources, { recursive: true });
  let iconFile = "";
  try {
    writeFileSync(path.join(resources, "monjtv.icns"), icnsFromPng(masterPng));
    iconFile = "monjtv";
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : "";
    console.error(`The app uses the generic icon.${detail ? ` ${detail}` : ""}`);
  }
  writeFileSync(path.join(appPath, "Contents", "Info.plist"), infoPlist(iconFile));
  const exe = path.join(macOsDir, "monjtv");
  writeFileSync(exe, macLauncher());
  chmodSync(exe, 0o755);
  try {
    execFileSync("codesign", ["--force", "--sign", "-", appPath], { stdio: "ignore" });
  } catch {
    // A local bundle can launch without an ad-hoc signature.
  }
  return appPath;
}

// Windows gets a shortcut whose icon is stored beside the launcher script it runs.
export function installWindows(png, desktopDir, localAppData = process.env.LOCALAPPDATA) {
  const dir = path.join(localAppData, "monjTV");
  mkdirSync(dir, { recursive: true });
  mkdirSync(desktopDir, { recursive: true });
  const icoPath = path.join(dir, "monjtv.ico");
  writeFileSync(icoPath, toIco(png, 256));
  const lnkPath = path.join(desktopDir, "monjTV.lnk");
  const powershell = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const args = [
    "-NoProfile",
    "-STA",
    "-WindowStyle",
    "Hidden",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    startPs1,
    "-NodeDir",
    path.dirname(process.execPath),
  ]
    .map(winArg)
    .join(" ");
  const script = shortcutScript(lnkPath, powershell, args, root, `${icoPath},0`);
  const file = path.join(os.tmpdir(), `monjtv-shortcut-${process.pid}.ps1`);
  writeFileSync(file, script);
  try {
    execFileSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file], {
      stdio: "inherit",
    });
  } finally {
    rmSync(file, { force: true });
  }
  return lnkPath;
}

export function toIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

export function shortcutScript(lnkPath, target, args, workdir, iconLocation) {
  return `$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut(${psSingle(lnkPath)})
$lnk.TargetPath = ${psSingle(target)}
$lnk.Arguments = ${psSingle(args)}
$lnk.WorkingDirectory = ${psSingle(workdir)}
$lnk.IconLocation = ${psSingle(iconLocation)}
$lnk.WindowStyle = 7
$lnk.Description = 'monjTV'
$lnk.Save()
`;
}

function main() {
  if (isWsl()) {
    console.error(
      "This shell is WSL. Run node scripts/install-desktop.mjs in Windows so the shortcut lands on the Windows desktop.",
    );
    process.exit(1);
  }
  if (process.platform === "linux") {
    const { menuPath, desktopPath } = installLinux(renderIconPng(256));
    console.log(`${osLabel()}: installed ${desktopPath ?? menuPath}`);
    if (desktopPath) console.log(menuPath);
    return;
  }
  if (process.platform === "darwin") {
    const appPath = installDarwin(renderIconPng(1024));
    console.log(`macOS: installed ${appPath}`);
    return;
  }
  if (process.platform === "win32") {
    const lnkPath = installWindows(renderIconPng(256), windowsDesktop());
    console.log(`Windows: installed ${lnkPath}`);
    return;
  }
  console.error(`There is no desktop icon for ${process.platform}.`);
  process.exit(1);
}

function isWsl() {
  if (process.platform !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

function osLabel() {
  if (process.platform !== "linux") return process.platform;
  try {
    const model = readFileSync("/proc/device-tree/model", "utf8").replaceAll("\0", "").trim();
    if (/raspberry pi/i.test(model)) return model;
  } catch {
    // Desktops other than the Pi have no device-tree model.
  }
  return "Linux";
}

function linuxDesktopDir(home) {
  const config = path.join(home, ".config", "user-dirs.dirs");
  try {
    const text = readFileSync(config, "utf8");
    const match = text.match(/^XDG_DESKTOP_DIR="([^"]*)"/m);
    if (match) {
      const dir = match[1].replaceAll("${HOME}", home).replaceAll("$HOME", home);
      if (existsSync(dir)) return dir;
    }
  } catch {
    // No user-dirs file. Fall through to ~/Desktop.
  }
  const fallback = path.join(home, "Desktop");
  return existsSync(fallback) ? fallback : null;
}

function windowsDesktop() {
  const powershell = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return execFileSync(
    powershell,
    ["-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
    { encoding: "utf8" },
  ).trim();
}

function desktopEntry(iconPath) {
  const pathValue = unixPathDirs().join(":");
  const exec = ["/usr/bin/env", `PATH=${pathValue}`, "/bin/bash", startSh].map(quoteExec).join(" ");
  return `[Desktop Entry]
Version=1.0
Type=Application
Name=monjTV
Comment=Start the TV
Exec=${exec}
Path=${root}
Icon=${iconPath}
Terminal=false
Categories=AudioVideo;Video;
StartupNotify=false
`;
}

function macLauncher() {
  const prefix = unixPathDirs().map(shSingle).join(":");
  return `#!/bin/bash
export PATH=${prefix}:$PATH
exec /bin/bash ${shSingle(startSh)}
`;
}

function unixPathDirs() {
  return [
    ...new Set([
      path.dirname(process.execPath),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      path.join(os.homedir(), ".local", "bin"),
      "/usr/bin",
      "/bin",
    ]),
  ];
}

function infoPlist(iconFile) {
  const icon = iconFile
    ? `  <key>CFBundleIconFile</key>
  <string>${iconFile}</string>
`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>monjTV</string>
  <key>CFBundleDisplayName</key>
  <string>monjTV</string>
  <key>CFBundleIdentifier</key>
  <string>tv.monj.launcher</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleExecutable</key>
  <string>monjtv</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
${icon}</dict>
</plist>
`;
}

function icnsFromPng(png) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "monjtv-icon-"));
  try {
    const source = path.join(dir, "source.png");
    writeFileSync(source, png);
    const iconset = path.join(dir, "monjtv.iconset");
    mkdirSync(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      execFileSync("sips", [
        "-z",
        String(size),
        String(size),
        source,
        "--out",
        path.join(iconset, `icon_${size}x${size}.png`),
      ]);
      execFileSync("sips", [
        "-z",
        String(size * 2),
        String(size * 2),
        source,
        "--out",
        path.join(iconset, `icon_${size}x${size}@2x.png`),
      ]);
    }
    const icns = path.join(dir, "monjtv.icns");
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", icns]);
    return readFileSync(icns);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function sdRoundBox(px, py, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const hx = box.w / 2;
  const hy = box.h / 2;
  const r = Math.min(box.r, hx, hy);
  const qx = Math.abs(px - cx) - hx + r;
  const qy = Math.abs(py - cy) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function cover(dist) {
  const t = 0.5 - dist;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function quoteExec(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value;
  return `"${value.replace(/["\\$`]/g, "\\$&")}"`;
}

function shSingle(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function psSingle(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function winArg(value) {
  if (value.length === 0 || /[\s"]/.test(value)) return `"${value.replaceAll('"', '\\"')}"`;
  return value;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) main();
