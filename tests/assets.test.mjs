/**
 * The single asset pool replaces every fork's sibling reach. These tests pin the lookup
 * order and prove a workspace moves content but never the instrument (fonts, logos).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-ws-"));
process.env.STENCIL_WORKSPACE = WS;

const paths = await import("../core/paths.mjs");
const assets = await import("../core/assets.mjs");

function touch(file, text = "x") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test("the workspace moves inputs and outputs, not fonts or logos", () => {
  assert.equal(paths.WORKSPACE, WS);
  assert.equal(paths.GEN, path.join(WS, ".gen"));
  assert.equal(paths.inputDir("banner"), path.join(WS, "panels"));
  assert.equal(paths.FONTS, path.join(ROOT, "assets", "fonts"));
  assert.equal(paths.LOGOS, path.join(ROOT, "assets", "logos"));
  assert.deepEqual(paths.poolDirs("headshots"), [path.join(WS, "assets", "headshots"), path.join(ROOT, "assets", "headshots")]);
});

test("lookup order: data URI, absolute, local, workspace pool, repo pool, relative", () => {
  assert.equal(assets.resolvePhoto("data:image/png;base64,AA"), "data:image/png;base64,AA");
  const abs = path.join(WS, "abs.jpg");
  touch(abs);
  assert.equal(assets.resolvePhoto(abs), abs);
  assert.equal(assets.resolvePhoto(path.join(WS, "missing.jpg")), "");

  const local = path.join(WS, "local");
  touch(path.join(local, "a.jpg"));
  touch(path.join(WS, "assets", "headshots", "a.jpg"));
  assert.equal(assets.resolvePhoto("a.jpg", { local: [local] }), path.join(local, "a.jpg"));
  assert.equal(assets.resolvePhoto("a.jpg"), path.join(WS, "assets", "headshots", "a.jpg"));

  touch(path.join(WS, "rel", "b.jpg"));
  assert.equal(assets.resolvePhoto("rel/b.jpg"), path.join(WS, "rel", "b.jpg"));
  assert.equal(assets.resolvePhoto("nope.jpg"), "");
  assert.equal(assets.resolvePhoto(""), "");
});

test("photoStem drops campaign bookkeeping and slugifies", () => {
  assert.equal(assets.photoStem("Chris Bonsall_OBA_17.09.2026.jpeg"), "chris-bonsall");
  assert.equal(assets.photoStem("chris-bonsall.jpg"), "chris-bonsall");
  assert.equal(assets.photoStem("Chris Bonsall.png"), "chris-bonsall");
});

test("the speaker index skips cutouts and prefers a framed photo", () => {
  const dir = path.join(WS, "assets", "headshots");
  touch(path.join(dir, "jane-doe-cutout.png"));
  touch(path.join(dir, "Jane Doe_IU_01.10.2026.jpeg"));
  assert.equal(assets.resolveSpeakerPhoto("jane-doe"), path.join(dir, "Jane Doe_IU_01.10.2026.jpeg"));
  assert.equal(assets.resolveSpeakerPhoto("no-one", "jane-doe-cutout.png"), path.join(dir, "jane-doe-cutout.png"));
});

test("panelist profiles resolve from local dirs, then the pools", () => {
  touch(path.join(WS, "assets", "panelists", "jane-doe.toml"), 'name = "Jane"\n');
  assert.equal(assets.resolvePanelist("jane-doe"), path.join(WS, "assets", "panelists", "jane-doe.toml"));
  assert.equal(assets.resolvePanelist("nobody"), "");
});

test("core never reaches into a sibling folder", () => {
  for (const f of fs.readdirSync(path.join(ROOT, "core")).filter((f) => f.endsWith(".mjs"))) {
    const code = fs
      .readFileSync(path.join(ROOT, "core", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /"\.\.", "|oba-website|\.\.\/\.\.\//, `${f} reaches outside the repo`);
  }
});
