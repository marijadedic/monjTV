import { execFile, execFileSync } from "node:child_process";
import { PORT } from "../shared/constants.ts";

const MAC_BROWSERS = [
  "Safari",
  "Google Chrome",
  "Chromium",
  "Brave Browser",
  "Microsoft Edge",
  "Arc",
];

// Ports whose monjTV tabs should close. The page may be the dev server, not the API port.
export function portsFrom(origin: string): number[] {
  const ports = new Set<number>([PORT]);
  try {
    const url = new URL(origin);
    const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
    if (port && port !== 80 && port !== 443) ports.add(port);
  } catch {
    // A shutdown with no Origin still closes tabs on the API port.
  }
  return [...ports];
}

// Close monjTV tabs in the browsers running on this machine.
export function closeAppTabs(ports: number[]): Promise<void> {
  if (process.platform === "darwin") return closeMacTabs(ports);
  if (process.platform === "linux") return closeLinuxTabs();
  if (process.platform === "win32") return closeWindowsTabs();
  return Promise.resolve();
}

// Ask each running Mac browser to close tabs pointed at this app.
async function closeMacTabs(ports: number[]): Promise<void> {
  if (isRunning("firefox")) await closeFirefoxFrontTab();
  const running = MAC_BROWSERS.filter(isRunning);
  const match = ports.map((port) => `u contains ":${port}"`).join(" or ");
  for (const name of running) {
    const source = `tell application ${JSON.stringify(name)}
  if it is running then
    set windowCount to count of windows
    repeat with wi from windowCount to 1 by -1
      set tabCount to count of tabs of window wi
      repeat with i from tabCount to 1 by -1
        set u to (URL of tab i of window wi)
        if ${match} then close tab i of window wi
      end repeat
    end repeat
  end if
end tell`;
    await run("osascript", ["-e", source], 8000);
  }
}

// Firefox hides its windows from scripting. If the click is in Firefox, close that front tab.
function closeFirefoxFrontTab(): Promise<void> {
  const source = `tell application "System Events"
  if (name of first process whose frontmost is true) is not "firefox" then return
  keystroke "w" using command down
end tell`;
  return run("osascript", ["-e", source], 3000);
}

// Close windows whose title is the monjTV page. Linux has no shared tab API.
function closeLinuxTabs(): Promise<void> {
  return run("wmctrl", ["-c", "monjTV"], 3000).then(() =>
    run("xdotool", ["search", "--name", "monjTV", "windowclose"], 3000),
  );
}

// Close visible windows titled monjTV.
function closeWindowsTabs(): Promise<void> {
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class MonjTabs {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr w, IntPtr l);
  public static void CloseMatching(string needle) {
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      if (sb.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0)
        PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero);
      return true;
    }, IntPtr.Zero);
  }
}
'@
[MonjTabs]::CloseMatching('monjTV')
`;
  const powershell = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  return run(powershell, ["-NoProfile", "-STA", "-Command", script], 8000);
}

// True when a browser process with this exact name is running.
function isRunning(name: string): boolean {
  try {
    execFileSync("pgrep", ["-x", name], { stdio: "ignore", timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

function run(file: string, args: string[], timeout: number): Promise<void> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout }, () => resolve());
  });
}
