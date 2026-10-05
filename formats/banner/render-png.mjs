/**
 * Banner PNG renderer (from zoom-banner/render.mjs, identical in both banner forks).
 *
 * Screenshots the .canvas element of the layout's template with headless Chrome at
 * CANVAS.scale, then downscales back to exactly CANVAS.w x CANVAS.h. Supersampling is
 * what keeps the 6.5px role text and the downsampled headshots clean at this size.
 *
 * Changes from the fork: Chrome and sharp come from core/chromium.mjs, outputs go to the
 * workspace out/, and the template is the brand's layout template, passed in.
 */
import fs from "node:fs";
import path from "node:path";
import { CANVAS, BANDS, TYPE } from "./geometry.mjs";
import { launch, loadSharp } from "../../core/chromium.mjs";
import { OUT } from "../../core/paths.mjs";

/* The template doubles as a browser editor: it centres the canvas with body
   padding and shows a JSON panel underneath. Both have to go before we
   screenshot, otherwise the canvas sits outside the 640x200 viewport and
   Playwright clips the element shot to what is visible. */
const RENDER_CSS = `
  html, body { margin:0 !important; padding:0 !important; overflow:hidden !important; background:transparent !important; }
  body { display:block !important; }
  #stage { transform:none !important; }
  #editor { display:none !important; }
`;

async function preparePage(page, cfg, template) {
  await page.goto(`file://${template}`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: RENDER_CSS });
  await page.evaluate((g) => window.__setGeometry(g), {
    h: CANVAS.h,
    padX: CANVAS.padX,
    padTop: CANVAS.padTop,
    padBottom: CANVAS.padBottom,
    ...BANDS,
    ...TYPE,
    logoH: TYPE.logoH,
  });
  await page.evaluate((c) => window.applyConfig(c), cfg);
  await page.evaluate(() => window.setPreviewScale(1));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

export async function render(cfg, outDir = OUT, template) {
  if (!template) throw new Error("render(cfg, outDir, template): the layout template is required");
  const base = String(cfg.output || "banner").replace(/\.png$/i, "");

  fs.mkdirSync(outDir, { recursive: true });
  const finalPath = path.join(outDir, `${base}.png`);
  const bigPath = path.join(outDir, `${base}@${CANVAS.scale}x.png`);

  const browser = await launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS.w, height: CANVAS.h },
      deviceScaleFactor: CANVAS.scale,
    });
    await preparePage(page, cfg, template);
    const buf = await page.locator(".canvas").screenshot();
    fs.writeFileSync(bigPath, buf);

    /* Downscale to the exact target box. Lanczos via sharp when available;
       otherwise take a second pass at DPR 1 so the output size is still right. */
    const sharp = loadSharp();
    if (sharp) {
      await sharp(buf).resize(CANVAS.w, CANVAS.h, { fit: "fill" }).png().toFile(finalPath);
    } else {
      const page1 = await browser.newPage({
        viewport: { width: CANVAS.w, height: CANVAS.h },
        deviceScaleFactor: 1,
      });
      await preparePage(page1, cfg, template);
      fs.writeFileSync(finalPath, await page1.locator(".canvas").screenshot());
      await page1.close();
    }
    return { finalPath, bigPath };
  } finally {
    await browser.close();
  }
}
