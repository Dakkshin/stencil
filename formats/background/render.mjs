#!/usr/bin/env node
/**
 * Rasterize the host background to PNG and JPEG at exactly 1920×1080.
 *
 *   node render.mjs [--png-only]        # skip the JPEG
 *
 * Reuses the deck's dumb shell (../shell.html) and chromium resolution
 * (../lib/chromium.mjs). The SVG built by ./render-svg.mjs is the only visual source;
 * this file never builds a layout. Captures via CDP with an explicit clip — never
 * locator.screenshot(), which clips to the viewport and drops edge strokes.
 *
 * Failing here is not fatal to a build: gen.mjs writes the SVG first, so a machine
 * without Chromium still produces usable artwork.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { launch } from "../deck/lib/chromium.mjs";
import { CANVAS } from "../deck/lib/geometry.mjs";
import { OUT as OUT_DIR } from "../../core/paths.mjs";
import { buildBackgroundSvg } from "./render-svg.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = OUT_DIR;

const SHELL = path.join(HERE, "..", "deck", "shell.html");

function parseArgs(argv) {
  return { pngOnly: argv.includes("--png-only") };
}

/** Screenshot via CDP with an explicit clip; scale stays 1 so the PNG is exactly
    1920×1080 — the Zoom-spec size, not a retina multiple. */
async function capture(page, format, quality) {
  const cdp = await page.context().newCDPSession(page);
  const opts = {
    format,
    clip: { x: 0, y: 0, width: CANVAS.w, height: CANVAS.h, scale: 1 },
  };
  if (format === "jpeg") opts.quality = quality;
  const { data } = await cdp.send("Page.captureScreenshot", opts);
  return Buffer.from(data, "base64");
}

export async function renderBackground({ pngOnly = false } = {}) {
  const svg = buildBackgroundSvg();
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS.w, height: CANVAS.h },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(SHELL).href, { waitUntil: "domcontentloaded" });
    await page.evaluate((s) => window.__setSlide(s), svg);
    await page.evaluate(() => document.fonts.ready);

    const png = await capture(page, "png");
    const pngFile = path.join(OUT, "host-background.png");
    fs.writeFileSync(pngFile, png);
    console.log(`  png: ${CANVAS.w}x${CANVAS.h} -> out/host-background.png (${(png.length / 1048576).toFixed(2)} MB)`);

    if (!pngOnly) {
      const jpg = await capture(page, "jpeg", 92);
      const jpgFile = path.join(OUT, "host-background.jpg");
      fs.writeFileSync(jpgFile, jpg);
      console.log(`  jpg: ${CANVAS.w}x${CANVAS.h} -> out/host-background.jpg (${(jpg.length / 1048576).toFixed(2)} MB)`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  renderBackground(parseArgs(process.argv.slice(2)))
    .catch((e) => { console.error(`PNG/JPEG render failed: ${e.message}`); process.exitCode = 1; });
}
