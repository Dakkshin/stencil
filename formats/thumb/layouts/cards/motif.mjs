/**
 * lib/motif.mjs — the Insurance Untangled atmosphere layer and petal mark.
 *
 * Two ingredients, one origin:
 *
 *   1. a **nested concentric arc field** — a very low opacity hairline field
 *      anchored off-canvas at the bottom-left, so the arcs enter the canvas as
 *      broad sweeps rather than an on-canvas bullseye. Emitted as ONE fragment
 *      (`atmosphereFragment()`) consumed by both renderers.
 *   2. the **petal triad** — the logo's own three strokes (paths 0–2 of
 *      assets/iu-logo-reversed.svg), used once as punctuation after the last
 *      headline line, as on the social posts. Nothing is redrawn: the paths are
 *      lifted from the traced master, so the mark can never drift from the brand.
 *      Its position comes from `compose()` in lib/layout.mjs.
 *
 *   - template/iu-thumbnail.src.html  inline SVG; colours come from CSS custom
 *     properties (`var(--iu-arc)` …) so the theme switch is pure CSS;
 *   - render-svg.mjs  static SVG; `substitutePaint()` swaps the same custom
 *     properties for literal theme colours.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOGOS } from "../../../../core/paths.mjs";
import { ATMOS, PETAL, MARK } from "./geometry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REVERSED_LOGO = path.join(LOGOS, "iu-logo-reversed.svg");

/* The logo's three petal strokes are the first three <path> elements, ahead of
   the letterforms. Verified by isolating them and rasterising. */
const PETAL_PATH_INDEXES = [0, 1, 2];

let _cache = null;

/** The three petal `d` strings, lifted from the traced reversed logo. */
export function petalPaths() {
  if (_cache) return _cache;
  const src = fs.readFileSync(REVERSED_LOGO, "utf8");
  const all = [...src.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
  if (all.length <= Math.max(...PETAL_PATH_INDEXES)) {
    throw new Error(
      `motif: assets/iu-logo-reversed.svg has ${all.length} paths, expected the petals first`,
    );
  }
  _cache = PETAL_PATH_INDEXES.map((i) => all[i]);
  return _cache;
}

/** True when `src` still carries enough paths for the triad to be extracted. */
export function verifyMotif(src) {
  const all = String(src).match(/<path\b/g) || [];
  return all.length > Math.max(...PETAL_PATH_INDEXES);
}

const n = (v) => Number(v.toFixed(2));

/**
 * The petal triad, positioned by its bottom-left corner (render-svg.mjs).
 * Height-driven: the mark is tall and narrow (~1 : 2.5).
 */
export function petalTriad({ x, y, h, paint = defaultPaint() }) {
  const s = h / PETAL.viewBoxBox.h;
  const tx = x - s * PETAL.viewBoxBox.x;
  const ty = y - h - s * PETAL.viewBoxBox.y;
  const paths = petalPaths()
    .map((d) => `<path d="${d}"/>`)
    .join("");
  return (
    `<g data-name="Petal triad" transform="translate(${n(tx)} ${n(ty)}) scale(${s.toFixed(5)})">` +
    `<defs><linearGradient id="iu-mark-grad" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0" stop-color="${paint.motifA}"/>` +
    `<stop offset="1" stop-color="${paint.motifB}"/>` +
    `</linearGradient></defs>` +
    `<g fill="url(#iu-mark-grad)" fill-opacity="${MARK.opacity}" transform="${PETAL.logoTransform}">${paths}</g>` +
    `</g>`
  );
}

/**
 * Nested concentric arcs, centred off-canvas at the bottom-left. Radii advance
 * geometrically so the spacing stays even in optical terms and never aliases
 * into a uniform grid. The SVG viewport clips them, so only the sweeping
 * on-canvas portions are ever drawn.
 */
export function arcField({ paint = defaultPaint(), cx = ATMOS.cx, cy = ATMOS.cy } = {}) {
  const arcs = [];
  const steps = Math.floor(Math.log(ATMOS.r1 / ATMOS.r0) / Math.log(ATMOS.ratio)) + 1;
  let r = ATMOS.r0;
  let i = 0;
  while (r <= ATMOS.r1) {
    const t = i / Math.max(1, steps - 1);
    const opacity = ATMOS.arcOpacity[0] + (ATMOS.arcOpacity[1] - ATMOS.arcOpacity[0]) * t;
    arcs.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${paint.arc}" stroke-opacity="${opacity.toFixed(3)}" stroke-width="${ATMOS.strokeW}"/>`,
    );
    r *= ATMOS.ratio;
    i += 1;
  }
  return `<g data-name="Arc field">${arcs.join("")}</g>`;
}

/** The whole atmosphere layer, in canvas coordinates (1280 × 720): the arc
    field only. The petal moved to the end of the headline (see petalInner). */
export function atmosphereFragment(paint = defaultPaint()) {
  return `<g data-name="Atmosphere">${arcField({ paint })}</g>`;
}

/** The petal's tight viewBox, for an inline <svg> sized to the mark box. */
export const PETAL_VIEWBOX = `${PETAL.viewBoxBox.x} ${PETAL.viewBoxBox.y} ${PETAL.viewBoxBox.w} ${PETAL.viewBoxBox.h}`;

/**
 * The petal's inner markup for an inline <svg viewBox={PETAL_VIEWBOX}> (the
 * template): same paths, gradient and opacity as `petalTriad()`, so the two
 * renderers paint the identical mark.
 */
export function petalInner(paint = defaultPaint()) {
  const paths = petalPaths()
    .map((d) => `<path d="${d}"/>`)
    .join("");
  return (
    `<defs><linearGradient id="iu-mark-grad" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0" stop-color="${paint.motifA}"/>` +
    `<stop offset="1" stop-color="${paint.motifB}"/>` +
    `</linearGradient></defs>` +
    `<g fill="url(#iu-mark-grad)" fill-opacity="${MARK.opacity}" transform="${PETAL.logoTransform}">${paths}</g>`
  );
}

/**
 * Default paint uses CSS custom properties so the HTML template can theme the
 * atmosphere with plain CSS. render-svg.mjs replaces these with literal colours.
 */
export function defaultPaint() {
  return {
    arc: "var(--iu-arc)",
    motifA: "var(--iu-motif-a)",
    motifB: "var(--iu-motif-b)",
  };
}

/** Swap the CSS custom properties for literal colours (render-svg.mjs). */
export function substitutePaint(fragment, paint) {
  return fragment
    .replaceAll("var(--iu-arc)", paint.arc)
    .replaceAll("var(--iu-motif-a)", paint.motifA)
    .replaceAll("var(--iu-motif-b)", paint.motifB);
}

/** Per-theme literal colours, mirroring the template's CSS custom properties. */
export const THEME_PAINT = {
  dark: { arc: "#8BB3E2", motifA: "#8BB3E2", motifB: "#6289D9" },
  light: { arc: "#4D7BAC", motifA: "#4D7BAC", motifB: "#2A3A71" },
};
