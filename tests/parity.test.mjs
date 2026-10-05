/**
 * The parity comparator is the gate every format passes before its fork can retire, so
 * its verdicts are pinned here: a one-pixel colour change fails, path-only differences
 * in sidecars and SVGs pass, and extra brand keys in Stencil's sidecar pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { compareFile, normalizePaths } from "../parity/compare.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "parity-test-"));
const f = (name, text) => {
  const p = path.join(dir, name);
  if (text !== undefined) fs.writeFileSync(p, text);
  return p;
};

function png(name, color, { x = 0, y = 0, dot = null } = {}) {
  const out = f(name);
  const args = ["-size", "40x20", `xc:${color}`];
  if (dot) args.push("-fill", dot, "-draw", `point ${x},${y}`);
  spawnSync("magick", [...args, out]);
  return out;
}

test("identical PNGs are exact; one changed pixel fails", () => {
  const a = png("a.png", "#16232c");
  const b = png("b.png", "#16232c");
  const c = png("c.png", "#16232c", { x: 3, y: 4, dot: "#ffffff" });
  assert.equal(compareFile("out/x@3x.png", a, b).verdict, "exact");
  const r = compareFile("out/x@3x.png", a, c);
  assert.equal(r.verdict, "FAIL");
  assert.match(r.detail, /1 px differ/);
});

test("a resampled PNG within its declared tolerance is close, not failed", () => {
  const a = png("d.png", "#16232c");
  const c = png("e.png", "#16232c", { x: 3, y: 4, dot: "#17242d" });
  const r = compareFile("out/x.png", a, c, [{ match: /^out\/x\.png$/, mae: 0.002 }]);
  assert.equal(r.verdict, "close");
});

test("a different image size always fails", () => {
  const a = png("f.png", "#000000");
  const big = f("g.png");
  spawnSync("magick", ["-size", "41x20", "xc:#000000", big]);
  assert.match(compareFile("out/x.png", a, big, [{ match: /./, mae: 1 }]).detail, /size 40x20 vs 41x20/);
});

test("sidecars compare file names, not where the files live", () => {
  const g = f("g.json", JSON.stringify({ img: "file:///tmp/stencil-parity/Automation/zoom-banner/headshots/Chris.jpg", title: "T" }));
  const s = f("s.json", JSON.stringify({ img: `file://${os.tmpdir()}/stencil-parity-ws/banner/x/Chris.jpg`, title: "T" }));
  assert.equal(compareFile(".gen/x.json", g, s).verdict, "exact");
  const t = f("t.json", JSON.stringify({ img: "file:///tmp/a/Chris.jpg", title: "Other" }));
  assert.match(compareFile(".gen/x.json", g, t).detail, /\$\.title/);
});

test("a Stencil brand object may carry extra keys, never different values", () => {
  const g = f("bg.json", JSON.stringify({ brand: { id: "OBA", accent: "#3d5361" } }));
  const s = f("bs.json", JSON.stringify({ brand: { id: "OBA", accent: "#3d5361", dots: "x" } }));
  const t = f("bt.json", JSON.stringify({ brand: { id: "OBA", accent: "#000000" } }));
  assert.equal(compareFile(".gen/x.json", g, s).verdict, "exact");
  assert.equal(compareFile(".gen/x.json", g, t).verdict, "FAIL");
});

test("SVGs compare as text after path mapping, and name the first differing line", () => {
  assert.equal(normalizePaths(`href="file://${os.tmpdir()}/stencil-parity/a b/x.png"`), 'href="<file:x.png>"');
  const g = f("g.svg", '<svg>\n<rect fill="#16232c"/>\n</svg>');
  const s = f("s.svg", '<svg>\n<rect fill="#16232d"/>\n</svg>');
  const r = compareFile("canva/x.svg", g, s);
  assert.equal(r.verdict, "FAIL");
  assert.match(r.detail, /^line 2:/);
});
