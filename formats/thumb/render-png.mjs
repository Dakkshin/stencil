/**
 * Thumbnail PNG renderer (from podcast-thumbnails/render.mjs; its renderPage is identical in
 * iu-podcast-thumbnails/render.mjs, lines 80-96).
 *
 * Loads the design's template in headless Chrome, applies the normalized config, and
 * screenshots the 1280x720 .canvas at device scale 2, so preview/<name>.png is 2560x1440.
 * No resampling: the PNG is the raw Chrome capture.
 *
 * Changes from the fork: Chrome comes from core/chromium.mjs, the template is the brand's
 * design template (passed in), the config arrives in memory (round-tripped through JSON, so
 * the page sees exactly what the fork read back from .gen/<name>.json), and the PNG goes to
 * the workspace preview/. The demo presets and -c globbing of the fork's CLI are gone: the
 * format CLI drives this module. A design may ask for agreeing captures (see render()).
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "../../core/chromium.mjs";
import { PREVIEW } from "../../core/paths.mjs";

async function renderPage(browser, cfg, template) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
  try {
    await page.goto(`file://${template}`, { waitUntil: "domcontentloaded" });
    await page.evaluate((c) => window.applyConfig(c), cfg);
    // Force 1:1 canvas scale and let fonts settle (falls back gracefully offline).
    await page.evaluate(() => window.setPreviewScale(1));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const buf = await page.locator(".canvas").screenshot();
    return buf;
  } finally {
    await page.close();
  }
}

/* One capture in its own browser, as the fork's render.mjs did per episode. */
async function capture(cfg, template) {
  const browser = await launch();
  try {
    return await renderPage(browser, cfg, template);
  } finally {
    await browser.close();
  }
}

/**
 * Take captures from `next()` until `agree` of them are byte-identical, at most agree + 1
 * of them; if none agree by then, the most frequent (else the first) wins. Returns
 * { buf, captures, agreed }. With agree = 1 this is a single capture.
 */
export async function agreedCapture(next, agree = 1) {
  const seen = [];
  for (let i = 0; i < agree + 1; i++) {
    const buf = await next();
    const hits = seen.filter((s) => s.equals(buf)).length + 1;
    seen.push(buf);
    if (hits >= agree) return { buf, captures: seen.length, agreed: true };
  }
  const count = (b) => seen.filter((s) => s.equals(b)).length;
  return { buf: seen.reduce((best, b) => (count(b) > count(best) ? b : best), seen[0]), captures: seen.length, agreed: false };
}

/**
 * Render one normalized config to <outDir>/<cfg.output>; returns the PNG path.
 *
 * `agree` > 1 asks for that many byte-identical captures from separate browser sessions.
 * Each capture is the fork's procedure unchanged; agreement only filters out a capture that
 * Chrome laid out differently under machine load (the classic design asks for 2, see
 * layouts/classic/index.mjs), so the PNG is the same on a busy machine as on a quiet one.
 */
export async function render(cfg, outDir = PREVIEW, template, { agree = 1 } = {}) {
  if (!template) throw new Error("render(cfg, outDir, template): the design template is required");
  const job = JSON.parse(JSON.stringify(cfg));
  const out = path.resolve(outDir, job.output || "thumbnail.png");
  delete job.output;
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const { buf, captures, agreed } = await agreedCapture(() => capture(job, template), agree);
  if (captures > agree) {
    console.warn(agreed
      ? `    (${path.basename(out)}: one capture differed, Chrome laid the text out differently once; kept the capture ${agree} sessions agreed on)`
      : `    (${path.basename(out)}: no ${agree} of ${captures} captures agreed; kept the most frequent)`);
  }
  fs.writeFileSync(out, buf);
  console.log(`✓ ${out} (${buf.length.toLocaleString()} bytes)`);
  return out;
}
