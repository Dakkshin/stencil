/**
 * Host background format: the fixed Zoom background (from g-slides/host-background),
 * built into a scratch workspace. Parity with the fork: node parity/run.mjs background.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONTRACT } from "../core/contract.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-bg-"));
const run = (args) =>
  spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "background", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120000,
    env: { ...process.env, STENCIL_WORKSPACE: WS },
  });

test("--svg-only writes the layered SVG and skips Chrome", () => {
  const r = run(["--svg-only"]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(WS, "canva", "host-background.svg")));
  assert.equal(fs.existsSync(path.join(WS, "out", "host-background.png")), false);
});

test("a full build writes exactly the frozen background outputs", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  for (const rel of CONTRACT.background()) assert.ok(fs.existsSync(path.join(WS, rel)), `${rel} missing`);
});
