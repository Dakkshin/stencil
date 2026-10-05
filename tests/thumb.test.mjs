/**
 * Thumb format CLI, run as `node stencil.mjs thumb` against a scratch workspace so a test never
 * touches real inputs or outputs. The first two tests are podcast-thumbnails'
 * tests/cli-json.test.mjs (tool name "thumb"); the IU fork's CLI tests are
 * tests/thumb-iu-cli.test.mjs. The rest pin what the merge added: one CLI routing two designs
 * by brand pack, the cards ground rule, the frozen output names, and the generated cards
 * template. Rendering parity with the forks is the parity gate's job
 * (node parity/run.mjs thumb).
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
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-thumb-"));
fs.mkdirSync(path.join(WS, "episodes"));

const EPISODE = (head, guests = 2) => `${head}
eyebrow = "Podcast 001"
category = "Practice Growth"
title = [
  "Building a",
  "~successful practice.",
]
${Array.from({ length: guests }, (_, i) => `
[[guests]]
name = "Guest Number${i + 1}"
role = "Practice Owner"
`).join("")}`;

const episodes = {
  "oba-sample": EPISODE('brand = "OBA"'),
  "iu-sample": EPISODE('brand = "IU"'),
  "iu-light-sample": EPISODE('brand = "IU_LIGHT"'),
  "iu-legacy-light": EPISODE('brand = "IU"\nmode = "light"'),
  "iu-light-dark": EPISODE('brand = "IU_LIGHT"\nmode = "dark"'),
  "no-brand": EPISODE(""),
};
for (const [name, body] of Object.entries(episodes)) fs.writeFileSync(path.join(WS, "episodes", `${name}.toml`), body);

const run = (args) =>
  spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "thumb", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, STENCIL_WORKSPACE: WS },
  });

const sidecar = (name) => JSON.parse(fs.readFileSync(path.join(WS, ".gen", `${name}.json`), "utf8"));
const emit = (name, ...flags) => {
  const r = run([name, "--emit-json", ...flags]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return sidecar(name);
};

/* Width and height from a PNG's IHDR chunk. */
function pngSize(file) {
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
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
  assert.equal(fs.existsSync(path.join(WS, "canva")), false);
  assert.equal(fs.existsSync(path.join(WS, "preview")), false);
});

test("the brand picks the design: OBA writes the classic sidecar, IU the cards one", () => {
  const oba = emit("oba-sample");
  assert.deepEqual(Object.keys(oba), ["eyebrow", "title", "category", "guests", "output"]);
  assert.deepEqual(Object.keys(oba.guests[0]), ["name", "role", "short", "img"]);
  const iu = emit("iu-sample");
  assert.deepEqual(Object.keys(iu), ["mode", "eyebrow", "title", "category", "hook", "guests", "output"]);
  assert.equal(iu.guests[0].cutout, false);
  assert.equal("brand" in iu || "brand" in oba, false, "neither fork's sidecar carried a brand object");
  assert.equal(emit("no-brand").mode, "dark", "a file with no brand takes the default, IU");
});

test("IU_LIGHT selects the light ground; a legacy mode key still works", () => {
  assert.equal(emit("iu-sample").mode, "dark");
  assert.equal(emit("iu-light-sample").mode, "light", "the pack's mode when the file has none");
  assert.equal(emit("iu-legacy-light").mode, "light", "the file's own mode key");
  assert.equal(emit("iu-light-dark").mode, "dark", "without --brand the file's mode beats the pack's");
});

test("--brand beats the file's brand, and its pack's mode beats the file's", () => {
  assert.equal(emit("iu-sample", "--brand", "iu_light").mode, "light");
  assert.equal(emit("iu-legacy-light", "--brand", "IU").mode, "dark");
  assert.equal("mode" in emit("iu-sample", "--brand", "OBA"), false, "OBA renders the classic design");
  assert.equal(emit("oba-sample", "--brand", "IU").mode, "dark");
});

test("--list --json reports each episode's ground and its own brand's outputs", () => {
  const items = Object.fromEntries(JSON.parse(run(["--list", "--json"]).stdout).items.map((i) => [i.name, i]));
  assert.equal(items["oba-sample"].mode, null, "the classic design has one ground");
  assert.equal(items["iu-sample"].mode, "dark");
  assert.equal(items["iu-light-sample"].mode, "light");
  assert.equal(items["iu-legacy-light"].mode, "light");
});

test("an unknown brand, or a brand with no thumb design, fails validation", () => {
  let r = run(["oba-sample", "--emit-json", "--brand", "nope"]);
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).results[0].problems[0].message, /^unknown brand "nope"/);
  r = run(["oba-sample", "--emit-json", "--brand", "VET"]);
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).results[0].problems[0].message, /brand VET has no thumb design/);
});

test("unknown flags exit 2 with the usage, as both forks did", () => {
  const r = run(["oba-sample", "--bogus"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Unknown flag: --bogus/);
  assert.match(r.stderr, /--speakers N/);
});

test("--speakers pads with placeholder tiles", () => {
  const cfg = emit("oba-sample", "--speakers", "4");
  assert.equal(cfg.guests.length, 4);
  assert.deepEqual(cfg.guests[3], { name: "", role: "", img: "", placeholder: true });
  assert.equal(run(["oba-sample", "--speakers", "0"]).status, 1);
});

test("a full build writes exactly the frozen thumb outputs for both designs", () => {
  const r = run(["oba-sample", "iu-light-sample"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const [name, prefix] of [["oba-sample", "OBA"], ["iu-light-sample", "IU"]]) {
    for (const rel of CONTRACT.thumb(name, { prefix })) assert.ok(fs.existsSync(path.join(WS, rel)), `${rel} missing`);
    assert.deepEqual(pngSize(path.join(WS, "preview", `${name}.png`)), [2560, 1440]);
  }
  assert.match(fs.readFileSync(path.join(WS, "canva", "OBA-oba-sample.svg"), "utf8"), /^<\?xml[\s\S]*OBA podcast thumbnail/);
  assert.match(fs.readFileSync(path.join(WS, "canva", "IU-iu-light-sample.svg"), "utf8"), /1280×720, light theme/);
});

test("--svg-only keeps the SVG and skips the PNG", () => {
  const r = run(["iu-sample", "--svg-only"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(fs.existsSync(path.join(WS, "canva", "IU-iu-sample.svg")));
  assert.equal(fs.existsSync(path.join(WS, "preview", "iu-sample.png")), false);
});

test("the classic preview is the capture two browser sessions agree on", async () => {
  const { agreedCapture } = await import("../formats/thumb/render-png.mjs");
  const [A, B, C] = ["a", "b", "c"].map((s) => Buffer.from(s));
  const from = (...bufs) => () => Promise.resolve(bufs.shift());
  assert.deepEqual(await agreedCapture(from(A, B), 1), { buf: A, captures: 1, agreed: true }, "one capture when one is asked for");
  assert.deepEqual(await agreedCapture(from(A, A, B), 2), { buf: A, captures: 2, agreed: true });
  assert.deepEqual(await agreedCapture(from(B, A, A), 2), { buf: A, captures: 3, agreed: true }, "an odd first capture is outvoted");
  assert.deepEqual(await agreedCapture(from(A, B, B), 2), { buf: B, captures: 3, agreed: true });
  assert.deepEqual(await agreedCapture(from(A, B, C), 2), { buf: A, captures: 3, agreed: false }, "no agreement keeps the first");
  const { pngAgreement } = await import("../formats/thumb/layouts/classic/index.mjs");
  const cards = await import("../formats/thumb/layouts/cards/index.mjs");
  assert.equal(pngAgreement, 2);
  assert.equal(cards.pngAgreement, undefined, "the cards template embeds static fonts: one capture");
});

test("the thumb designs never test a brand id; brands differ only by pack data", () => {
  const scan = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? scan(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const thumb = path.join(ROOT, "formats", "thumb");
  for (const file of scan(thumb).filter((f) => /\.(mjs|html)$/.test(f))) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(thumb, file);
    assert.doesNotMatch(src, /includes\("LIGHT"\)|startsWith\("IU"\)|[!=]==? ?"(IU|IU_LIGHT|OBA|OBA_LIGHT|VET)"/, `${rel} tests a brand id`);
    if (rel.startsWith("layouts")) assert.doesNotMatch(src, /\bbrandId\b/, `${rel} reads the brand id`);
  }
});

/* A throwaway copy of what build-template.mjs needs (core/paths.mjs, the pooled fonts and
   logos, the cards folder), so the drift check can be exercised without editing the repo. */
function cardsSandbox() {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-thumb-cards-"));
  for (const rel of ["core/paths.mjs", "assets/fonts", "assets/logos", "formats/thumb/layouts/cards"]) {
    fs.cpSync(path.join(ROOT, rel), path.join(box, rel), { recursive: true, filter: (src) => !/template\.html(\.lock\.tmp)?$/.test(src) });
  }
  return box;
}

test("the cards template builds from the pooled fonts and logos, and refuses CSS drift", () => {
  const box = cardsSandbox();
  const cards = path.join(box, "formats", "thumb", "layouts", "cards");
  let r = spawnSync(process.execPath, [path.join(cards, "build-template.mjs")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(cards, "template.html"), "utf8");
  assert.ok(html.includes("const IU_GEOM = "), "geometry inlined");
  assert.ok(html.includes("font/woff2;base64,"), "fonts inlined");
  assert.equal(html.includes("__LOGO_DATA_URI__"), false, "logos inlined");

  const src = path.join(cards, "template.src.html");
  fs.writeFileSync(src, fs.readFileSync(src, "utf8").replace("padding: 72px 64px;", "padding: 70px 64px;"));
  r = spawnSync(process.execPath, [path.join(cards, "build-template.mjs")], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /has drifted from lib\/geometry\.mjs[\s\S]*canvas safe padding/);
  fs.rmSync(box, { recursive: true, force: true });
});
