/**
 * host-background — every number on the canvas.
 *
 * This surface shares the canvas, the brand and the shape library with the deck
 * (../lib/geometry.mjs, ../../panel-social-posts/brands.mjs). What is surface-specific
 * here is the COMPOSITION AXIS, and only the numbers that express it live in this file.
 *
 * Why the axis differs from the deck's:
 *
 *  - The deck lays text left and imagery right, so its gradient glows at 78% x and its
 *    dots texture fades in from the left. Content has a direction of travel.
 *  - A virtual background sits BEHIND a person. The subject owns the centre of the
 *    frame, and Zoom owns the bottom centre (meeting controls, the name tag under the
 *    video). Every element that carries information therefore lives at the top and
 *    bottom EDGES, and the middle mirrors itself: light centred behind the host, dots
 *    receding from the centre outward. zoom-banner documents the same lesson for its
 *    symmetric strip — a symmetric layout cannot sit on a directional gradient.
 *
 * Colours never live here. They come from ../panel-social-posts/brands.mjs, which is
 * the single source of palette truth across every OBA tool. Structural alphas (floor
 * scrim, hairline, texture) describe surface treatment, not brand hue, so they may.
 */

import { CANVAS, GRID, SURFACE, TYPE } from "../deck/lib/geometry.mjs";

/* Shared with the deck: 1920x1080 at 1:1, content margin, and the header/footer band
   rows the deck's chrome already sits in (header top 84, footer rule 956, footer
   baseline 990). Reusing them is what makes this read as OBA furniture instead of a
   second, coincidentally-similar design. */
export { CANVAS, GRID, SURFACE, TYPE };

/* Content margins — same 120px as the deck grid, so text rows line up with deck slides
   when both are on screen. */
export const PAD = { x: GRID.x0, x1: GRID.x1, top: 84 };

/* Identity row — the eyebrow wording, its dot, and the logo mark at top right. At the
   deck's sizes these read small against a 1920 canvas (they are sized for projected
   slides that also carry content); here they ARE the content on screen, so the host
   scaled them up. One factor drives text, dot, gap and logo together (+20%, Sept
   2026). Everything derived below is rounded off this single value. */
export const IDENTITY = {
  scale: 1.2,
  logoH: Math.round(SURFACE.logoH * 1.2),        // 66 (deck logo is 55)
  dotR: Math.round(SURFACE.eyebrowDotR * 1.2),    // 8 (deck 7)
  gap: Math.round(SURFACE.eyebrowGap * 1.2),      // 14 (deck 12)
  // Eyebrow type: TYPE.eyebrow (26) scaled by the same factor -> 31. Not a deck token
  // by design; kept dimensionless so tracking/lh ride along automatically.
  eyebrowFs: Math.round(TYPE.eyebrow.fs * 1.2),
};

/* The bottom of the canvas reads as a floor. */
export const FLOOR = {
  y: 720,
  maxAlpha: 0.5,
};

/* The gradient behind the host is centred rather than biased to one side (see header
   comment). Lobe geometry is expressed as percentages of the canvas so the radial
   feels the same relative weight as the brand's 115%/90% hero. */
export const BACKDROP = {
  /* --gradient-hero, recentred at 50% x / 30% y so the brightest slate sits behind the
     host's head rather than behind the empty right edge. */
  hero: { cx: 0.5, cy: 0.3, rx: 1.15, ry: 0.95 },
  /* Soft key-light lobe right behind the face. The brand lobe sits at 72% x on the
     deck because imagery lives there; here the "imagery" is the person. */
  glow: { cx: 0.5, cy: 0.28, rx: 0.6, ry: 0.52, opacity: 0.5 },
};

/* Dots texture — centre-clean by intent.
 *
   OBA BRAND.md §5.1: dots are 9% white on an 18px grid and masked so they "only
   appear on the imagery side, never behind primary text". On this surface the primary
   subject IS the centre (the host), so the mask inverts: nothing within
   `clearHalf` of the middle, ramping up to `layerOpacity` by the edges. Same spirit,
   mirrored axis — the deck's version is louder on purpose and must not be written
   back to the shared social-post settings; this one is now louder still — the dot
   peaks read ~50 luma over the gaps at the fade's outer edge, per a Sept 2026
   request (see `alpha` below). A backdrop may not compete with a face, so the centre
   stays clear regardless. */
export const DOTS = {
  spacing: 28,
  radius: 1.6,
  /* Dot white strength. Raised to 0.55 (Sept 2026, host requested a 50-luma lift):
     nominal peak opacity 0.55 x 0.6 = 0.33 measures ~50 luma between dot peaks and
     gaps at the fade's outer edge (0.50 measured 46) — deliberately louder than any
     sibling value (deck is 0.09 effective; the "visible mesh" first pass was 0.119).
     The envelope shape is untouched: still nothing within `clearHalf` of the middle. */
  alpha: 0.55,
  layerOpacity: 0.6,
  clearHalf: 360,   // |dx| below this: no dots at all
  rampTo: 900,      // |dx| at which dots reach layerOpacity
  bands: 26,
};

/* Footer row — same verticals as the deck footer so the two surfaces agree at a
   glance. Rule at 956, text/waveform baselines at 990/1016. */
export const FOOT = {
  ruleY: 956,
  textTop: 990,
  waveBottom: CANVAS.h - 64,
};

/* Font floor. The deck forbids text below 16px because a deck is thumbnailed inside a
   Zoom tile. This surface IS the tile, full-frame, so it can afford to be larger — but
   it must never dip below the deck's 16px floor either: the host shares their screen
   and the whole frame is downscaled into the corner of a webinar. Nothing set here
   goes below TYPE.monoLabel (16px); the smallest size actually in use is the footer's
   TYPE.monoLead (20px). */
export const MIN_TYPE = 16;
