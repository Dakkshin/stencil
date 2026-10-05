#!/usr/bin/env node
/**
 * OBA host background — the single visual source.
 *
 * One layered SVG (1920×1080) that imports the shared OBA machinery instead of
 * duplicating it: brand tokens from ../../panel-social-posts/brands.mjs, fonts and
 * the logo from the same pool, shapes/type from ../lib/draw.mjs and ../lib/geometry.mjs.
 *
 * Everything else on this canvas is local because the composition axis is surface-
 * specific — see ./geometry.mjs for why the light and the texture mirror the deck's
 * instead of matching it.
 *
 * Never hand-edit canva/ or out/. Change CONTENT or ./geometry.mjs and re-run gen.mjs.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BRANDS } from "../deck/lib/brands.mjs";
import { LOGO_BASE, PSP } from "../deck/lib/paths.mjs";

import { CANVAS, SURFACE, TYPE } from "./geometry.mjs";
import { FLOOR, BACKDROP, DOTS, FOOT, PAD, IDENTITY } from "./geometry.mjs";
import {
  fontFaceCss, text, hairline, waveform, waveformWidth,
  brandLogo, dotMarker,
} from "../deck/lib/draw.mjs";

/* ---------------------------------------------------------------- content ---------- */

/**
 * The copy on the background. Everything here is evergreen — this surface is reused
 * across events, so nothing event-specific (dates, panel names) belongs on it. Swap in
 * a panel eyebrow by editing `eyebrow`; the layer names below stay stable.
 */
export const CONTENT = {
  /* Top-left eyebrow, in the deck's header position (dot + tracked mono). */
  eyebrow: "Ophthalmology Business Academy",
  /* Bottom-left mono label — the one fact OBA wants on camera that the logo does not
     already say. obacademy.org is the canonical site across the Sep 2026 panel
     collateral; the decks' "oba.academy" field is inconsistent with it (see README). */
  website: "obacademy.org",
};

export const BRAND = BRANDS.OBA;

/* Logo resolves from the shared pool; missing assets degrade (no logo) not abort. */
const logoFile = () => {
  const p = path.join(LOGO_BASE, BRAND.logo || "assets/oba-logo-white.png");
  return fs.existsSync(p) ? p : "";
};

/* ------------------------------------------------------------------- defs ---------- */

const n = (v) => (Math.round(v * 100) / 100).toString();

const gradStops = (stops) =>
  stops.map(([color, at]) => `      <stop offset="${n(at)}%" stop-color="${color}"/>`).join("\n");

/**
 * Elliptical radial gradient in user space, same trick as ../lib/draw.mjs: SVG radial
 * gradients are circular, so the ellipse is faked by scaling about its centre.
 */
function ellipse(id, cx, cy, rx, ry, stops) {
  const X = cx * CANVAS.w, Y = cy * CANVAS.h;
  const Rx = rx * CANVAS.w, Ry = ry * CANVAS.h;
  return `    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(X)}" cy="${n(Y)}" r="${n(Rx)}"
      gradientTransform="translate(${n(X)},${n(Y)}) scale(1,${n(Ry / Rx)}) translate(${n(-X)},${n(-Y)})">
${gradStops(stops)}
    </radialGradient>`;
}

export function defs() {
  /* Deck vignette geometry — same shape, so corners behave identically to a slide. */
  const v = SURFACE.vignette;
  return `  <defs>
${ellipse("hb-hero", BACKDROP.hero.cx, BACKDROP.hero.cy, BACKDROP.hero.rx, BACKDROP.hero.ry,
  BRAND.gradient.map(([c, at]) => [c, at]))}
${ellipse("hb-glow", BACKDROP.glow.cx, BACKDROP.glow.cy, BACKDROP.glow.rx, BACKDROP.glow.ry,
  [[BRAND.glow, 0], ["rgba(214,228,235,0)", 70]])}
    <linearGradient id="hb-floor" gradientUnits="userSpaceOnUse" x1="0" y1="${n(FLOOR.y)}" x2="0" y2="${n(CANVAS.h)}">
      <stop offset="0%" stop-color="rgba(11,18,32,0)"/>
      <stop offset="100%" stop-color="rgba(11,18,32,${FLOOR.maxAlpha})"/>
    </linearGradient>
    <pattern id="dots-pattern" width="${DOTS.spacing}" height="${DOTS.spacing}" patternUnits="userSpaceOnUse">
      <circle cx="${n(DOTS.spacing / 2)}" cy="${n(DOTS.spacing / 2)}" r="${DOTS.radius}" fill="rgba(255,255,255,${DOTS.alpha})"/>
    </pattern>
${ellipse("vignette", v.cx, v.cy, v.r, v.r * (CANVAS.h / CANVAS.w),
  [["rgba(11,18,32,0)", 0], ["rgba(11,18,32,0)", 55], [`rgba(11,18,32,${v.maxAlpha})`, 100]])}
  </defs>`;
}

/* -------------------------------------------------------------- backdrop ---------- */

/**
 * Four stacked layers, in OBA BRAND.md §5 order: gradient, glow lobe, dots, floor
 * scrim — with the deck's vignette drawn last over everything, exactly as slides do.
 */
function background() {
  const full = `width="${CANVAS.w}" height="${CANVAS.h}"`;
  return `  <g id="hb-background" data-name="Background">
    <rect id="hb-base" data-name="Backdrop gradient" ${full} fill="url(#hb-hero)"/>
    <rect id="hb-glow" data-name="Glow lobe" ${full} fill="url(#hb-glow)" opacity="${BACKDROP.glow.opacity}"/>
${dotsLayer()}
    <rect id="hb-floor" data-name="Floor scrim" ${full} fill="url(#hb-floor)"/>
  </g>`;
}

/**
 * Dots texture, faded out of the CENTRE. The person owns the middle, so the pattern
 * ramps from nothing within `clearHalf` of x=960 up to `layerOpacity` by `rampTo` —
 * the mirror of the deck's left-to-right mask, for the same "never behind the
 * primary subject" reason. Drawn as one group so Canva imports it as a single
 * deletable layer; no SVG mask, so Chrome never rasterizes it (deck CLAUDE.md).
 */
function dotsLayer() {
  const cx = CANVAS.w / 2;
  const bandW = CANVAS.w / DOTS.bands;
  const rects = [];
  for (let i = 0; i < DOTS.bands; i++) {
    const mid = i * bandW + bandW / 2;
    const dx = Math.abs(mid - cx);
    const f = dx <= DOTS.clearHalf ? 0 : Math.min(1, (dx - DOTS.clearHalf) / (DOTS.rampTo - DOTS.clearHalf));
    const o = (DOTS.layerOpacity * f).toFixed(3);
    rects.push(`      <rect x="${n(i * bandW)}" y="0" width="${n(bandW + 0.5)}" height="${CANVAS.h}"` +
      ` fill="url(#dots-pattern)" opacity="${o}"/>`);
  }
  return `    <g id="hb-dots" data-name="Dots texture">\n${rects.join("\n")}\n    </g>`;
}

/* ---------------------------------------------------------------- chrome ---------- */

/** Header row: deck header position — eyebrow dot + mono label left, brand logo right.
    The whole row rides IDENTITY.scale (text size, dot, gap, logo height) so the
    identity grows as one unit; the logo stays right-anchored on the margin. */
function header() {
  /* Scaled eyebrow spec: same token, fs multiplied by IDENTITY.scale. lh and track are
     em-based, so they follow the size automatically. */
  const spec = { ...TYPE.eyebrow, fs: IDENTITY.eyebrowFs };
  const x0 = PAD.x;
  const y = PAD.top;
  const r = IDENTITY.dotR;
  const parts = [
    dotMarker("eyebrow-dot", "Eyebrow dot", x0 + r, y + (spec.fs * spec.lh) / 2, r),
    text("eyebrow", "Eyebrow", x0 + r * 2 + IDENTITY.gap, y, CONTENT.eyebrow, spec,
      "rgba(255,255,255,0.72)", { upper: true }),
  ];
  const logo = logoFile();
  if (logo) parts.push(brandLogo("brand-logo", "OBA logo", logo, PAD.x1, y - 2, IDENTITY.logoH));
  return parts.join("\n");
}

/** Footer row — same verticals as a deck footer: rule, mono label left, equalizer
    right. The label runs one step larger than the deck's (monoLead 20 vs monoLabel 16)
    so the footer keeps its weight now that the header identity has grown. */
function footer() {
  return [
    hairline("footer-rule", "Footer rule", PAD.x, FOOT.ruleY, PAD.x1 - PAD.x),
    text("footer-website", "Footer website", PAD.x, FOOT.textTop, CONTENT.website, TYPE.monoLead,
      "rgba(255,255,255,0.55)", { upper: true }),
    waveform("waveform", "Waveform", PAD.x1 - waveformWidth, FOOT.waveBottom),
  ].join("\n");
}

/* ------------------------------------------------------------ document ----------- */

export function buildBackgroundSvg({ withFonts = true } = {}) {
  const body = [
    defs(),
    withFonts ? fontFaceCss() : "",
    background(),
    `  <g id="chrome" data-name="Chrome">`,
    header(),
    footer(),
    `  </g>`,
    `  <rect id="vignette" data-name="Vignette" width="${CANVAS.w}" height="${CANVAS.h}" fill="url(#vignette)"/>`,
  ].filter(Boolean).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${CANVAS.w}" height="${CANVAS.h}" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}">
  <title>OBA host background</title>
${body}
</svg>`;
}

/* ------------------------------------------------------------- runner ------------ */

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(buildBackgroundSvg());
}
