#!/usr/bin/env node
/**
 * Rasterize the SVGs to retina PNGs and print them to one vector PDF.
 *
 *   node render.mjs -c .gen/<deck>.json [--slides 1,4-6] [--no-pdf]
 *
 * This module owns Chromium and nothing else. It never builds a layout: it asks
 * render-svg.mjs for the exact same strings that go into canva/, so the PNG, the PDF
 * and the Canva SVG are one document rendered three ways.
 *
 * The PDF is printed rather than stitched from the PNGs, which keeps text as selectable
 * vector, keeps the file at a couple of MB instead of ~60, and costs no dependency.
 *
 * Failing here is not fatal to a build — the SVGs are already written by the time this
 * runs, so a machine without Chromium still produces usable artwork.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BRANDS_MODULE, OUT, PSP, ROOT } from "./lib/paths.mjs";
import { CANVAS } from "./lib/geometry.mjs";
import { launch } from "./lib/chromium.mjs";
import { buildSlideSvg, slideFileName, pruneStale } from "./render-svg.mjs";

const SHELL = path.join(ROOT, "shell.html");

function parseArgs(argv) {
  const a = { config: null, slides: null, pdf: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-c") a.config = argv[++i];
    else if (argv[i] === "--no-pdf") a.pdf = false;
    else if (argv[i] === "--slides") {
      a.slides = new Set(
        String(argv[++i] || "").split(",").flatMap((p) => {
          const m = p.trim().match(/^(\d+)(?:-(\d+))?$/);
          if (!m) return [];
          const lo = Number(m[1]), hi = m[2] ? Number(m[2]) : lo;
          return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
        })
      );
    }
  }
  return a;
}

/**
 * Screenshot via CDP with an explicit clip, not locator.screenshot().
 *
 * panel-social-posts documents why: element screenshots clip to the viewport and drop
 * edge strokes. captureBeyondViewport is deliberately left unset for the same reason.
 * deviceScaleFactor stays 1 and the 2x comes from the clip's own scale.
 */
async function capture(page) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: CANVAS.w, height: CANVAS.h, scale: CANVAS.scale },
  });
  return Buffer.from(data, "base64");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config) {
    console.error("usage: node render.mjs -c .gen/<deck>.json [--slides 1,4-6] [--no-pdf]");
    process.exit(2);
  }

  const cfg = JSON.parse(fs.readFileSync(args.config, "utf8"));
  const { BRANDS } = await import(BRANDS_MODULE);
  cfg.brand = BRANDS[cfg.brandId] || BRANDS.OBA;

  const wanted = cfg.slides.filter((s) => !args.slides || args.slides.has(s.number));
  const svgs = wanted.map((s) => ({ slide: s, svg: buildSlideSvg(cfg, s).svg }));

  const dir = path.join(OUT, cfg.deck);
  fs.mkdirSync(dir, { recursive: true });
  const pngName = (f) => f.replace(/\.svg$/, "@2x.png");
  if (!args.slides) pruneStale(dir, cfg.slides.map(slideFileName), pngName);

  const browser = await launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS.w, height: CANVAS.h },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(SHELL).href, { waitUntil: "domcontentloaded" });

    for (const { slide, svg } of svgs) {
      await page.evaluate((s) => window.__setSlide(s), svg);
      await page.evaluate(() => document.fonts.ready);
      const png = await capture(page);
      fs.writeFileSync(path.join(dir, slideFileName(slide).replace(/\.svg$/, "@2x.png")), png);
    }
    console.log(`  png: ${svgs.length} slide${svgs.length === 1 ? "" : "s"} at ${CANVAS.w * CANVAS.scale}x${CANVAS.h * CANVAS.scale} -> out/${cfg.deck}/`);

    /* The PDF always contains the WHOLE deck, even under --slides: a partial deck PDF
       is never what anyone wants, and re-rendering every slide for it is cheap. */
    if (args.pdf) {
      // Fonts declared once, on the first slide, then shared by the whole document.
      const all = cfg.slides.map((s, i) => buildSlideSvg(cfg, s, { withFonts: i === 0 }).svg);
      await page.evaluate((list) => window.__setDeck(list), all);
      await page.evaluate(() => document.fonts.ready);
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        width: `${CANVAS.w}px`,
        height: `${CANVAS.h}px`,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      const file = path.join(OUT, `${cfg.deck}.pdf`);
      fs.writeFileSync(file, pdf);
      console.log(`  pdf: ${cfg.slides.length} pages -> out/${cfg.deck}.pdf (${(pdf.length / 1048576).toFixed(1)} MB)`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
