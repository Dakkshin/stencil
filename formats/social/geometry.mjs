/**
 * panel-social-posts — shared geometry.
 *
 * Single source of truth for canvas formats, typography, and the headshot
 * tile layout. Imported by render-svg.mjs (Node). The HTML template embeds
 * the same numbers as CSS variables (via the JSON injected by render.mjs, or
 * its inline defaults) so the PNG and the Canva SVG stay in sync.
 *
 * Keep FORMATS / TYPE / tileLayout() in sync with the inline defaults at the
 * top of template.html if you ever change them here.
 */

/* Canvas formats. 2× DPR exports are handled by render.mjs (doubled in size). */
export const FORMATS = {
  square: { w: 1080, h: 1080, pad: 56, padTop: 46, padBottom: 42, name: "Square 1080×1080" },
  portrait: { w: 1080, h: 1350, pad: 64, padTop: 54, padBottom: 50, name: "Portrait 1080×1350" },
  story: { w: 1080, h: 1920, pad: 64, padTop: 58, padBottom: 58, name: "Story 1080×1920" },
  landscape: { w: 1200, h: 630, pad: 52, padTop: 40, padBottom: 36, name: "Landscape 1200×630" },
};

export const FORMAT_ORDER = ["square", "portrait", "story", "landscape"];

/* Post types — mirrors the campaign sequence of the old picasso tool plus a
   multi-panelist "panel" announcement. */
export const POST_TYPES = [
  "the_intro",
  "intro_panel_one",
  "intro_panel_two",
  "one_more_day",
  "happening_today",
  "panel",
  "speaker_promo",
];

export const POST_TYPE_LABELS = {
  the_intro: "The Intro",
  intro_panel_one: "Intro — Panelist 1",
  intro_panel_two: "Intro — Panelist 2",
  one_more_day: "One More Day",
  happening_today: "Happening Today",
  panel: "Panel Announcement",
  speaker_promo: "Speaker Promo",
};

/* Typography scale per format. Fonts are Inter (300–600) + IBM Plex Mono. */
export const TYPE = {
  square: {
    eyebrow: 15, title: 54, titleLh: 1.08, name: 24, role: 16, category: 14,
    badge: 20, monoPill: 14, bylineName: 22, bylineRole: 15,
  },
  portrait: {
    eyebrow: 16, title: 60, titleLh: 1.08, name: 26, role: 17, category: 15,
    badge: 22, monoPill: 15, bylineName: 24, bylineRole: 16,
  },
  story: {
    eyebrow: 18, title: 74, titleLh: 1.06, name: 30, role: 20, category: 16,
    badge: 26, monoPill: 16, bylineName: 30, bylineRole: 20,
  },
  landscape: {
    eyebrow: 13, title: 44, titleLh: 1.08, name: 20, role: 14, category: 12,
    badge: 17, monoPill: 12, bylineName: 20, bylineRole: 14,
  },
};

/* Typography scale for the speaker-promo layout (large cutout portrait +
   headline + optional top-right QR block + name chip). Only `square` is built
   by default, but the other formats are supported when explicitly requested. */
export const SPEAKER_TYPE = {
  square: {
    eyebrow: 13, title: 54, titleLh: 1.08, event: 26, eventMono: 15,
    qrSize: 158, scan: 18, chipName: 25, chipRole: 18, chipW: 0.46,
  },
  portrait: {
    eyebrow: 14, title: 60, titleLh: 1.08, event: 28, eventMono: 16,
    qrSize: 176, scan: 19, chipName: 28, chipRole: 20, chipW: 0.48,
  },
  story: {
    eyebrow: 14, title: 68, titleLh: 1.06, event: 30, eventMono: 17,
    qrSize: 193, scan: 20, chipName: 31, chipRole: 21, chipW: 0.52,
  },
  landscape: {
    eyebrow: 9, title: 40, titleLh: 1.08, event: 19, eventMono: 14,
    qrSize: 113, scan: 15, chipName: 18, chipRole: 13, chipW: 0.42,
  },
};

/* Group-post QR below the headline (square format only, when event.qr is
   set). Mirrors the speaker-promo QR block style: frosted frame + SCAN TO /
   REGISTER stacked below, left-aligned under the headline inside the title
   column. Single source of truth — template.html CSS and render-svg.mjs must
   use these numbers. Speaker-promo top-right QR is unchanged (SPEAKER_TYPE). */
export const GROUP_QR = {
  size: 158,
  gap: 24,
  innerPad: 6,
  frameRadius: 14,
  labelGap: 4,
  scanFs: 15,
  regFs: 23,
};

/* Compact sizing for group posts with 4+ panelists (the 2×2 grid eats the
   headline column, so the 3-line headline wraps to 5–6 lines). Applied when
   guests.length >= 4 — 1-person countdown/spotlight posts keep the full
   sizes above. Single source of truth — render-svg.mjs (computeLayout) and
   template.html (.canvas.many rules + render()) must use these numbers. */
export const MANY4 = {
  titleScale: 0.72, // × TYPE[format].title (square 54→39, portrait 60→43, story 74→53, landscape 44→32)
  qrBelowSize: 124, // GROUP_QR.size 158 → 124 (square below-headline frame)
  qrBelowScan: 12, // GROUP_QR.scanFs 15 → 12
  qrBelowReg: 18, // GROUP_QR.regFs 23 → 18
  qrFoot: 77, // footer QR 96 → 77 (portrait/landscape)
  qrFootStory: 112, // footer QR 140 → 112 (story)
  ctaFont: 13, // footer CTA 16 → 13
  ctaPad: 10, // footer CTA pad 12 → 10
  ctaFontStory: 18, // story CTA 22 → 18
  ctaPadStory: 14, // story CTA pad 18 → 14
};

/* How much bigger the headshot tiles render than the original layout. The rail
   had more room than it was using; 1.2 takes it back without crowding the
   headline. Every branch below clamps to the rail bounds afterwards, so this
   grows tiles only where there is actually space. */
export const TILE_GROW = 1.2;

/* Rows of the headshot rail, as a count of tiles per row. Three panelists get a
   2-over-1 pyramid (the odd one centred under the pair) rather than a flat row,
   which reads better and leaves each tile far larger. */
function rowPlan(n, format) {
  if (n === 3 && (format === "square" || format === "portrait")) return [2, 1];
  if (n === 4 && (format === "square" || format === "portrait")) return [2, 2];
  if (n >= 7) {
    const plan = [];
    for (let left = n; left > 0; left -= 4) plan.push(Math.min(4, left));
    return plan;
  }
  if (n >= 5) {
    const plan = [];
    for (let left = n; left > 0; left -= 3) plan.push(Math.min(3, left));
    return plan;
  }
  return [n];
}

/* Layout of the headshot rail: how many tiles per row and their size.
   Mirrors the podcast-thumbnails modular layouts (1 solo, 2 duo, 3 pyramid,
   4 grid, 5–6 grid, 7+ circles), scaled to each format. */
export function tileLayout(format, count) {
  const F = FORMATS[format] || FORMATS.square;
  const availW = F.w - F.pad * 2;
  /* Story puts the rail below the title, so it may use the full content
     width; portrait/square/landscape keep the rail beside the headline. */
  const railShare = format === "landscape" ? 0.54 : format === "story" ? 1.0 : 0.47;
  const railMaxW = availW * railShare;
  const gap = format === "story" ? 22 : 18;
  const n = Math.max(count, 1);
  const rowCounts = rowPlan(n, format);
  const cols = Math.max(...rowCounts);
  const rows = rowCounts.length;

  if (n >= 7) {
    const size = Math.min(
      (railMaxW - (cols - 1) * gap) / cols,
      (F.h * 0.55 * TILE_GROW - gap * (rows - 1)) / rows,
    );
    return { cols, rows, rowCounts, tileW: size, tileH: size, gap, circle: true };
  }
  if (n <= 2) {
    const tileW = Math.min((railMaxW - (cols - 1) * gap) / cols, 360 * TILE_GROW);
    const tileH = Math.min(tileW * 1.25, F.h * 0.62);
    return { cols, rows, rowCounts, tileW, tileH, gap, circle: false };
  }
  if (n <= 4) {
    if (rows > 1) {
      /* Pyramid (3) or grid (4): two columns, so each tile can be much wider. */
      let rShare = railShare;
      if (format === "portrait") rShare = 0.40;
      const rMaxW = availW * rShare;
      let tileW = (rMaxW - gap) / cols;
      let tileH = tileW * 1.15;
      const maxTileH = (F.h * 0.40 * TILE_GROW - gap) / rows;
      tileH = Math.min(tileH, maxTileH);
      tileW = tileH / 1.15;
      /* Only square/portrait reach this branch — story and landscape keep flat
         rows, where the rail has the width to spare. */
      const maxW = ({ square: 230, portrait: 200 }[format] || 200) * TILE_GROW;
      if (tileW > maxW) {
        tileW = maxW;
        tileH = tileW * 1.15;
      }
      return { cols, rows, rowCounts, tileW, tileH, gap, circle: false };
    }
    /* Flat row: story/landscape, where the rail has the width to spare. */
    const tileW = (railMaxW - (cols - 1) * gap) / cols;
    const tileH = tileW * 1.25;
    return { cols, rows, rowCounts, tileW, tileH, gap, circle: false };
  }
  const tileW = (railMaxW - (cols - 1) * gap) / cols;
  const tileH = tileW * 1.3;
  return { cols, rows, rowCounts, tileW, tileH, gap, circle: false };
}

/* Offset of tile `idx` from the rail's top-left, in canvas px. Rows that hold
   fewer tiles than the widest row are centred, so a 2-over-1 pyramid puts the
   last tile squarely between the two above it. */
export function tileOffset(L, idx) {
  const counts = L.rowCounts || [L.cols];
  let row = 0;
  let seen = 0;
  while (row < counts.length - 1 && idx >= seen + counts[row]) {
    seen += counts[row];
    row += 1;
  }
  const col = idx - seen;
  const rowW = counts[row] * L.tileW + (counts[row] - 1) * L.gap;
  const fullW = L.cols * L.tileW + (L.cols - 1) * L.gap;
  return {
    x: (fullW - rowW) / 2 + col * (L.tileW + L.gap),
    y: row * (L.tileH + L.gap),
  };
}

/* Monogram font size per tile size (roughly tileW * 0.26). */
export function monogramSize(format, tileW, count) {
  if (count >= 7) return Math.round(Math.min(tileW * 0.3, 34));
  if (count <= 1) return Math.round(Math.min(tileW * 0.26, 96));
  return Math.round(Math.min(tileW * 0.26, 64));
}

/* ---- SVG absolute-layout helpers (mirror the flex template) ---- */

/* Vertical band for the top bar (eyebrow + logo). */
export function topBarBand(F, typeScale) {
  const padTop = F.padTop;
  const lineH = typeScale.eyebrow * 1.3;
  return { top: padTop, height: Math.max(lineH, 30) + 20 };
}

/* Bounds of the middle flex band (title + rail), used to centre the rail. */
export function middleBand(F, typeScale) {
  const top = topBarBand(F, typeScale);
  const bandTop = top.top + top.height;
  const bandBottom = F.h - F.padBottom - footerBand(F, typeScale).height;
  return { top: bandTop, height: Math.max(bandBottom - bandTop, 0) };
}

/* Approximate footer height (rule + byline + foot row). */
export function footerBand(F, typeScale) {
  const byline = typeScale.bylineName * 1.3 + (typeScale.bylineRole ? typeScale.bylineRole * 1.4 + 4 : 0);
  const footRow = Math.max(typeScale.category * 1.5, 30) + 16;
  return { height: 1 + 14 + byline + 12 + footRow };
}

export default { FORMATS, FORMAT_ORDER, POST_TYPES, POST_TYPE_LABELS, TYPE, SPEAKER_TYPE, GROUP_QR, MANY4, tileLayout, tileOffset, monogramSize, TILE_GROW };
