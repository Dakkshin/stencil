/**
 * The IU atmosphere — the same system as iu-podcast-thumbnails/lib/motif.mjs,
 * adapted to social canvases:
 *
 *   ground   Depth radial (dark) or Air linear (light)
 *   lobes    two soft colour fields, top-right + bottom-left
 *   arcs     nested concentric hairlines centred OFF-canvas at the bottom-left,
 *            so they sweep in from the corner (never an on-canvas bullseye)
 *   grain    a fine noise layer over everything below the content — kills
 *            gradient banding and reads as designed, not exported
 *   petal    the logo's own three strokes, used once as a small sign-off mark
 *
 * Nothing here is redrawn from the logo: the petal paths are lifted verbatim
 * from assets/iu-logo-reversed.svg.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { splitColor } from "./scene.mjs";
import { GEN, LOGOS } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVERSED_LOGO = path.join(LOGOS, "iu-logo-reversed.svg");
const GRAIN_DIR = path.join(GEN, "grain");

const n = (v) => Number(v.toFixed(2));

/* ---------------- ground + lobes ---------------- */

export function ground(s, theme) {
  const { w: W, h: H } = s;
  const g = theme.ground;
  const fill = g.type === "radial"
    ? { type: "radial", user: true, cx: g.cx * W, cy: g.cy * H, r: g.r * Math.max(W, H), stops: g.stops }
    : { type: "linear", x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, stops: g.stops };
  s.rect({ x: 0, y: 0, w: W, h: H, fill, name: "Ground" });
  s.group("Glow", () => {
    for (const l of theme.lobes) {
      s.ellipse({
        cx: l.cx * W, cy: l.cy * H, rx: l.rx * W, ry: l.ry * H,
        fill: { type: "radial", cx: 0.5, cy: 0.5, r: 0.5, stops: [[l.color, 0, l.alpha], [l.color, 1, 0]] },
        name: "Glow lobe",
      });
    }
  });
}

/* ---------------- arc field ---------------- */

/**
 * Concentric hairlines around (cx, cy), default off-canvas bottom-left.
 * Radii grow geometrically (ratio) so the spacing reads even; opacity fades
 * with radius. Returns the centre so a layout can echo it (e.g. a route line).
 */
export function arcs(s, theme, { cx = -0.26 * s.w, cy = 1.22 * s.h, ratio = 1.075, strokeW = 1.2 } = {}) {
  const far = Math.hypot(s.w - cx, 0 - cy);
  const r0 = 0.28 * Math.min(s.w, s.h);
  const steps = Math.floor(Math.log(far / r0) / Math.log(ratio)) + 1;
  const [a0, a1] = theme.arcOpacity;
  s.group("Arc field", () => {
    let r = r0;
    for (let i = 0; r <= far; i++, r *= ratio) {
      const t = i / Math.max(1, steps - 1);
      s.circle({ cx, cy, r, stroke: theme.arc, sw: strokeW, strokeOpacity: a0 + (a1 - a0) * t, name: "Arc" });
    }
  });
  return { cx, cy };
}

/* ---------------- grain ---------------- */

/* Deterministic sparse noise, half resolution (upscaled 2× on the canvas):
   half the pixels transparent, the rest white or black at low alpha. Grey+alpha
   PNG keeps the embedded file ~1 MB. Cached per canvas size. */
async function grainPng(w, h) {
  const file = path.join(GRAIN_DIR, `grain-v2-${w}x${h}.png`);
  if (fs.existsSync(file)) return file;
  const sharp = createRequire(import.meta.url)("sharp");
  const gw = Math.round(w / 2), gh = Math.round(h / 2);
  const buf = Buffer.alloc(gw * gh * 2);
  /* mulberry32 — an LCG's low bits stripe visibly once upscaled. */
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < gw * gh; i++) {
    const r = rnd();
    if (r < 0.5) continue;
    buf[i * 2] = rnd() < 0.5 ? 0 : 255;
    buf[i * 2 + 1] = Math.round(40 + rnd() * 150);
  }
  fs.mkdirSync(GRAIN_DIR, { recursive: true });
  await sharp(buf, { raw: { width: gw, height: gh, channels: 2 } }).png({ compressionLevel: 9 }).toFile(file);
  return file;
}

export async function grain(s, theme) {
  if (!theme.grain) return;
  const file = await grainPng(s.w, s.h);
  const href = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  s.image({ href, x: 0, y: 0, w: s.w, h: s.h, opacity: theme.grain, name: "Grain" });
}

/* ---------------- petal triad ---------------- */

const PETAL = {
  logoTransform: "translate(0,1360) scale(0.1,-0.1)",
  box: { x: 0, y: 4, w: 536, h: 1344 }, // tight box of paths 0–2 in viewBox space
};
let _petals = null;
function petalPaths() {
  if (_petals) return _petals;
  const src = fs.readFileSync(REVERSED_LOGO, "utf8");
  const all = [...src.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
  if (all.length < 3) throw new Error("atmosphere: iu-logo-reversed.svg lost its petal paths");
  _petals = all.slice(0, 3);
  return _petals;
}

/** The petal mark, positioned by its bottom-left corner; height-driven (~1:2.5). */
export function petal(s, theme, { x, y, h, opacity = theme.motifOpacity }) {
  const k = h / PETAL.box.h;
  const tx = x - k * PETAL.box.x;
  const ty = y - h - k * PETAL.box.y;
  const grad = s.paint("fill", {
    type: "linear", x1: 0, y1: 0, x2: 0.35, y2: 1,
    stops: [[theme.motifA, 0], [theme.motifB, 1]],
  }, opacity);
  const paths = petalPaths().map((d) => `<path d="${d}"/>`).join("");
  s.raw(`<g data-name="Petal mark" transform="translate(${n(tx)} ${n(ty)}) scale(${k.toFixed(5)})"><g ${grad} transform="${PETAL.logoTransform}">${paths}</g></g>`);
  return { w: PETAL.box.w * k, h };
}

export const PETAL_ASPECT = PETAL.box.w / PETAL.box.h;

/* ---------------- whole background ---------------- */

export async function background(s, theme, opts = {}) {
  ground(s, theme);
  const origin = arcs(s, theme, opts.arcs);
  await grain(s, theme);
  return origin;
}

export { splitColor };
