// A file that cannot be read has no measured length.
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { measureDuration } from "./duration.ts";

describe("a file that cannot be timed", () => {
  it("has no measured length, including the next time it is asked", async () => {
    const missing = path.join(os.tmpdir(), `monjtv-missing-${process.pid}.mkv`);
    assert.equal(await measureDuration(missing), null);
    assert.equal(await measureDuration(missing), null);
  });
});
