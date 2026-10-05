/**
 * scripts/verify-moves.mjs is the review for every file moved out of a fork (plan AD-4).
 * These tests pin its three verdicts, then run it on the real manifest so a hand edit to
 * a verbatim-moved file fails `node --test tests/`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const VERIFY = path.join(ROOT, "scripts", "verify-moves.mjs");

function run(args) {
  return spawnSync(process.execPath, [VERIFY, ...args], { encoding: "utf8" });
}

function sandbox(destText, rewrites = [["./lib/a.mjs", "../core/a.mjs"]]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moves-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.mkdirSync(path.join(dir, "dest"));
  fs.writeFileSync(path.join(dir, "src", "f.mjs"), 'import x from "./lib/a.mjs";\nexport default x;\n');
  fs.writeFileSync(path.join(dir, "dest", "f.mjs"), destText);
  fs.writeFileSync(path.join(dir, "m.json"), JSON.stringify({ moves: [{ src: "f.mjs", dest: "f.mjs", mode: "verbatim", rewrites }] }));
  return ["--manifest", path.join(dir, "m.json"), "--src-root", path.join(dir, "src"), "--dest-root", path.join(dir, "dest")];
}

test("a verbatim move that equals its source after rewrites passes", () => {
  const r = run(sandbox('import x from "../core/a.mjs";\nexport default x;\n'));
  assert.equal(r.status, 0, r.stderr);
});

test("a hand edit to a verbatim move fails with a diff", () => {
  const r = run(sandbox('import x from "../core/a.mjs";\nexport default x + 1;\n'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /export default x \+ 1/);
});

test("a declared rewrite that no longer matches the source fails", () => {
  const r = run(sandbox('import x from "./lib/a.mjs";\nexport default x;\n', [["./lib/gone.mjs", "x"]]));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /rewrite source not found/);
});

test("the real manifest verifies", () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
