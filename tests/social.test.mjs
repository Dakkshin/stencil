/**
 * Social format CLI (ported from panel-social-posts/tests/cli-json.test.mjs), run against a
 * scratch workspace so a test never touches real inputs or outputs. Rendering parity with
 * the forks is the parity gate's job (node parity/run.mjs social); these tests pin the CLI
 * contract, the frozen output names and the fork rules that became layout rules.
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
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-social-"));
fs.mkdirSync(path.join(WS, "posts"));

const POST = ({ brand, type = "the_intro", extra = "", event = "" }) => `post_type = "${type}"
brand = "${brand}"
${extra}
eyebrow = "Expert Panel"
category = "Practice Growth · Leadership"
title = ["Know your fees.", "~Then ask."]

[[panelists]]
name = "Jane Doe"
role = "Practice Owner"

[[panelists]]
name = "Sam Roe"
role = "Billing Lead"

[event]
date = "Thu, Oct 22"
time = "8:00 PM EST"
cta = "Register now"
${event}
`;
const write = (name, text) => fs.writeFileSync(path.join(WS, "posts", `${name}.toml`), text);
write("oba-sample", POST({ brand: "OBA", extra: 'formats = ["square"]\ncampaign = "camp"\nperson = "jane-doe"\noutput_name = "Promo_02"' }));
write("oba-twin", POST({ brand: "OBA", extra: 'formats = ["square"]\ncampaign = "camp"\nperson = "sam-roe"\noutput_name = "Promo_02"' }));
write("iu-sample", POST({ brand: "IU", event: 'ce = "1 CE credit"' }));
write("iu-no-ce", POST({ brand: "IU" }));

const run = (args) =>
  spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "social", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, STENCIL_WORKSPACE: WS },
  });
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(WS, rel), "utf8"));

test("--list --json emits the stable inventory shape", () => {
  const r = run(["--list", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.tool, "social");
  assert.equal(j.configDir, "posts");
  assert.ok(Array.isArray(j.items) && j.items.length > 0);
  for (const item of j.items) {
    assert.equal(typeof item.name, "string");
    assert.equal(typeof item.ok, "boolean");
    assert.ok(Array.isArray(item.problems));
    assert.ok(Array.isArray(item.warnings));
    assert.ok(item.assets && Array.isArray(item.assets.headshots));
    assert.ok(Array.isArray(item.outputs));
  }
});

test("--emit-json writes a sidecar for a valid post and skips rendering", () => {
  fs.mkdirSync(path.join(WS, "out"), { recursive: true });
  const before = fs.statSync(path.join(WS, "out")).mtimeMs;
  const r = run(["iu-sample", "--emit-json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.results[0].ok, true);
  assert.ok(fs.existsSync(path.join(WS, j.results[0].genPath)));
  assert.equal(fs.statSync(path.join(WS, "out")).mtimeMs, before, "emit-json must not touch out/");
});

test("the classic design names its sidecar after the output stem, as the OBA fork did", () => {
  const r = run(["oba-sample", "oba-twin", "--emit-json"]);
  assert.equal(r.status, 0, r.stderr);
  const [a, b] = JSON.parse(r.stdout).results;
  assert.equal(a.genPath, ".gen/Promo_02.json");
  assert.equal(b.genPath, ".gen/Promo_02.json", "posts sharing an output_name share a sidecar (the fork's goldens are named so)");
  const cfg = readJson(".gen/Promo_02.json");
  assert.equal(cfg.person, "sam-roe", "the last post built owns it");
  assert.equal("ce" in cfg.event, false, "the classic design carries no CE line");
  assert.equal("cutout" in cfg, false);
});

test("the scene design names its sidecar after the post and carries the CE line", () => {
  const r = run(["iu-sample", "--emit-json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).results[0].genPath, ".gen/iu-sample.json");
  const cfg = readJson(".gen/iu-sample.json");
  assert.equal(cfg.event.ce, "1 CE credit");
  assert.deepEqual(cfg.formats, ["square", "portrait"], "the scene design's default formats");
  assert.equal("cutout" in cfg, false, "--emit-json skips cutouts, as both forks did; a build records cfg.cutout");
});

test("a post in the scene design without a CE line fails with the fork's message", () => {
  const r = run(["iu-no-ce", "--emit-json"]);
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).results[0].problems[0].message, /^"\[event\] ce" is required/);
});

test("--brand beats the file's brand and gets its own name when it differs", () => {
  const r = run(["iu-sample", "--emit-json", "--brand", "iu-light"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).results[0].genPath, ".gen/iu-sample-IU_LIGHT.json");
  assert.equal(readJson(".gen/iu-sample-IU_LIGHT.json").brand, "IU_LIGHT");
});

test("unknown flags exit 2 with the help; a bad --formats or --brand exits 1", () => {
  const bad = run(["--nope"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /Unknown flag: --nope[\s\S]*Usage:/);
  assert.equal(run(["iu-sample", "--formats", "poster"]).status, 1);
  assert.match(run(["iu-sample", "--brand", "DFY"]).stderr, /--brand must be one of/);
});

test("a full build writes exactly the frozen social outputs, nested by campaign and person", () => {
  const r = run(["oba-sample"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const rel of CONTRACT.social("Promo_02", { stem: "Promo_02", formats: ["square"], campaign: "camp", person: "jane-doe" })) {
    assert.ok(fs.existsSync(path.join(WS, rel)), `${rel} missing`);
  }
  const svg = fs.readFileSync(path.join(WS, "canva", "camp", "jane-doe", "square", "Promo_02.svg"), "utf8");
  assert.match(svg, /^<\?xml/);
  const inv = JSON.parse(run(["--list", "--json"]).stdout).items.find((i) => i.name === "oba-sample");
  assert.deepEqual(inv.outputs.sort(), [".gen/Promo_02.json", "canva/camp/jane-doe/square/Promo_02.svg", "out/camp/jane-doe/square/Promo_02@2x.png"]);
});

test("an IU post renders both canvases with its PACE plate and CE seal", () => {
  const r = run(["iu-sample"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const rel of CONTRACT.social("iu-sample", { formats: ["square", "portrait"] })) assert.ok(fs.existsSync(path.join(WS, rel)), `${rel} missing`);
  const svg = fs.readFileSync(path.join(WS, "canva", "iu-sample-square.svg"), "utf8");
  assert.ok(svg.includes('data-name="PACE plate"') && svg.includes('data-name="Stamp seal"'));
  assert.equal(readJson(".gen/iu-sample.json").cutout, true, "the scene cuts photos out itself; gen records that it may");
});

test("VET, a legacy pack with no real social input, renders through the classic design", () => {
  write("vet-sample", POST({ brand: "VET", extra: 'formats = ["square"]' }));
  const r = run(["vet-sample"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const svg = fs.readFileSync(path.join(WS, "canva", "vet-sample-square.svg"), "utf8");
  assert.match(svg, /id="brand-wordmark"[^>]*>VBI</, "no VBI logo file exists, so the wordmark renders");
  assert.match(svg, /fill="#E6F20A"/, "VET's lime accent");
  assert.ok(fs.existsSync(path.join(WS, "out", "vet-sample-square@2x.png")));
});

test("format-level social code never tests a brand id; brands differ by pack data and layout rules", () => {
  const files = ["gen.mjs", "qr.mjs", "schema.mjs", "layouts/classic/brands.mjs", "layouts/classic/render-png.mjs", "layouts/scene/render-png.mjs"];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, "formats", "social", f), "utf8");
    assert.doesNotMatch(src, /\bbrandId\s*===|includes\("LIGHT"\)|startsWith\("IU"\)|=== "(IU|OBA|VET|IU_LIGHT|OBA_LIGHT)"/, `${f} tests a brand id`);
  }
});
