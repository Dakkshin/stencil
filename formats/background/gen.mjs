#!/usr/bin/env node
/**
 * Build the OBA Zoom host background.
 *
 *   node gen.mjs            # layered SVG + PNG + JPEG
 *   node gen.mjs --svg-only # SVG only (zero-dependency path)
 *
 * The SVG is the single visual source and is always written first; PNG/JPEG come from
 * Chromium via ./render.mjs and are skipped (with a warning) when Chrome is absent —
 * never a hard failure, mirroring the deck's rules.
 *
 * Outputs (both regenerated every run, never hand-edited):
 *   canva/host-background.svg   layered, imports into Canva with named layers
 *   out/host-background.png    1920×1080 PNG  (Zoom: Settings → Backgrounds → +)
 *   out/host-background.jpg    1920×1080 JPEG (smaller, same upload)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANVA as CANVA_DIR } from "../../core/paths.mjs";

import { buildBackgroundSvg } from "./render-svg.mjs";
import { renderBackground } from "./render.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CANVA = CANVA_DIR;

export async function main(argv = process.argv.slice(2)) {
  const svgOnly = argv.includes("--svg-only");
  fs.mkdirSync(CANVA, { recursive: true });

  const svg = buildBackgroundSvg();
  const svgFile = path.join(CANVA, "host-background.svg");
  fs.writeFileSync(svgFile, svg);
  console.log(`  svg: layered -> canva/host-background.svg (${(svg.length / 1048576).toFixed(2)} MB)`);

  if (svgOnly) {
    console.log("  --svg-only: Chromium skipped; run `node gen.mjs` later for PNG/JPEG.");
    return;
  }

  try {
    await renderBackground();
  } catch (err) {
    console.error(`  ! PNG/JPEG render failed (${err.message}) — the SVG is still valid.`);
    console.error("    Re-run `node gen.mjs` once Chrome is available.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
