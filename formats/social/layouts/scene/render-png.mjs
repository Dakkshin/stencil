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

/* Chrome itself has crashed mid-run on a busy machine (parity lanes render side by side),
   and a dead browser takes every later page of the post with it. Such a failure gets one
   fresh browser and one more try; anything else, or a second failure, is real. */
const chromeGone = (e) => /has been closed|Target crashed|Browser closed|disconnected/i.test(String(e?.message || e));

async function rasterise(context, cfg, format, out) {
  const F = FORMATS[format];
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
}

/**
 * Render one post. jobs: [{ format, out }] with `out` the PNG path to write.
 * Returns the paths written; a format that fails is reported and the rest still render.
 */
export async function render(rawCfg, jobs) {
  if (!jobs.length) return [];
  const cfg = JSON.parse(JSON.stringify(rawCfg));
  const written = [];
  let fail = 0;
  let browser = await launch();
  let context = await browser.newContext({ deviceScaleFactor: 2 });
  try {
    for (const { format, out } of jobs) {
      try {
        try {
          await rasterise(context, cfg, format, out);
        } catch (e) {
          if (!chromeGone(e)) throw e;
          console.warn(`  ! Chrome closed during the ${format} render (${String(e.message).split("\n")[0]}); relaunching once`);
          await browser.close().catch(() => {});
          browser = await launch();
          context = await browser.newContext({ deviceScaleFactor: 2 });
          await rasterise(context, cfg, format, out);
        }
        written.push(out);
      } catch (e) {
        fail += 1;
        console.error(`  ✗ ${cfg.name} ${format}: ${e.stack || e.message}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  if (fail) throw new Error(`${fail} PNG${fail === 1 ? "" : "s"} failed`);
  return written;
}
