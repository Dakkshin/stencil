/**
 * Scene layout PNG renderer (from iu-panel-social-posts/render.mjs).
 *
 * Rasterises the IU post SVG with real Chrome at 2x. The page holds nothing but the exact
 * SVG render-svg.mjs writes (built from the same config by buildSvg), so the PNG and the
 * Canva SVG are the same artwork by construction.
 *
 * Changes from the fork: a function instead of a CLI (gen.mjs passes the normalized config
 * and the frozen output paths), and Chrome from core/chromium.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { buildSvg } from "./build.mjs";
import { FORMATS } from "./tokens.mjs";
import { launch } from "../../../../core/chromium.mjs";

/**
 * Render one post. jobs: [{ format, out }] with `out` the PNG path to write.
 * Returns the paths written; a format that fails is reported and the rest still render.
 */
export async function render(rawCfg, jobs) {
  if (!jobs.length) return [];
  const cfg = JSON.parse(JSON.stringify(rawCfg));
  const written = [];
  let fail = 0;
  const browser = await launch();
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  try {
    for (const { format, out } of jobs) {
      const F = FORMATS[format];
      try {
        const svg = (await buildSvg(cfg, format)).replace(/^<\?xml[^>]*>\s*/, "");
        const page = await context.newPage();
        await page.setViewportSize({ width: F.w, height: F.h });
        await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">${svg}</body></html>`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(120);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out, clip: { x: 0, y: 0, width: F.w, height: F.h } });
        await page.close();
        console.log(`  ✓ ${out} (${fs.statSync(out).size.toLocaleString()} bytes)`);
        written.push(out);
      } catch (e) {
        fail += 1;
        console.error(`  ✗ ${cfg.name} ${format}: ${e.stack || e.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  if (fail) throw new Error(`${fail} PNG${fail === 1 ? "" : "s"} failed`);
  return written;
}
