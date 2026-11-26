// Which ports a shutdown closes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PORT } from "../../shared/constants.ts";
import { portsFrom } from "./tabs.ts";

describe("shutdown ports", () => {
  it("always includes the API port", () => {
    assert.ok(portsFrom("http://localhost:5173").includes(PORT));
    assert.ok(portsFrom("").includes(PORT));
  });

  it("adds the dev server port when the page is served from there", () => {
    const ports = portsFrom("http://127.0.0.1:5173/schedule");
    assert.ok(ports.includes(PORT));
    assert.ok(ports.includes(5173));
  });

  it("stays on the API port when the origin is missing or junk", () => {
    assert.deepEqual(portsFrom(""), [PORT]);
    assert.deepEqual(portsFrom("not a url"), [PORT]);
  });
});
