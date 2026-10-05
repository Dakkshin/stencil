/**
 * One-off: render a Figma-exported SVG to the 640×200 banner PNG.
 *
 * Uses the same pipeline as render.mjs — headless Chrome at 3× (1920×600),
 * then Lanczos downscale to exactly 640×200. The SVG is loaded directly,
 * so the output is pixel-faithful to the Figma file.
 *
 * Usage: node render-figma-svg.mjs <input.svg> [name]
 *   writes out/<name>@3x.png and out/<name>.png
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CANVAS } from "./geometry.mjs";
import { OUT, ROOT } from "../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OBA_SITE = path.join(ROOT, "package.json");
function loadChromium() {
  const local = createRequire(import.meta.url);
  try {
    return local("playwright").chromium;
  } catch {
    try {
      return createRequire(OBA_SITE)("playwright").chromium;
    } catch {
      throw new Error(
        "playwright not found.\n" +
          "  Looked in: this tool, then " + OBA_SITE + "\n" +
          "  Install with: npm i -D playwright && npx playwright install chromium"
      );
    }
  }
}
function loadSharp() {
  const local = createRequire(import.meta.url);
  try {
    return local("sharp");
  } catch {
    try {
      return createRequire(OBA_SITE)("sharp");
    } catch {
      return null;
    }
  }
}

const [inputSvg, name = "banner"] = process.argv.slice(2);
if (!inputSvg) {
  console.error("usage: node render-figma-svg.mjs <input.svg> [name]");
  process.exit(1);
}

const svgPath = path.resolve(inputSvg);
const svgData = fs.readFileSync(svgPath, "utf8");
const chromium = loadChromium();
const sharp = loadSharp();

const outDir = OUT;
fs.mkdirSync(outDir, { recursive: true });
const bigPath = path.join(outDir, `${name}@${CANVAS.scale}x.png`);
const finalPath = path.join(outDir, `${name}.png`);

const browser = await chromium
  .launch({ channel: "chrome", args: ["--no-sandbox"] })
  .catch(() => chromium.launch({ args: ["--no-sandbox"] }));

try {
  const page = await browser.newPage({
    viewport: { width: CANVAS.w, height: CANVAS.h },
    deviceScaleFactor: CANVAS.scale,
  });
  await page.setContent(`<div style="margin:0;padding:0;background:transparent">${svgData}</div>`, {
    waitUntil: "domcontentloaded",
  });
  await page.addStyleTag({
    content:
      "html,body{margin:0!important;padding:0!important;overflow:hidden!important}" +
      "svg{display:block;width:640px;height:200px}",
  });
  await page.waitForTimeout(300);
  const buf = await page.locator("svg").screenshot();
  fs.writeFileSync(bigPath, buf);

  if (sharp) {
    await sharp(buf).resize(CANVAS.w, CANVAS.h, { fit: "fill" }).png().toFile(finalPath);
  } else {
    const page1 = await browser.newPage({
      viewport: { width: CANVAS.w, height: CANVAS.h },
      deviceScaleFactor: 1,
    });
    await page1.setContent(`<div style="margin:0;padding:0;background:transparent">${svgData}</div>`, {
      waitUntil: "domcontentloaded",
    });
    await page1.addStyleTag({ content: "html,body{margin:0!important;padding:0!important;overflow:hidden!important}svg{display:block;width:640px;height:200px}" });
    fs.writeFileSync(finalPath, await page1.locator("svg").screenshot());
    await page1.close();
  }
  console.log(`  @3x  ${path.relative(__dirname, bigPath)}`);
  console.log(`  png  ${path.relative(__dirname, finalPath)}`);
} finally {
  await browser.close();
}
