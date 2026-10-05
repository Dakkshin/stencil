/**
 * Classic layout PNG renderer (from panel-social-posts/render.mjs, the template half).
 *
 * Opens template.html (speaker-template.html for speaker_promo) in real Chrome, injects
 * the geometry, the exact brand object (logo baked in as a data URI), the format, the
 * speaker cutout's alpha bounding box and the config, then captures the #canvas element at
 * 2x with a CDP clip. Output: one <stem>@2x.png per format, at the path the caller names.
 *
 * Changes from the fork: a function instead of a CLI (gen.mjs passes the normalized config
 * and the frozen output paths), Chrome from core/chromium.mjs, one browser per post instead
 * of one per format, and the brand registry from ./brands.mjs (the packs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORMATS } from "../../geometry.mjs";
import { portraitBBox } from "../../portrait-fit.mjs";
import { BRANDS, logoDataUri } from "./brands.mjs";
import { launch } from "../../../../core/chromium.mjs";
import { resolvePhoto, resolveQr } from "../../../../core/assets.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = path.join(HERE, "template.html");
export const SPEAKER_TEMPLATE = path.join(HERE, "speaker-template.html");

/* A copy of the config with photo and QR references the browser can load. gen.mjs already
   writes absolute paths; a relative one (a hand-edited sidecar) resolves through the pools. */
function normalizeConfig(raw) {
  const cfg = JSON.parse(JSON.stringify(raw));
  cfg.name = cfg.name || "post";
  const local = (p) => p.startsWith("data:") || path.isAbsolute(p);
  for (const g of cfg.panelists || []) {
    if (g.photo && !local(g.photo)) g.photo = resolvePhoto(g.photo, { local: [] });
  }
  if (cfg.event && cfg.event.qr && !local(cfg.event.qr)) cfg.event.qr = resolveQr(cfg.event.qr);
  return cfg;
}

/* For speaker_promo, read each panelist photo's alpha bbox in Node (sharp) and hand it to
   the template via window.__setSpeakerBBox, which then auto-fits the portrait clear of the
   date/time line. The SVG path uses the same helper (portraitBBox) through render-svg.mjs. */
async function attachSpeakerBBoxes(cfg) {
  if (cfg.postType !== "speaker_promo") return {};
  const bboxes = {};
  for (const g of cfg.panelists || []) {
    if (!g || !g.photo || g.photo.startsWith("data:") || !path.isAbsolute(g.photo)) continue;
    const bbox = await portraitBBox(g.photo);
    if (bbox) bboxes[g.photo] = bbox;
  }
  return bboxes;
}

/* Capture the .canvas element at 2x device resolution.
 *
 * A CDP `Page.captureScreenshot` clip of the canvas bounding box, not `locator.screenshot()`:
 * Playwright's element screenshot composites the transformed canvas in a way that can drop
 * the absolutely-positioned elements (the QR block). A page-coordinate clip captures exactly
 * what Chrome paints; `captureBeyondViewport` stays unset, since enabling it can skew the
 * capture while the default captures the canvas correctly (verified at 2x in the fork). */
async function captureCanvas(page) {
  const rect = await page.evaluate(() => {
    const r = document.getElementById("canvas").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 2 },
  });
  return Buffer.from(data, "base64");
}

async function renderCanvas(browser, cfg, format, bboxes = {}) {
  const F = FORMATS[format];
  const page = await browser.newPage({
    /* Taller than the canvas: the template's sticky toolbar and stage margin push the
       canvas ~85px+ down the page, and the CDP clip only captures the visible viewport.
       With a viewport exactly as tall as the canvas, its bottom strip comes back filled
       with the page background (#0d151b). The clip uses the canvas's real page rect, so
       the extra height never shows up in the PNG. */
    viewport: { width: F.w, height: F.h + 320 },
    /* Layout in CSS pixels at DPR 1; the CDP clip applies the 2x scale (DPR 2 plus clip
       scale 2 double-applies the device scale and skews the capture geometry). */
    deviceScaleFactor: 1,
  });
  try {
    const template = cfg.postType === "speaker_promo" ? SPEAKER_TEMPLATE : TEMPLATE;
    await page.goto(`file://${template}`, { waitUntil: "domcontentloaded" });
    await page.evaluate((fmt) => window.__setGeometry({ FORMATS: fmt }), { FORMATS });

    /* Inject the exact brand object (with the logo baked in as a data URI), so the render
       never depends on the template's default asset paths. */
    const brandId = cfg.brand;
    const brand = { ...BRANDS[brandId], logo: logoDataUri(brandId) };
    await page.evaluate(
      ({ id, b }) => {
        window.__setBrandOverride(id, b);
        window.applyBrand(id);
      },
      { id: brandId, b: brand },
    );

    await page.evaluate((f) => window.__setFormat(f), format);
    /* Speaker promos inject alpha-bbox data for the auto-fitted cutout; the event-panel
       template does not define the setter, so it is skipped there. */
    await page.evaluate((b) => {
      if (typeof window.__setSpeakerBBox === "function") window.__setSpeakerBBox(b);
    }, bboxes);
    await page.evaluate(() => document.fonts.ready);
    /* Apply the config after fonts are in, so the auto-fit measures the final event-line
       position (title wrapping can shift before fonts load). */
    await page.evaluate((c) => window.applyConfig(c), cfg);
    await page.evaluate(() => window.setPreviewScale(1));
    await page.waitForTimeout(250);
    return await captureCanvas(page);
  } finally {
    await page.close();
  }
}

/**
 * Render one post. jobs: [{ format, out }] with `out` the PNG path to write.
 * Returns the paths written.
 */
export async function render(rawCfg, jobs) {
  if (!jobs.length) return [];
  const cfg = normalizeConfig(rawCfg);
  const bboxes = await attachSpeakerBBoxes(cfg);
  const written = [];
  const browser = await launch();
  try {
    for (const { format, out } of jobs) {
      if (!FORMATS[format]) throw new Error(`the classic layout has no "${format}" format`);
      const buf = await renderCanvas(browser, cfg, format, bboxes);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      console.log(`✓ ${out} (${buf.length.toLocaleString()} bytes)`);
      written.push(out);
    }
  } finally {
    await browser.close();
  }
  return written;
}
