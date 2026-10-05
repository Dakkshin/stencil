/**
 * Downsample source photos once, and cache the result.
 *
 * Headshots arrive at whatever resolution the client sent — for the Sep 17 panel one was
 * 1667x2500 at 2.5 MB. The largest a photo is ever DISPLAYED is the spotlight portrait,
 * 520x680 at 2x = 1040x1360, and every photo is embedded in two or three slides, so a
 * full-resolution source is carried several times over for no visible gain. Left alone it
 * took the deck's SVG output from 6.6 MB to 16 MB.
 *
 * The resize runs in the Chromium that is already resolved for rendering, so this adds no
 * dependency. It degrades cleanly: without Chrome the originals are used unchanged and the
 * only cost is file size.
 *
 * Cache lives in .gen/_img/, keyed by source size+mtime, so re-dropping the same photo is
 * free and replacing it invalidates automatically.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GEN } from "./paths.mjs";

export const CACHE_DIR = path.join(GEN, "_img");

/** Long edge, in px. The spotlight portrait at 2x plus a little headroom. */
export const MAX_EDGE = 1400;

/** Below this there is nothing to gain, and re-encoding would only lose quality. */
const MIN_BYTES = 320 * 1024;

const keyFor = (file) => {
  const st = fs.statSync(file);
  return crypto.createHash("sha1")
    .update(`${file}:${st.size}:${Math.round(st.mtimeMs)}:${MAX_EDGE}`)
    .digest("hex").slice(0, 16);
};

/**
 * Returns Map(originalPath -> pathToUse). Paths not worth shrinking map to themselves,
 * so callers can apply the map unconditionally.
 */
export async function optimizePhotos(files, { quiet = false } = {}) {
  const out = new Map();
  const unique = [...new Set(files.filter((f) => f && !f.startsWith("data:") && fs.existsSync(f)))];
  for (const f of unique) out.set(f, f);

  const candidates = unique.filter((f) => fs.statSync(f).size > MIN_BYTES);
  if (!candidates.length) return { map: out, warnings: [], saved: 0 };

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  /* Anything already cached is resolved before Chrome is even launched. */
  const todo = [];
  for (const f of candidates) {
    const cached = path.join(CACHE_DIR, `${keyFor(f)}.jpg`);
    if (fs.existsSync(cached)) out.set(f, cached);
    else todo.push({ src: f, dest: cached });
  }

  let warnings = [];
  if (todo.length) {
    try {
      const { launch } = await import("./chromium.mjs");
      const browser = await launch();
      try {
        const page = await browser.newPage();
        await page.setContent("<!doctype html><meta charset=utf-8><body></body>");
        for (const job of todo) {
          const ext = path.extname(job.src).toLowerCase();
          const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
          const dataUri = `data:${mime};base64,${fs.readFileSync(job.src).toString("base64")}`;
          const encoded = await page.evaluate(
            async ({ uri, maxEdge }) => {
              const img = new Image();
              img.src = uri;
              await img.decode();
              const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
              if (scale >= 1) return null;
              const c = document.createElement("canvas");
              c.width = Math.round(img.naturalWidth * scale);
              c.height = Math.round(img.naturalHeight * scale);
              const ctx = c.getContext("2d");
              ctx.imageSmoothingQuality = "high";
              ctx.drawImage(img, 0, 0, c.width, c.height);
              return c.toDataURL("image/jpeg", 0.86);
            },
            { uri: dataUri, maxEdge: MAX_EDGE }
          );
          if (!encoded) continue; // already small enough in pixel terms
          fs.writeFileSync(job.dest, Buffer.from(encoded.split(",")[1], "base64"));
          out.set(job.src, job.dest);
        }
      } finally {
        await browser.close();
      }
    } catch (err) {
      warnings.push(
        `could not downsample headshots (${err.message.split("\n")[0]}) — using originals, ` +
          "which makes the deck considerably larger"
      );
    }
  }

  let saved = 0;
  for (const [src, use] of out) if (src !== use) saved += fs.statSync(src).size - fs.statSync(use).size;
  return { map: out, warnings, saved };
}
