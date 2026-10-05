/**
 * One GUI for every surface (plan T25). panel-kit is vendored unchanged; the root gen.mjs
 * shim forwards its CLI calls to the format named in STENCIL_FORMAT. These tests start the
 * real server headless for every format that has a schema and read its API.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const formats = fs.readdirSync(path.join(ROOT, "formats")).filter((f) => fs.existsSync(path.join(ROOT, "formats", f, "schema.mjs"))).sort();

test("gen.mjs refuses to run without a format, so it is never mistaken for the CLI", () => {
  const env = { ...process.env };
  delete env.STENCIL_FORMAT;
  const r = spawnSync(process.execPath, [path.join(ROOT, "gen.mjs"), "--list"], { cwd: ROOT, encoding: "utf8", env });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /STENCIL_FORMAT/);
});

for (const format of formats) {
  test(`gen.mjs forwards --list --json to the ${format} format (CONTRACT §2 shape)`, () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "gen.mjs"), "--list", "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, STENCIL_FORMAT: format },
    });
    assert.equal(r.status, 0, r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.tool, format);
    assert.ok(Array.isArray(j.items));
  });

  test(`the ${format} GUI serves its schema headless`, async () => {
    const child = spawn(process.execPath, [path.join(ROOT, "gui.mjs"), format, "0"], {
      cwd: ROOT,
      env: { ...process.env, NO_OPEN: "1" },
    });
    try {
      const url = await new Promise((resolve, reject) => {
        let out = "";
        const timer = setTimeout(() => reject(new Error(`no URL printed:\n${out}`)), 20000);
        child.stdout.on("data", (d) => {
          out += d;
          const m = out.match(/GUI\s+(http:\/\/\S+)/);
          if (m) {
            clearTimeout(timer);
            resolve(m[1].replace(/\/$/, ""));
          }
        });
        child.stderr.on("data", (d) => (out += d));
      });
      const res = await fetch(`${url}/api/schema`);
      assert.equal(res.status, 200);
      const schema = await res.json();
      assert.equal(schema.tool, format);
      assert.ok(Array.isArray(schema.sections) && schema.sections.length > 0);
    } finally {
      child.kill();
    }
  });
}

test("the GUI refuses a custom workspace instead of reading two folders", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "gui.mjs"), "banner"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NO_OPEN: "1", STENCIL_WORKSPACE: "/tmp" },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /serves the Stencil folder/);
});
