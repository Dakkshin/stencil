/**
 * iu-panel-social-posts — portrait-fit helpers for speaker_promo.
 *
 * The speaker promo shows an oversized cutout portrait. For the design to
 * survive any panelist photo, the generator auto-fits the portrait to the
 * actual person in the cutout:
 *
 *   · the person's head never collides with the date/time line (it starts
 *     a fixed gap below the event text), and
 *   · the silhouette always bleeds to the bottom edge of the canvas.
 *
 * The square format uses a fixed-width variant instead: the portrait is
 * exactly PORTRAIT_FIXED_W square wide, placed at the explicit top-left
 * PORTRAIT_FIXED_POS coordinates (falls back to horizontally centred + the
 * event-line gap when null), and only the top PORTRAIT_SHOW_FRAC of the
 * (cover-scaled) image is visible — so the head still clears the event line
 * while the feet crop off the bottom edge.
 *
 * Everything is derived from the cutout's alpha channel, so a new panelist
 * needs no manual numbers — gen.mjs / render-svg.mjs / render.mjs all call
 * portraitBBox() + portraitRect().
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sharpModule = null;
function loadSharp() {
  if (sharpModule) return sharpModule;
  /* sharp comes from this tool's own node_modules (`npm install`). */
  sharpModule = createRequire(import.meta.url)("sharp");
  return sharpModule;
}

/* Head-clearance offset below the event line, per format (CSS px at 1x).
   Square is negative so the centered portrait rises to just below the event
   text: the cutout's transparent headroom keeps the actual head clear while
   the visible crop still bleeds to the bottom edge. Other formats keep the
   looser auto-fit gaps. */
export const PORTRAIT_GAP = { square: -45, portrait: 38, story: 42, landscape: 26 };
/* Portrait width bounds as a fraction of the canvas width. */
export const PORTRAIT_MAX_W = { square: 0.52, portrait: 0.52, story: 0.56, landscape: 0.46 };
export const PORTRAIT_MIN_W = { square: 0.34, portrait: 0.34, story: 0.34, landscape: 0.34 };
/* Fixed-width, centred portrait mode per format (canvas px at 1x). A value of
   0 keeps the left-aligned auto-fit for that format. */
export const PORTRAIT_FIXED_W = { square: 900, portrait: 0, story: 0, landscape: 0 };
/* Explicit top-left position for the fixed-width mode, per format (canvas px
   at 1x). When set, it overrides the auto-centered x and the event-line-gap
   y so the portrait can be placed on a hard coordinate. A null entry falls
   back to the centred + event-line-gap behaviour.

   Square spans x 180..1080 — flush to the card's right edge. This is the
   ceiling for a portrait sized by its own width (a head-and-shoulders crop,
   which fills the area and stops); portraits sized by the face-height target
   are unaffected by it. */
export const PORTRAIT_FIXED_POS = {
  square: { x: 180, y: 202 },
  portrait: null,
  story: null,
  landscape: null,
};
/* Fraction of the cover-scaled image that stays visible from the top. */
export const PORTRAIT_SHOW_FRAC = { square: 0.75, portrait: 1, story: 1, landscape: 1 };

/* Alpha-channel bounding box of the opaque person in an image (source px).
   A photo without transparency (e.g. a JPG) returns the full image bounds,
   so a rectangular photo is still pushed clear of the date/time line. */
export async function portraitBBox(file) {
  if (!file) return null;
  try {
    const sharp = loadSharp();
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ch = info.channels; /* 4 after ensureAlpha */
    const w = info.width;
    const h = info.height;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * ch;
      for (let x = 0; x < w; x++) {
        if (data[row + x * ch + 3] > 128) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null; /* fully transparent */
    return { w, h, left: minX, top: minY, right: maxX, bottom: maxY };
  } catch (e) {
    console.warn(`  (portrait fit: cannot read ${file}: ${e.message})`);
    return null;
  }
}

/* Target portrait rect (canvas px at 1x) for a person whose alpha bbox is
   `bbox`, given the top "safe line" (`safeTop` = event line bottom + gap).
   Returns the rect plus the exact cover-crop offsets:
     · posX / posY  — object-position percentages (HTML/CSS)
     · ox / oy      — image offsets in canvas px (SVG <image> placement)
     · scale        — cover scale applied to the source image
*/
export function portraitRect(bbox, canvasW, canvasH, safeTop, format = "square") {
  const { w: iw, h: ih, left, top, right, bottom } = bbox;
  const availH = Math.max(canvasH - safeTop, 40);
  const personW = right - left;
  const personH = bottom - top;
  const maxW = canvasW * (PORTRAIT_MAX_W[format] ?? 0.52);
  const minW = canvasW * (PORTRAIT_MIN_W[format] ?? 0.34);
  const fixedW = PORTRAIT_FIXED_W[format] ?? 0;
  const showFrac = PORTRAIT_SHOW_FRAC[format] ?? 1;

  if (fixedW > 0) {
    /* Fixed-width centred mode: the image fills `fixedW` exactly and only the
       top `showFrac` of it stays visible (anchored to the image's top edge).
       The box top is the safe line, so the head clears the event text while
       the silhouette bleeds off the bottom of the canvas. */
    const w = fixedW;
    const scale = w / iw;
    const h = Math.max(Math.round(showFrac * ih * scale), 40);
    const pos = PORTRAIT_FIXED_POS[format] || null;
    const x = pos ? Math.round(pos.x) : Math.max(Math.round((canvasW - w) / 2), 0);
    const y = pos ? Math.round(pos.y) : Math.round(safeTop);
    return { x, y, w, h, scale, ox: 0, oy: 0, posX: 50, posY: 0 };
  }

  /* Fit the person's full height into the available vertical span, keeping
     cover height-driven so the head is never cropped (only the feet are, in
     short formats like landscape). */
  const scaleH = availH / personH;
  let w = personW * scaleH;
  const limitW = (iw * availH) / ih; /* max width that keeps height-driven cover */
  if (w > maxW) w = maxW;
  else if (w > limitW) w = limitW;
  w = Math.max(w, minW);
  const h = availH;
  const y = safeTop;
  const x = 0;

  const scale = Math.max(w / iw, h / ih);
  const overflowX = scale * iw - w;
  const overflowY = scale * ih - h;

  /* Head first: if the person is taller than the window, keep the head in
     view (crop the feet). Otherwise the head sits a few px below the top. */
  let oy = 0;
  if (overflowY > 0) oy = Math.min(top * scale, overflowY);

  /* Centre the person horizontally when the image is wider than the window. */
  const personCx = (left + right) / 2;
  let ox = 0;
  if (overflowX > 0) ox = Math.max(0, Math.min(personCx * scale - w / 2, overflowX));

  const posX = overflowX > 0 ? (ox / overflowX) * 100 : 50;
  const posY = overflowY > 0 ? (oy / overflowY) * 100 : 0;
  return { x, y, w, h, scale, ox, oy, posX, posY };
}

export default {
  portraitBBox,
  portraitRect,
  PORTRAIT_GAP,
  PORTRAIT_MAX_W,
  PORTRAIT_MIN_W,
  PORTRAIT_FIXED_W,
  PORTRAIT_SHOW_FRAC,
  PORTRAIT_FIXED_POS,
};
