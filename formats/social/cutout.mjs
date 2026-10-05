/**
 * iu-panel-social-posts — automatic cutout portraits for speaker_promo.
 *
 * Drop a plain JPG in headshots/ and this turns it into the transparent,
 * house-framed PNG the speaker card expects. Two stages, cached separately:
 *
 *   1. Background removal (expensive, Python/rembg) -> .gen/cutouts/<stem>-raw.png
 *      Cached on source mtime+size+model, so it runs once per new photo.
 *   2. Framing (cheap, sharp) -> headshots/cutouts/<stem>-cutout.png
 *      Re-runs whenever the framing constants change.
 *
 * Framing targets are calibrated against the shipped reference card
 * (preview/speaker_chris_bonsall-square.png): face ~295 card px tall, top of
 * head at card y 238. See FRAMING below for why those numbers.
 */
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { ROOT, GEN } from "../../core/paths.mjs";

import { PORTRAIT_FIXED_W, PORTRAIT_FIXED_POS, PORTRAIT_SHOW_FRAC } from "./portrait-fit.mjs";
import { FORMATS } from "./geometry.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VENV = path.join(ROOT, ".venv");
const VENV_PY = path.join(VENV, "bin", "python");
const HELPER = path.join(__dirname, "cutout.py");
const RAW_DIR = path.join(GEN, "cutouts");
const CUTOUT_DIR = path.join(ROOT, "assets", "headshots", "cutouts");

const PY_DEPS = [
  "rembg==2.0.81",
  "onnxruntime==1.29.0",
  "opencv-python-headless<5",
  "pillow",
];

/* Bump when the framing math changes, to invalidate stale cutouts. */
const FRAMING_VERSION = 15;

/* Scale a hair past the bleed row so rounding can't leave a 1px gap of bare
   gradient under a portrait that should reach the edge. */
const BLEED_OVERSHOOT = 8;

/* The cutout canvas. 2:3 is load-bearing, not cosmetic: the square card scales
   the portrait to PORTRAIT_FIXED_W and shows the top PORTRAIT_SHOW_FRAC of it,
   so only an aspect of exactly 2:3 (or taller) lets the person reach the canvas
   bottom edge. See lib/portrait-fit.mjs. */
const CANVAS_W = 1000;
const CANVAS_H = 1500;

const FRAMING = {
  /* Face height on the finished card, in card px. Calibrated from the Chris
     Bonsall reference (289). Christine ships at 388 and Amanda at 232, so the
     house range is wide; this targets the one the README showcases. */
  targetFaceCard: 295,
  /* Top of the head, in card px, when the photo allows it. Chris sits at 238,
     Christine at 240. A head-and-shoulders crop gets pushed below this — see
     planFraming. */
  headTopCard: 238,
};

function loadSharp() {
  return createRequire(import.meta.url)("sharp");
}

/* Card px per cutout px. */
const cardScale = () => (PORTRAIT_FIXED_W.square ?? 780) / CANVAS_W;

/* The last cutout row the card actually shows. Two things can cut it off: the
   renderer only draws the top PORTRAIT_SHOW_FRAC of the image, and the portrait
   box may extend past the bottom of the card. Whichever comes first wins —
   assuming the first (as this once did) strands the portrait low on the card
   whenever the box is wide enough to overshoot. */
const bleedRow = () =>
  Math.ceil(
    Math.min(
      (PORTRAIT_SHOW_FRAC.square ?? 0.75) * CANVAS_H,
      (FORMATS.square.h - (PORTRAIT_FIXED_POS.square?.y ?? 202)) / cardScale(),
    ),
  );

/* ── stage 1: background removal ─────────────────────────────────────────── */

async function run(cmd, args, opts = {}) {
  return execFileAsync(cmd, args, { maxBuffer: 32 * 1024 * 1024, ...opts });
}

async function haveVenv() {
  if (!fs.existsSync(VENV_PY)) return false;
  try {
    await run(VENV_PY, ["-c", "import rembg, cv2"]);
    return true;
  } catch {
    return false;
  }
}

/* Create .venv and install the removal deps. Returns false (with a warning)
   rather than throwing — a machine without Python must still build cards that
   already have cutouts. */
async function ensureVenv() {
  if (await haveVenv()) return true;
  console.log("  (cutout: setting up .venv for background removal — one time, a few minutes)");
  try {
    try {
      await run("uv", ["venv", "--python", "3.14", VENV], { cwd: ROOT });
      await run("uv", ["pip", "install", "--python", VENV_PY, ...PY_DEPS], { cwd: ROOT });
    } catch {
      /* No uv — fall back to stdlib venv + pip. */
      await run("python3", ["-m", "venv", VENV], { cwd: ROOT });
      await run(path.join(VENV, "bin", "pip"), ["install", "-q", ...PY_DEPS], { cwd: ROOT });
    }
    return await haveVenv();
  } catch (e) {
    console.warn(`  (cutout: could not set up Python for background removal: ${e.message})`);
    return false;
  }
}

function cacheKey(src, model) {
  const st = fs.statSync(src);
  return `${st.size}:${Math.round(st.mtimeMs)}:${model}`;
}

/* Remove the background, caching on the source file. Returns { raw, meta }. */
export async function rawCutout(src, stem, model) {
  const raw = path.join(RAW_DIR, `${stem}-raw.png`);
  const sidecar = path.join(RAW_DIR, `${stem}-raw.json`);
  const key = cacheKey(src, model);

  if (fs.existsSync(raw) && fs.existsSync(sidecar)) {
    try {
      const meta = JSON.parse(fs.readFileSync(sidecar, "utf8"));
      if (meta.key === key) return { raw, meta };
    } catch {
      /* fall through and regenerate */
    }
  }

  if (!(await ensureVenv())) return null;

  fs.mkdirSync(RAW_DIR, { recursive: true });
  console.log(`  · removing background from ${path.basename(src)} (${model})…`);
  const { stdout } = await run(VENV_PY, [HELPER, src, raw, "--model", model]);
  const meta = JSON.parse(stdout.trim().split("\n").pop());
  if (!meta.ok) throw new Error(meta.error || "background removal failed");
  meta.key = key;
  fs.writeFileSync(sidecar, JSON.stringify(meta, null, 2));
  return { raw, meta };
}

/* ── stage 2: framing ────────────────────────────────────────────────────── */

/* Where the resized silhouette sits: head at the house position when the photo
   allows it, pushed down only as far as needed for the body to reach the
   bottom edge. */
function placement(meta, scale, houseTop, needRow) {
  const { bbox } = meta;
  const h = (bbox.bottom - bbox.top + 1) * scale;
  const headTopRow = Math.max(houseTop, Math.round(needRow + BLEED_OVERSHOOT - h));
  return { headTopRow, top: Math.round(headTopRow - bbox.top * scale) };
}

/**
 * Work out the scale and placement that put the person on the card.
 *
 * Deliberately plain: the cutout is scaled uniformly and placed. Nothing is
 * stretched, padded or synthesised, and the silhouette is never cropped at the
 * sides. A portrait tall enough to fill the space runs off the bottom edge the
 * way the reference card does; one from a photo cropped at the chest simply
 * sits lower, because that is as large as it goes without distorting it.
 */
export function planFraming(meta, framing = FRAMING) {
  const { bbox, face } = meta;
  const px = cardScale(); /* card px per canvas px */
  const subjectW = bbox.right - bbox.left + 1;
  const subjectH = bbox.bottom - bbox.top + 1;
  const houseTop = Math.round((framing.headTopCard - (PORTRAIT_FIXED_POS.square?.y ?? 202)) / px);
  const needRow = bleedRow();

  /* Big enough for the face to match the house size, or to reach the bottom
     edge — whichever is larger — but never wider than the portrait, since that
     is what would shave the shoulders. */
  const faceScale = face ? framing.targetFaceCard / px / face.h : 0;
  const bleedScale = (needRow + BLEED_OVERSHOOT - houseTop) / subjectH;
  const scale = Math.min(Math.max(faceScale, bleedScale), CANVAS_W / subjectW);

  const w = subjectW * scale;
  const h = subjectH * scale;

  const { top, headTopRow } = placement(meta, scale, houseTop, needRow);

  /* Centred on the face, nudged only as far as needed to keep the whole
     silhouette inside the portrait. */
  const faceCx = face ? (face.x + face.w / 2) * scale : ((bbox.left + bbox.right) / 2) * scale;
  const minLeft = -bbox.left * scale;
  const maxLeft = CANVAS_W - (bbox.right + 1) * scale;
  const left = Math.round(Math.min(Math.max(CANVAS_W / 2 - faceCx, minLeft), Math.max(maxLeft, minLeft)));

  const subjectBottom = Math.round(top + bbox.bottom * scale);
  const bleeds = subjectBottom >= needRow;

  const warn = bleeds
    ? null
    : `photo is cropped at the chest, so the portrait sits ${Math.round((needRow - subjectBottom) * px)}px above the bottom edge; a photo with more of the body in frame would fill the card`;

  return {
    scale,
    headTopRow,
    headCard: Math.round((PORTRAIT_FIXED_POS.square?.y ?? 202) + headTopRow * px),
    left,
    top,
    subjectBottom,
    bleeds,
    droppedHead: headTopRow > houseTop,
    faceCard: face ? Math.round(face.h * scale * px) : null,
    subjectCard: { w: Math.round(w * px), h: Math.round(h * px) },
    warn,
  };
}

/* Resize + place onto a transparent 2:3 canvas, cropping whatever falls
   outside it (sharp's composite rejects negative offsets, so trim first). */
async function frame(rawPath, meta, destPath, framing = FRAMING) {
  const sharp = loadSharp();
  const plan = planFraming(meta, framing);

  const rw = Math.max(1, Math.round(meta.size[0] * plan.scale));
  const rh = Math.max(1, Math.round(meta.size[1] * plan.scale));
  const resized = await sharp(rawPath)
    .resize(rw, rh, { kernel: "lanczos3", fit: "fill" })
    .png()
    .toBuffer();

  const sx = Math.max(0, -plan.left);
  const sy = Math.max(0, -plan.top);
  const dx = Math.max(0, plan.left);
  const dy = Math.max(0, plan.top);
  const sw = Math.min(rw - sx, CANVAS_W - dx);
  const sh = Math.min(rh - sy, CANVAS_H - dy);
  if (sw <= 0 || sh <= 0) throw new Error("framing placed the portrait entirely off-canvas");

  const piece = await sharp(resized).extract({ left: sx, top: sy, width: sw, height: sh }).toBuffer();

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await sharp({
    create: { width: CANVAS_W, height: CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: piece, left: dx, top: dy }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(destPath);

  return plan;
}

/* ── public entry point ──────────────────────────────────────────────────── */

/* A photo that already carries transparency is taken to be a hand-made cutout
   and left alone, so posts that name one explicitly keep rendering as before. */
export async function isCutout(photoPath) {
  if (!photoPath || photoPath.startsWith("data:")) return true;
  try {
    return Boolean((await loadSharp()(photoPath).metadata()).hasAlpha);
  } catch {
    return true; /* unreadable — leave it to the existing photo handling */
  }
}

/**
 * Ensure a framed cutout exists for `photoPath`, generating it if needed.
 * Returns the cutout path, or null when removal is unavailable (caller should
 * fall back to the original photo).
 */
export async function ensureCutout(photoPath, stem, { model = "u2net", force = false } = {}) {
  const dest = path.join(CUTOUT_DIR, `${stem}-cutout.png`);
  const stamp = path.join(RAW_DIR, `${stem}-framed.json`);
  const key = `${cacheKey(photoPath, model)}:v${FRAMING_VERSION}`;

  if (!force && fs.existsSync(dest) && fs.existsSync(stamp)) {
    try {
      if (JSON.parse(fs.readFileSync(stamp, "utf8")).key === key) return dest;
    } catch {
      /* regenerate */
    }
  }

  const made = await rawCutout(photoPath, stem, model);
  if (!made) return null;

  const plan = await frame(made.raw, made.meta, dest);
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(stamp, JSON.stringify({ key, plan }, null, 2));

  const face = plan.faceCard ? `face ${plan.faceCard}px` : "no face detected";
  console.log(`  · cutout ${path.basename(dest)} (${face}, ${plan.subjectCard.w}x${plan.subjectCard.h} card px)`);
  if (plan.warn) console.warn(`    ! ${plan.warn}`);
  return dest;
}

export { CANVAS_W, CANVAS_H, FRAMING };
export default { ensureCutout, isCutout, planFraming, FRAMING };
