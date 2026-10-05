#!/usr/bin/env node
/**
 * Materialise verbatim moves from scripts/moves.json: write each destination as its fork
 * source with the entry's literal rewrites applied. The manifest is then both the record
 * and the recipe, and scripts/verify-moves.mjs proves nobody edited the result by hand.
 *
 *   node scripts/apply-moves.mjs               write destinations that do not exist yet
 *   node scripts/apply-moves.mjs <dest>...     rewrite these destinations from source
 *
 * Adapted entries are never written: once a file is adapted it is Stencil's code.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC_ROOT = path.dirname(ROOT);
const force = new Set(process.argv.slice(2));
const { moves } = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "moves.json"), "utf8"));

let wrote = 0;
for (const m of moves) {
  if (m.mode !== "verbatim") continue;
  const dest = path.join(ROOT, m.dest);
  if (fs.existsSync(dest) && !force.has(m.dest)) continue;
  let text = fs.readFileSync(path.join(SRC_ROOT, m.src), "utf8");
  for (const [from, to] of m.rewrites || []) {
    if (!text.includes(from)) throw new Error(`${m.dest}: rewrite source not found in ${m.src}: ${JSON.stringify(from)}`);
    text = text.split(from).join(to);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
  if (fs.statSync(path.join(SRC_ROOT, m.src)).mode & 0o111) fs.chmodSync(dest, 0o755);
  console.log(`  wrote ${m.dest}  (from ${m.src}, ${(m.rewrites || []).length} rewrite${(m.rewrites || []).length === 1 ? "" : "s"})`);
  wrote++;
}
console.log(`${wrote} move${wrote === 1 ? "" : "s"} applied`);
