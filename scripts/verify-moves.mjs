#!/usr/bin/env node
/**
 * Prove that moved code is still the fork's code.
 *
 * Stencil folds seven repos by moving their renderers, not rewriting them. Every moved
 * file is listed in scripts/moves/<area>.json (one file per format, so parallel lanes
 * never edit the same manifest). A `verbatim` entry must equal its fork source
 * byte for byte once the entry's declared `rewrites` (literal [from, to] pairs, applied
 * in order to every occurrence) are applied. An `adapted` entry is provenance only.
 *
 * A missing source is reported and skipped, not failed: once a fork is retired the
 * manifest stays as history.
 *
 *   node scripts/verify-moves.mjs [--manifest <file>] [--src-root <dir>] [--dest-root <dir>]
 *
 * The forks are found at STENCIL_SOURCES, else the folder above this repo.
 *
 * Exit 0 when every verbatim entry matches, 1 otherwise (with a unified diff).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? path.resolve(process.argv[i + 1]) : fallback;
}

const manifest = arg("--manifest", "");
const srcRoot = arg("--src-root", path.resolve(process.env.STENCIL_SOURCES || path.dirname(ROOT)));
const destRoot = arg("--dest-root", ROOT);

const MOVES_DIR = path.join(ROOT, "scripts", "moves");
const files = manifest ? [manifest] : fs.readdirSync(MOVES_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(MOVES_DIR, f));
const moves = files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).moves || []);
let failed = 0;
let verified = 0;
const skipped = [];

for (const m of moves) {
  const dest = path.join(destRoot, m.dest);
  if (!fs.existsSync(dest)) {
    console.error(`✖ ${m.dest}: destination missing`);
    failed++;
    continue;
  }
  if (m.mode !== "verbatim") continue;

  const src = path.join(srcRoot, m.src);
  if (!fs.existsSync(src)) {
    skipped.push(m.src);
    continue;
  }
  let expected = fs.readFileSync(src, "utf8");
  for (const [from, to] of m.rewrites || []) {
    if (!expected.includes(from)) {
      console.error(`✖ ${m.dest}: rewrite source not found in ${m.src}: ${JSON.stringify(from)}`);
      failed++;
    }
    expected = expected.split(from).join(to);
  }
  const actual = fs.readFileSync(dest, "utf8");
  if (actual === expected) {
    verified++;
    continue;
  }
  failed++;
  const tmp = path.join(os.tmpdir(), `verify-moves-${process.pid}-${verified + failed}`);
  fs.writeFileSync(tmp, expected);
  const diff = spawnSync("diff", ["-u", "--label", `${m.src} (+rewrites)`, "--label", m.dest, tmp, dest], { encoding: "utf8" });
  fs.rmSync(tmp, { force: true });
  console.error(`✖ ${m.dest} differs from ${m.src}:\n${diff.stdout.split("\n").slice(0, 40).join("\n")}`);
}

if (skipped.length) console.log(`  skipped ${skipped.length} entr${skipped.length === 1 ? "y" : "ies"} whose fork source is gone: ${skipped.join(", ")}`);
console.log(`${failed ? "✖" : "✔"} moves: ${verified} verbatim verified, ${failed} failed, ${moves.length} listed`);
process.exit(failed ? 1 : 0);
