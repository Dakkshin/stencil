/**
 * IU design tokens for the social-post layouts. Single source of truth for
 * colour, canvas, spacing and type scale. Values come from the IU brand
 * guidelines v2 (§2 palette, §3 type sizes, §5 radii) and match the IU podcast
 * thumbnail generator's themes.
 *
 * Layout modules must take every colour and size from here — no inline hexes.
 */

export const C = {
  INK950: "#12182B",
  CHARCOAL: "#2B2B2C",
  IU_NAVY: "#2A3A71",
  IU_BLUE: "#4D7BAC",
  CLARITY: "#6289D9",
  INDIGO: "#7277D2",
  SKY: "#8BB3E2",
  POWDER: "#C8DDF5",
  SIGNAL: "#35C7B6", // reserved: action / resolved state — at most ONE use per post
  CLOUD: "#F4F7FB",
  WHITE: "#FFFFFF",
  RULE: "#D8E0EB",
};

/* Canvases built by the IU renderer. Story + landscape come in a later pass. */
export const FORMATS = {
  square: { w: 1080, h: 1080, pad: 72, name: "Square 1080×1080" },
  portrait: { w: 1080, h: 1350, pad: 72, name: "Portrait 1080×1350" },
};
export const SUPPORTED_FORMATS = Object.keys(FORMATS);

/* 8pt spacing scale. */
export const SPACE = { xs: 8, s: 16, m: 24, l: 32, xl: 48, xxl: 64 };

/* Registration QR block — one rule for every post type (OBA parity in IU voice).
   The supplied image frame keeps its 160px edge on a 1080 canvas; the
   SCAN TO / REGISTER stack below it is what makes the QR a register path
   instead of decoration. Single source of truth — qr.mjs must use these. */
export const QR = {
  edge: 160,
  labelInnerGap: 4,
  scanFs: 15,
  regFs: 23,
};

/* §5 radius language. */
export const RADIUS = { card: 20, soft: 12, pill: 999 };

/* §3 type sizes per format (px). display = claim, card = section/names,
   body = supporting, caption = metadata floor (never go below it).
   2026-09-23: small tiers raised after "the wording looks too small" feedback.
   Display grows only a little, so the claim still dominates. Ratios kept:
   display ≈ 2.7× body, body ≈ 1.4× caption. Caption sits just above §3's
   18–20 range on purpose — feed legibility beats the range. */
export const TYPE = {
  square: { display: 80, displayMax: 96, card: 44, body: 30, caption: 21 },
  portrait: { display: 90, displayMax: 112, card: 50, body: 33, caption: 23 },
};

/* Shared type recipes. `tracking` is in em; `upper` uppercases the string. */
export const FONT = {
  claim: { role: "display", weight: 600, style: "normal", tracking: -0.022 },
  claimLight: { role: "display", weight: 500, style: "normal", tracking: -0.02 },
  accent: { role: "serif", weight: 500, style: "italic", tracking: -0.005 },
  label: { role: "sans", weight: 600, style: "normal", tracking: 0.16, upper: true },
  meta: { role: "sans", weight: 500, style: "normal", tracking: 0.04 },
  body: { role: "sans", weight: 400, style: "normal", tracking: 0 },
  name: { role: "display", weight: 600, style: "normal", tracking: -0.01 },
  cta: { role: "sans", weight: 600, style: "normal", tracking: 0.01 },
};

/* The accent line is set smaller than the claim, as in the thumbnails. */
export const ACCENT_SCALE = 0.86;

/* Line-height multipliers. */
export const LH = { claim: 1.04, accent: 1.12, body: 1.35, label: 1.2 };

/* Themes. `IU` = Depth ground (dark, default); `IU_LIGHT` = Air ground. */
export const THEMES = {
  IU: {
    id: "IU",
    mode: "dark",
    ground: {
      type: "radial", cx: 0.86, cy: 0.06, r: 1.3,
      stops: [["#1B2560", 0], ["#12182B", 0.55], ["#0A0F22", 1]],
    },
    lobes: [
      { cx: 0.92, cy: 0.12, rx: 0.62, ry: 0.5, color: C.CLARITY, alpha: 0.30 },
      { cx: 0.04, cy: 0.98, rx: 0.6, ry: 0.42, color: C.INDIGO, alpha: 0.22 },
    ],
    fg: C.WHITE,
    fgMuted: "rgba(255,255,255,0.68)",
    fgFaint: "rgba(255,255,255,0.46)",
    kicker: C.SKY,
    accentText: C.WHITE,
    arc: C.SKY,
    arcOpacity: [0.12, 0.05],
    motifA: C.SKY,
    motifB: C.CLARITY,
    motifOpacity: 0.55,
    line: "rgba(255,255,255,0.14)",
    glass: "rgba(255,255,255,0.08)",
    glassLine: "rgba(255,255,255,0.18)",
    pillLine: "rgba(255,255,255,0.26)", // outline pills need more than a hairline
    plate: "rgba(10,15,34,0.62)",
    ring: C.SKY,
    signal: C.SIGNAL,
    onSignal: C.INK950,
    tileFill: "#1E2749",
    grain: 0.09,
    logo: "assets/iu-logo-reversed.svg",
  },
  IU_LIGHT: {
    id: "IU_LIGHT",
    mode: "light",
    ground: {
      type: "linear", x1: 0, y1: 0, x2: 0.55, y2: 1,
      stops: [[C.WHITE, 0], [C.CLOUD, 0.46], [C.POWDER, 1]],
    },
    lobes: [
      { cx: 0.92, cy: 0.1, rx: 0.6, ry: 0.5, color: C.SKY, alpha: 0.38 },
      { cx: 0.05, cy: 0.96, rx: 0.6, ry: 0.42, color: C.CLARITY, alpha: 0.16 },
    ],
    fg: C.INK950,
    fgMuted: "rgba(18,24,43,0.72)",
    fgFaint: "rgba(18,24,43,0.46)",
    kicker: C.IU_BLUE,
    accentText: C.INK950,
    arc: C.IU_BLUE,
    arcOpacity: [0.14, 0.06],
    motifA: C.IU_BLUE,
    motifB: C.IU_NAVY,
    motifOpacity: 0.6,
    line: C.RULE,
    glass: "rgba(255,255,255,0.72)",
    glassLine: C.RULE,
    pillLine: "rgba(42,58,113,0.34)", // RULE vanishes on the Air ground
    plate: "rgba(255,255,255,0.86)",
    ring: C.IU_BLUE,
    signal: C.SIGNAL,
    onSignal: C.INK950,
    tileFill: "#E6EEF8",
    grain: 0.06,
    logo: "assets/iu-logo.png",
  },
};

export function themeFor(brand) {
  return THEMES[brand] || THEMES.IU;
}

/* Visual hierarchy constants (added for 2026-10 CE stamp + badge de-emphasis).
   The stamp must remain legible and on-canvas but must not compete with hook,
   speaker name, or timing. Base r is a starting point; stampRadius still grows
   it just enough for the label at the min floor. Badge h controls the footer
   PACE plate. These are used by layouts + components; update callsites when
   changing. */
export const CE = {
  stampBaseR: { square: 86, portrait: 94 }, // was ~100/115 — smaller supporting role
  stampMinLabel: 17,                         // was 19/23 — reduced slightly so "CE CREDIT" fits on one line
  badgeH: { square: 72, portrait: 80 },      // was 84/92 — less competition in footer
};
