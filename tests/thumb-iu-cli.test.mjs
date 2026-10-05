/**
 * Cards thumbnail CLI (ported from iu-podcast-thumbnails/tests/cli-json.test.mjs), run as
 * `node stencil.mjs thumb` against a scratch workspace, so a test never touches real inputs,
 * photos or outputs. Changes from the fork: the tool name is "thumb", the throwaway episodes
 * and photos live in the scratch workspace (episodes/, assets/headshots/) instead of the
 * fork's own folders, and an IU episode is seeded so the inventory is never empty.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-thumb-iu-"));
fs.mkdirSync(path.join(WS, "episodes"));
fs.mkdirSync(path.join(WS, "assets", "headshots"), { recursive: true });
fs.writeFileSync(
  path.join(WS, "episodes", "ep148.toml"),
  `brand = "IU"
mode = "dark"
eyebrow = "Insurance Untangled · Ep 148"
category = "Practice Economics"
hook = "Where the money goes"
title = [ "You negotiated your fees.", "~Did the money reach the bottom line?" ]
[[guests]]
name = "Guest Name"
role = "Practice Owner"
`,
);

const run = (args) =>
  spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "thumb", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, STENCIL_WORKSPACE: WS },
  });

/* Write a throwaway episode TOML, run gen against it, then clean up. */
function withEpisode(name, body, fn) {
  const file = path.join(WS, "episodes", `${name}.toml`);
  fs.writeFileSync(file, body);
  try {
    return fn();
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(path.join(WS, ".gen", `${name}.json`), { force: true });
  }
}

test("--list --json emits the stable inventory shape", () => {
  const r = run(["--list", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.tool, "thumb");
  assert.equal(j.configDir, "episodes");
  assert.ok(Array.isArray(j.items) && j.items.length > 0);
  for (const item of j.items) {
    assert.equal(typeof item.name, "string");
    assert.equal(typeof item.ok, "boolean");
    assert.ok(item.mode === "dark" || item.mode === "light" || item.mode === null);
    assert.ok(Array.isArray(item.problems));
    assert.ok(Array.isArray(item.warnings));
    assert.ok(item.assets && Array.isArray(item.assets.headshots));
    assert.ok(Array.isArray(item.outputs));
  }
});

test("--emit-json writes a sidecar for a valid episode and skips rendering", () => {
  const inv = JSON.parse(run(["--list", "--json"]).stdout);
  const target = inv.items.find((i) => i.ok);
  if (!target) return;
  const r = run([target.name, "--emit-json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.results[0].ok, true);
  assert.ok(fs.existsSync(path.join(WS, j.results[0].genPath)));
});

test("mode defaults to dark and is carried into the normalized config", () => {
  const body = `
eyebrow = "Insurance Untangled · Ep 900"
category = "Test"
title = [ "A headline", "~An accent line" ]
[[guests]]
name = "Test Guest"
`;
  withEpisode("ep900", body, () => {
    const r = run(["ep900", "--emit-json"]);
    assert.equal(r.status, 0, r.stderr);
    const cfg = JSON.parse(fs.readFileSync(path.join(WS, ".gen", "ep900.json"), "utf8"));
    assert.equal(cfg.mode, "dark");
  });
});

test("mode = light is accepted and carried into the normalized config", () => {
  const body = `
mode = "light"
eyebrow = "Insurance Untangled · Ep 901"
category = "Test"
title = [ "A headline" ]
[[guests]]
name = "Test Guest"
`;
  withEpisode("ep901", body, () => {
    const r = run(["ep901", "--emit-json"]);
    assert.equal(r.status, 0, r.stderr);
    const cfg = JSON.parse(fs.readFileSync(path.join(WS, ".gen", "ep901.json"), "utf8"));
    assert.equal(cfg.mode, "light");
  });
});

test("an unknown mode is rejected", () => {
  const body = `
mode = "neon"
eyebrow = "Insurance Untangled · Ep 902"
category = "Test"
title = [ "A headline" ]
[[guests]]
name = "Test Guest"
`;
  withEpisode("ep902", body, () => {
    const r = run(["ep902", "--emit-json"]);
    assert.notEqual(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.equal(j.results[0].ok, false);
    assert.match(JSON.stringify(j.results[0].problems), /mode/);
  });
});

test("a transparent PNG guest is auto-detected as a cut-out; a plain PNG is not", () => {
  /* 1×1 PNGs: colour type 6 (RGBA) and 2 (RGB). */
  const rgba = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  const rgb = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const f1 = path.join(WS, "assets", "headshots", "_t-rgba.png");
  const f2 = path.join(WS, "assets", "headshots", "_t-rgb.png");
  fs.writeFileSync(f1, rgba);
  fs.writeFileSync(f2, rgb);
  try {
    const body = `
eyebrow = "Insurance Untangled · Ep 904"
category = "Test"
title = [ "A headline" ]
[[guests]]
name = "Alpha Guest"
label = "Guest"
photo = "_t-rgba.png"
[[guests]]
name = "Beta Host"
label = "Host"
photo = "_t-rgb.png"
`;
    withEpisode("ep904", body, () => {
      const r = run(["ep904", "--emit-json"]);
      assert.equal(r.status, 0, r.stderr);
      const cfg = JSON.parse(fs.readFileSync(path.join(WS, ".gen", "ep904.json"), "utf8"));
      assert.equal(cfg.guests[0].cutout, true);
      assert.equal(cfg.guests[0].label, "Guest");
      assert.equal(cfg.guests[1].cutout, false);
    });
  } finally {
    fs.rmSync(f1, { force: true });
    fs.rmSync(f2, { force: true });
  }
});

test("company passes through and an em dash in the copy is flagged", () => {
  const body = `
eyebrow = "Insurance Untangled · Ep 905"
category = "Test"
hook = "Money — where it goes"
title = [ "A headline" ]
[[guests]]
name = "Alpha Guest"
role = "Practice Owner"
company = "Smith Dental Group"
`;
  withEpisode("ep905", body, () => {
    const r = run(["ep905", "--emit-json"]);
    assert.equal(r.status, 0, r.stderr);
    const cfg = JSON.parse(fs.readFileSync(path.join(WS, ".gen", "ep905.json"), "utf8"));
    assert.equal(cfg.guests[0].role, "Practice Owner");
    assert.equal(cfg.guests[0].company, "Smith Dental Group");
    assert.match(r.stderr + r.stdout, /em dash in hook/);
  });
});

test("a missing mode on disk still inventories as dark", () => {
  const body = `
eyebrow = "Insurance Untangled · Ep 903"
category = "Test"
title = [ "A headline" ]
[[guests]]
name = "Test Guest"
`;
  withEpisode("ep903", body, () => {
    const j = JSON.parse(run(["--list", "--json"]).stdout);
    const item = j.items.find((i) => i.name === "ep903");
    assert.equal(item.mode, "dark");
  });
});
