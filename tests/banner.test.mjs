/**
 * Banner format CLI (ported from zoom-banner/tests/cli-json.test.mjs), run against a
 * scratch workspace so a test never touches real inputs or outputs. Rendering parity
 * with the forks is the parity gate's job (node parity/run.mjs banner); these tests pin
 * the CLI contract, the output names and the IU rule that moved into pack data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-banner-"));
fs.mkdirSync(path.join(WS, "panels"));

const PANEL = (brand, extra = "") => `brand = "${brand}"
title = "Fee Schedule ~Reset~"
date = "Oct 22 · 1PM ET"
${extra}
[[panelists]]
name = "Jane Doe"
role = "Practice Owner"

[[panelists]]
name = "Sam Roe"
role = "Billing Lead"
`;
fs.writeFileSync(path.join(WS, "panels", "oba-sample.toml"), PANEL("OBA"));
fs.writeFileSync(path.join(WS, "panels", "iu-sample.toml"), PANEL("IU", 'ce = "1 CE credit"'));
fs.writeFileSync(path.join(WS, "panels", "iu-no-ce.toml"), PANEL("IU"));

const run = (args) =>
  spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "banner", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, STENCIL_WORKSPACE: WS },
  });

test("--list --json emits the stable inventory shape", () => {
  const r = run(["--list", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.tool, "banner");
  assert.equal(j.configDir, "panels");
  assert.equal(j.items.length, 3);
  for (const item of j.items) {
    assert.equal(typeof item.name, "string");
    assert.equal(typeof item.ok, "boolean");
    assert.ok(Array.isArray(item.problems));
    assert.ok(Array.isArray(item.warnings));
    assert.ok(item.assets && Array.isArray(item.assets.headshots));
    assert.ok(Array.isArray(item.outputs));
  }
});

test("--emit-json writes a sidecar for a valid panel and skips rendering", () => {
  const r = run(["oba-sample", "--emit-json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.results[0].ok, true);
  const cfg = JSON.parse(fs.readFileSync(path.join(WS, j.results[0].genPath), "utf8"));
  assert.equal(cfg.brandId, "OBA");
  assert.equal(cfg.eyebrow, "Expert Panel Webinar Series");
  assert.equal("ce" in cfg, false, "the OBA layout never carried a CE line");
  assert.equal(fs.existsSync(path.join(WS, "out")), false);
});

test("an IU panel takes the IU eyebrow and keeps its CE line (pack data, not code)", () => {
  const r = run(["iu-sample", "--emit-json"]);
  assert.equal(r.status, 0, r.stderr);
  const cfg = JSON.parse(fs.readFileSync(path.join(WS, ".gen", "iu-sample.json"), "utf8"));
  assert.equal(cfg.eyebrow, "Insurance Untangled · Live");
  assert.equal(cfg.ce, "1 CE credit");
  assert.equal(cfg.brand.logoH, 22, "the banner's own logo height override");
});

test("an IU panel without a CE line fails with the fork's message", () => {
  const r = run(["iu-no-ce", "--emit-json"]);
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).results[0].problems[0].message, /^"ce" is required for IU/);
});

test("--brand overrides the file's brand", () => {
  const r = run(["oba-sample", "--emit-json", "--brand", "vet"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(WS, ".gen", "oba-sample.json"), "utf8")).brandId, "VET");
});

test("a full build writes exactly the frozen banner outputs", async () => {
  const { CONTRACT } = await import("../core/contract.mjs");
  const r = run(["oba-sample"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const rel of CONTRACT.banner("oba-sample")) assert.ok(fs.existsSync(path.join(WS, rel)), `${rel} missing`);
  const svg = fs.readFileSync(path.join(WS, "canva", "oba-sample.svg"), "utf8");
  assert.match(svg, /^<svg|^<\?xml/);
});

test("the banner designs never test a brand id; brands differ only by pack data", () => {
  const dir = path.join(ROOT, "formats", "banner", "layouts");
  for (const layout of fs.readdirSync(dir)) {
    for (const f of fs.readdirSync(path.join(dir, layout))) {
      const src = fs.readFileSync(path.join(dir, layout, f), "utf8");
      assert.doesNotMatch(src, /\bbrandId\b|includes\("LIGHT"\)|startsWith\("IU"\)|=== "(IU|OBA|VET)/, `${layout}/${f} tests a brand id`);
    }
  }
});

test("VET, a legacy pack with no real banner input, renders through the centre design", () => {
  fs.writeFileSync(path.join(WS, "panels", "vet-sample.toml"), PANEL("VET"));
  const r = run(["vet-sample"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const svg = fs.readFileSync(path.join(WS, "canva", "vet-sample.svg"), "utf8");
  assert.match(svg, /<!-- VBI Zoom banner/);
  assert.match(svg, /fill="#e2b552"/, "the centre design's warm title accent");
  assert.ok(fs.existsSync(path.join(WS, "out", "vet-sample.png")));
});
