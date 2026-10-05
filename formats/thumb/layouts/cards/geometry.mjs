/**
 * lib/geometry.mjs — single source of truth for the thumbnail's spatial and
 * typographic geometry.
 *
 * Both renderers derive from these numbers:
 *   - render-svg.mjs imports them directly and lays out with lib/layout.mjs;
 *   - scripts/build-template.mjs injects the same `G` object and the same
 *     lib/layout.mjs functions into the HTML template, so the PNG and the SVG
 *     compute every box from one implementation;
 *   - the few values the template still carries as static CSS are asserted by
 *     `templateChecks()` (`npm run build:template` throws on drift).
 */
import fs from "node:fs";

export const CANVAS = { w: 1280, h: 720 };

/* Root safe padding — vertical clears the 8% title-safe floor (72/720 = 10%). */
export const PAD = { x: 64, y: 72 };

export const TOP_GAP = 24; // .top margin-bottom
export const MID_GAP = 48; // lead column to the band's first card

/* The lockup is a media-property mark, not a watermark: held quiet at 152 px. */
export const LOGO = { w: 152, ratio: 340 / 462 };
export const LOGO_H = (LOGO.w * 340) / 462; // 111.86

/* Episode chip, top right, vertically centred on the lockup. */
export const CHIP = { h: 32, padX: 16, padY: 8, size: 12, track: 1.92 };

/* Claim sizes — three fit-variants of the single display tier, by guest count.
   The duo gives 4px of claim to the faces: 48px buys 248px cards (124px faces).
   Every corpus line fits its column on one line (lib/widths.json):
     solo  "You negotiated your fees."   665px @ 60 in a 720 column
     duo   "The revenue equation every"  580px @ 48 in a 592 column
     row   "Map what it actually …"      729px @ 52 in a 1024 column */
export const TITLE = { 1: { size: 60 }, 2: { size: 48 }, 3: { size: 52 } };
export const TYPE = { leading: 1.05, track: -0.022, accent: 0.82 };

/* The kicker is a plain block line: no leading rule (it read as an em dash). */
export const KICKER = { h: 16, gap: 24, size: 13, track: 2.34 };

/* ============================================================
   Cards — every guest stands in one rounded portrait card
   ============================================================
   A card is 4:5. Cut-outs are framed inside it from the face box recorded in
   the cut-out sidecar (lib/cutout.py): the window is 2.0 face heights wide,
   0.7 above the face top and 1.8 below, so every guest in a composition shows
   the same head size and eye line. Both sources fit that window without
   reaching an image edge (Naren 53..523 of 600, Manjali 98..333 of 400). */
/* Corner radius follows the label tier: S-tier (crowd) cards use the smaller one. */
export const CARD = { ratio: 1.25, gap: 16, radius: 24, radiusS: 16 };
export const WINDOW = { w: 2.0, above: 0.7, below: 1.8 };

/* Band (1–2 guests): lead column left, cards right. The stage starts one gap
   below the episode chip and ends on the safe floor; a solo card fills it, a
   duo is centred on it, and the lead is centred on the same line. */
export const BAND = { stageTop: 168, stageBottom: 648, w: { 1: 384, 2: 248 } };

/* Row (3+ guests): one claim line across the top, a row of cards beneath it
   that takes whatever height the lead leaves (4:5, never wider). */
export const ROW = { leadW: 1024, gapAbove: 32 };

/* The label: name + one meta line (role · company), docked bottom-left inside
   the card. Tiered by face height so it never reaches the chin
   (label height + inset ≤ 0.8 × faceH, asserted in tests/layout.test.mjs). */
export const LABEL = {
  L: { minFace: 160, inset: 16, padX: 16, padY: 12, radius: 12, name: 20, meta: 13, gap: 4 },
  M: { minFace: 96, inset: 12, padX: 12, padY: 8, radius: 10, name: 16, meta: 12, gap: 2 },
  S: { minFace: 0, inset: 8, padX: 8, padY: 6, radius: 8, name: 13, meta: 0, gap: 0 },
  nameLH: 1.2,
  metaLH: 1.35,
};

/* Monogram for a guest with no photo, centred on where the face would be. */
export const MONOGRAM = { size: 0.5 }; // × faceH

/* The petal sign-off: punctuation after the last headline line, as on the
   social posts. Sizes are multiples of that line's font size. */
export const MARK = { h: 0.9, gap: 0.22, drop: 0.06, opacity: 0.9 };

/* ============================================================
   Atmosphere — petal triad + concentric arc field
   ============================================================ */
export const PETAL = {
  /* viewBox of assets/iu-logo-reversed.svg and the transform its paths carry. */
  viewBox: "0 0 1848 1360",
  logoTransform: "translate(0.000000,1360.000000) scale(0.100000,-0.100000)",
  /* Tight box of paths 0–2, measured in viewBox space (render-and-trim). */
  viewBoxBox: { x: 0, y: 4, w: 536, h: 1344 },
};

/* Hairline arcs centred off-canvas at the bottom-left, so they enter the
   canvas as broad sweeps rather than an on-canvas bullseye. */
export const ATMOS = {
  cx: -260,
  cy: 900,
  r0: 380,
  r1: 1700,
  ratio: 1.075,
  strokeW: 1,
  arcOpacity: [0.055, 0.022],
};

/* hhea ascent/descent as a fraction of font-size, from the shipped woff2. */
export const FONT_METRICS = {
  display: { asc: 0.9688, desc: 0.2412 },
  sans: { asc: 0.9688, desc: 0.2412 },
  serif: { asc: 1.007, desc: 0.298 },
};

/* Real glyph advances (em) — display = Inter Display 600, sans = Inter 600,
   serif = EB Garamond 500 italic. Within 0.3% of Chrome's kerned widths. */
export const WIDTHS = JSON.parse(fs.readFileSync(new URL("./widths.json", import.meta.url), "utf8"));

/**
 * Everything lib/layout.mjs needs, as plain data. The template receives this
 * exact object as `IU_GEOM`, so it must stay JSON-serialisable.
 */
export const G = {
  canvas: CANVAS,
  pad: PAD,
  topGap: TOP_GAP,
  midGap: MID_GAP,
  logo: { w: LOGO.w, h: LOGO_H },
  chip: CHIP,
  title: TITLE,
  type: TYPE,
  kicker: KICKER,
  card: CARD,
  window: WINDOW,
  band: BAND,
  row: ROW,
  label: LABEL,
  monogram: MONOGRAM,
  mark: MARK,
  petal: { w: PETAL.viewBoxBox.w, h: PETAL.viewBoxBox.h },
  fonts: FONT_METRICS,
  widths: WIDTHS,
};

/**
 * CSS fragments the template source must contain verbatim. Each entry is
 * [needle, human label]. build-template.mjs asserts every needle is present so
 * the static CSS and this module can never silently diverge. Everything that
 * moves per composition is computed by lib/layout.mjs instead, so it cannot
 * drift at all.
 */
export function templateChecks() {
  return [
    [`padding: ${PAD.y}px ${PAD.x}px;`, "canvas safe padding"],
    [`margin-bottom: ${TOP_GAP}px;`, ".top gap"],
    [`width: ${LOGO.w}px; height: auto;`, "logo width"],
    [`height: ${CHIP.h}px; padding: 0 ${CHIP.padX}px;`, "episode chip box"],
    [`font-size: ${CHIP.size}px;`, "episode chip size"],
    [`height: ${KICKER.h}px; line-height: ${KICKER.h}px; margin: 0 0 ${KICKER.gap}px;`, "kicker line"],
    [`font-size: ${KICKER.size}px;`, "kicker size"],
    [`font-size: ${TITLE[1].size}px; line-height: ${TYPE.leading};`, "title size 1 + leading"],
    [`.canvas.size-2 .title { font-size: ${TITLE[2].size}px; }`, "title size 2"],
    [`.canvas.size-3 .title { font-size: ${TITLE[3].size}px; }`, "title size 3"],
    [`font-size: ${TYPE.accent}em;`, "accent line size"],
    [`line-height: ${LABEL.nameLH};`, "label name leading"],
    [`line-height: ${LABEL.metaLH};`, "label meta leading"],
    ["<!-- __ATMOSPHERE__ -->", "atmosphere injection token"],
    ["<!-- __PETAL__ -->", "petal mark injection token"],
  ];
}

export function verifyTemplate(src) {
  return templateChecks()
    .filter(([needle]) => !String(src).includes(needle))
    .map(([, label]) => label);
}
