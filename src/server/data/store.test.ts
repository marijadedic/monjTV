// JSON on disk. A missing or empty file is created. Invalid JSON stays where it is.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { readJson, writeJson } from "./store.ts";

const dir = await mkdtemp(path.join(os.tmpdir(), "monjtv-"));
after(() => rm(dir, { recursive: true, force: true }));

describe("a JSON file", () => {
  const fallback = { blocks: [] as string[] };

  it("creates a missing file from the fallback", async () => {
    const file = path.join(dir, "missing", "schedule.json");
    assert.deepEqual(await readJson(file, fallback), fallback);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), fallback);
  });

  it("creates an empty file from the fallback", async () => {
    const file = path.join(dir, "empty.json");
    await writeFile(file, "  \n");
    assert.deepEqual(await readJson(file, fallback), fallback);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), fallback);
  });

  it("keeps invalid JSON on disk and uses the fallback in memory", async () => {
    const file = path.join(dir, "broken.json");
    await writeFile(file, "{");
    assert.deepEqual(await readJson(file, { blocks: ["kept"] }), { blocks: ["kept"] });
    assert.equal(await readFile(file, "utf8"), "{");
  });

  it("reads back what was written", async () => {
    const file = path.join(dir, "saved.json");
    await writeJson(file, { blocks: ["evening"] });
    assert.deepEqual(await readJson(file, fallback), { blocks: ["evening"] });
  });
});
