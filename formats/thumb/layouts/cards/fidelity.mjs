#!/usr/bin/env node
/**
 * fidelity.mjs — prove `canva/IU-<name>.svg` still matches `preview/<name>.png`
 * (from iu-podcast-thumbnails/scripts/fidelity.mjs).
 *
 * Both sides are rasterised at 2× in real Chrome (the SVG is loaded as a file,
 * the PNG is decoded in the page) and compared pixel-by-pixel. No image
 * dependency: the browser does the decoding.
 *
 *   node formats/thumb/layouts/cards/fidelity.mjs ep950 ep951   # check specific episodes
 *   node formats/thumb/layouts/cards/fidelity.mjs --all         # every canva/IU-*.svg
 *
 * Baseline is MAE ≈ 0.0015–0.003 (mean absolute channel difference, 0–1)
 * since both renderers share layout.mjs. A number far above that is a
 * renderer bug: fix render-svg.mjs or the template and regenerate, never
 * hand-edit the outputs.
 *
 * Changes from the fork: Chrome comes from core/chromium.mjs, and canva/ and preview/
 * are the workspace's (core/paths.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { launch } from "../../../../core/chromium.mjs";
import { CANVA, PREVIEW } from "../../../../core/paths.mjs";

const argv = process.argv.slice(2);
let names = argv.filter((a) => !a.startsWith("-"));
if (argv.includes("--all")) {
  names = fs.existsSync(CANVA)
    ? fs
        .readdirSync(CANVA)
        .filter((f) => f.startsWith("IU-") && f.endsWith(".svg"))
        .map((f) => f.slice(3, -4))
    : [];
}
if (!names.length) {
  console.error("usage: node formats/thumb/layouts/cards/fidelity.mjs <name> [...] | --all");
  process.exit(1);
}

const browser = await launch();

let worst = 0;
let failures = 0;

for (const name of names) {
  const svg = path.join(CANVA, `IU-${name}.svg`);
  const png = path.join(PREVIEW, `${name}.png`);
  if (!fs.existsSync(svg) || !fs.existsSync(png)) {
    console.error(`✗ ${name}: missing ${fs.existsSync(svg) ? png : svg}`);
    failures += 1;
    continue;
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  await page.goto(`file://${svg}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const svgShot = (await page.screenshot()).toString("base64");
  await page.close();

  const pngData = fs.readFileSync(png).toString("base64");

  const compare = await browser.newPage();
  const res = await compare.evaluate(async ([a, b]) => {
    const load = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("decode failed"));
        img.src = src;
      });
    const [ia, ib] = await Promise.all([
      load("data:image/png;base64," + a),
      load("data:image/png;base64," + b),
    ]);
    const w = ia.naturalWidth;
    const h = ia.naturalHeight;
    if (ib.naturalWidth !== w || ib.naturalHeight !== h) {
      return { error: `${w}×${h} vs ${ib.naturalWidth}×${ib.naturalHeight}` };
    }
    const pixels = (img) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, w, h).data;
    };
    const da = pixels(ia);
    const db = pixels(ib);
    let sum = 0;
    for (let i = 0; i < da.length; i++) sum += Math.abs(da[i] - db[i]);
    return { mae: sum / da.length / 255, w, h };
  }, [svgShot, pngData]);
  await compare.close();

  if (res.error) {
    console.error(`✗ ${name}: size mismatch ${res.error}`);
    failures += 1;
    continue;
  }
  const flag = res.mae > 0.02 ? "✗" : "✓";
  if (res.mae > 0.02) failures += 1;
  console.log(`${flag} ${name.padEnd(12)} MAE ${res.mae.toFixed(5)}  (${res.w}×${res.h})`);
  worst = Math.max(worst, res.mae);
}

await browser.close();
console.log(`\nworst MAE ${worst.toFixed(5)}, baseline about 0.0015 to 0.003 (fails above 0.02)`);
process.exit(failures ? 1 : 0);
