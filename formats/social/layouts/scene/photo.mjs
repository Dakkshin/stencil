/**
 * Panelist photos for the IU layouts: every photo becomes a B&W cutout so
 * mismatched sources (LinkedIn scrape, studio portrait) read as one set —
 * pattern #4 in Design Inspiration/Webinar Promo Breakdown.md.
 *
 *   plain JPG   → background removed (lib/cutout.mjs raw stage, rembg) → B&W
 *   alpha PNG   → used as-is → B&W (face box from a sidecar JSON if present)
 *   no venv     → the photo stays rectangular, still B&W, still face-fitted
 *
 * The face box drives framing: layouts ask for "face N px tall, centred at
 * (x, y)" and get back an image rect — see fitFace().
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { rawCutout } from "../../cutout.mjs";
import { GEN } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(GEN, "photos");
const sharp = () => createRequire(import.meta.url)("sharp");

const PHOTO_VERSION = 2;
const MAX_EDGE = 1400;

function sidecarFor(file) {
  const dir = path.dirname(file);
  const base = path.basename(file, path.extname(file));
  for (const cand of [
    path.join(dir, `${base}.json`),
    path.join(GEN, "cutouts", `${base.replace(/-cutout$/, "")}-raw.json`),
  ]) {
    if (fs.existsSync(cand)) {
      try {
        const j = JSON.parse(fs.readFileSync(cand, "utf8"));
        if (j.face || j.bbox) return j;
      } catch { /* ignore */ }
    }
  }
  return null;
}

/**
 * Prepare one photo. Returns
 *   { href, w, h, cutout: bool, face: {x,y,w,h}|null, bbox: {left,top,right,bottom} }
 * in the prepared image's pixel space, or null when there is no photo.
 */
export async function preparePhoto(photoPath, { stem, tone = "bw", cutout = true } = {}) {
  if (!photoPath || !fs.existsSync(photoPath)) return null;
  const meta0 = await sharp()(photoPath).metadata();
  let src = photoPath;
  let side = meta0.hasAlpha ? sidecarFor(photoPath) : null;
  let isCut = Boolean(meta0.hasAlpha);

  if (!isCut && cutout) {
    try {
      const made = await rawCutout(photoPath, stem || path.basename(photoPath, path.extname(photoPath)), "u2net");
      if (made) {
        src = made.raw;
        side = made.meta;
        isCut = true;
      }
    } catch (e) {
      console.warn(`  [${stem}] background removal failed (${e.message}) — using the rectangular photo`);
    }
  }

  const st = fs.statSync(src);
  const key = crypto.createHash("sha1").update(`${src}:${st.size}:${st.mtimeMs}:${tone}:v${PHOTO_VERSION}`).digest("hex").slice(0, 16);
  const out = path.join(CACHE, `${key}.png`);
  const info = path.join(CACHE, `${key}.json`);
  if (!fs.existsSync(out) || !fs.existsSync(info)) {
    fs.mkdirSync(CACHE, { recursive: true });
    const m = await sharp()(src).metadata();
    const scale = Math.min(1, MAX_EDGE / Math.max(m.width, m.height));
    let img = sharp()(src).resize(Math.round(m.width * scale), Math.round(m.height * scale)).ensureAlpha();
    if (tone === "bw") img = img.modulate({ saturation: 0 }).linear(1.12, -10);
    const buf = await img.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    fs.writeFileSync(out, buf.data);
    const sc = (v) => Math.round(v * scale);
    const srcSize = side?.size ? { w: side.size[0], h: side.size[1] } : { w: m.width, h: m.height };
    const ratio = (m.width / srcSize.w) * scale;
    const r = (v) => Math.round(v * ratio);
    const face = side?.face ? { x: r(side.face.x), y: r(side.face.y), w: r(side.face.w), h: r(side.face.h) } : null;
    const bbox = side?.bbox
      ? { left: r(side.bbox.left), top: r(side.bbox.top), right: r(side.bbox.right), bottom: r(side.bbox.bottom) }
      : { left: 0, top: 0, right: sc(m.width), bottom: sc(m.height) };
    fs.writeFileSync(info, JSON.stringify({ w: buf.info.width, h: buf.info.height, face, bbox, cutout: isCut }));
  }
  const meta = JSON.parse(fs.readFileSync(info, "utf8"));
  return { href: `data:image/png;base64,${fs.readFileSync(out).toString("base64")}`, ...meta };
}

/** Face box, or a best guess from the silhouette when detection failed. */
export function faceOf(p) {
  if (p.face) return p.face;
  const bw = p.bbox.right - p.bbox.left;
  const fw = bw * 0.42;
  return { x: p.bbox.left + (bw - fw) / 2, y: p.bbox.top + bw * 0.06, w: fw, h: fw };
}

/**
 * Image rect that puts the face `faceH` px tall with its centre at `cx` and its
 * top edge at `faceTop`. Layouts clip the result to their own shape.
 */
export function fitFace(p, { faceH, cx, faceTop }) {
  const f = faceOf(p);
  const k = faceH / f.h;
  return { x: cx - (f.x + f.w / 2) * k, y: faceTop - f.y * k, w: p.w * k, h: p.h * k, scale: k };
}

/** Where the silhouette's lowest opaque row lands for a given fit. */
export function subjectBottom(p, fit) {
  return fit.y + p.bbox.bottom * fit.scale;
}
