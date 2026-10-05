#!/usr/bin/env node
/**
 * cutout.mjs — turn rectangular headshots into transparent cut-outs.
 *
 *   node scripts/cutout.mjs                    # every non-transparent photo in headshots/
 *   node scripts/cutout.mjs naren-arulrajah.jpg manjali.jpeg
 *   node scripts/cutout.mjs --force <photo>    # ignore the cache
 *
 * Writes headshots/cutouts/<stem>-cutout.png. `gen.mjs` automatically prefers a
 * cut-out over the original photo when one exists, so episodes keep referencing
 * the plain headshot.
 *
 * First run creates .venv (rembg + onnxruntime) and downloads the u2net model,
 * which takes a few minutes; results are cached afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCutout, hasAlpha } from "./cutout.mjs";
import { ROOT as STENCIL_ROOT } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = STENCIL_ROOT;
const HEADSHOTS = path.join(ROOT, "assets", "headshots");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function listSources() {
  return fs
    .readdirSync(HEADSHOTS, { withFileTypes: true })
    .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(HEADSHOTS, e.name))
    .filter((f) => !hasAlpha(f)) // already-transparent art needs no removal
    .filter((f) => !/cutout/i.test(path.basename(f)));
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const names = argv.filter((a) => !a.startsWith("-"));

  const sources = names.length
    ? names.map((n) => path.resolve(HEADSHOTS, n))
    : listSources();

  if (!sources.length) {
    console.log("Nothing to do — every headshot already has transparency.");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const src of sources) {
    if (!fs.existsSync(src)) {
      console.warn(`  ! not found: ${path.relative(ROOT, src)}`);
      failed++;
      continue;
    }
    try {
      const dest = await ensureCutout(src, { force });
      if (dest) {
        console.log(`✓ ${path.relative(ROOT, dest)}`);
        ok++;
      } else {
        console.warn(`  ! background removal unavailable; left ${path.basename(src)} as-is`);
        failed++;
      }
    } catch (e) {
      console.error(`  ! ${path.basename(src)}: ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${ok} cut-out(s) ready${failed ? `, ${failed} failed` : ""}.`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
