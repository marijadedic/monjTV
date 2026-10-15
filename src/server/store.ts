import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// True when a filesystem call failed because the path is absent.
function missingFile(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

// Parse a JSON file. A missing or empty file is created from the fallback.
// Invalid JSON returns the fallback and is left on disk.
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, "utf8");
    if (raw.trim() === "") {
      await writeJson(file, fallback);
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    if (missingFile(err)) await writeJson(file, fallback);
    return fallback;
  }
}

// Write JSON atomically via a temporary file.
export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}
