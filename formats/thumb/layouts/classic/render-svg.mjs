#!/usr/bin/env node
/**
 * Generate layered, Canva-friendly SVG thumbnails from the same JSON configs
 * used by the HTML template.
 *
 * Canva editability rules honoured here:
 *   - Plain <text> elements (best chance of staying editable text in Canva)
 *   - One element = one editable layer, with readable ids/data-names
 *   - The website's real backdrop (radial gradients / glow / dots / scrim) is
 *     baked in so the SVG preview matches the PNG. Canva may flatten those
 *     backdrop layers on import; pass --flat for the old flat-ellipse version.
 *   - Inter + IBM Plex Mono are embedded as base64 woff2 @font-face data URIs
 *     (from oba-website/.next/static/media), so the SVG renders with the same
 *     type as the website instead of falling back to system fonts.
 *
 * Usage:
 *   node render-svg.mjs                      # render all examples/*.json → canva/
 *   node render-svg.mjs -c examples/ep075-solo.json
 *   node render-svg.mjs --preview            # also rasterize PNG previews via sharp
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CANVA, FONTS, LOGOS, ROOT } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.join(__dirname, "examples");
const OUT_DIR = CANVA;

/* ---- canvas geometry (mirrors the HTML template) ---- */
const W = 1280, H = 720;
const PAD_X = 56, PAD_TOP = 44, PAD_BOTTOM = 40;
const MIDDLE_TOP = PAD_TOP + 30 + 22; // top bar (30) + margin (22)
const RAIL_RIGHT = W - PAD_X; // 1224
const FOOT_ROW_H = 42;

const SANS = "Inter";
const MONO = "IBM Plex Mono";

/* Font ascent/descent (as a fraction of font-size), measured from the embedded
   woff2 files in Chrome. Used to compute CSS-style baselines:
   offset = (lineHeight - (asc+desc)*size)/2 + asc*size. */
const FONT_METRICS = {
  [SANS]: { asc: 0.97, desc: 0.24 },
  [MONO]: { asc: 1.03, desc: 0.28 },
};
const baseOffset = (font, size, lineH) => {
  const m = FONT_METRICS[font];
  return (lineH - (m.asc + m.desc) * size) / 2 + m.asc * size;
};

/* The template loads these families from Google Fonts; the reference PNG is
   rendered from that same CSS, so we embed the *same* woff2 files (latin
   subsets) to match glyph metrics exactly. Downloaded into ./fonts/. */
const FONT_MEDIA_DIR = FONTS;
const FONT_FACES = [
  { family: "Inter", style: "normal", weight: "300", file: "Inter-300-normal.woff2" },
  { family: "Inter", style: "normal", weight: "400", file: "Inter-400-normal.woff2" },
  { family: "Inter", style: "normal", weight: "500", file: "Inter-500-normal.woff2" },
  { family: "Inter", style: "normal", weight: "600", file: "Inter-600-normal.woff2" },
  { family: "IBM Plex Mono", style: "normal", weight: "500", file: "IBM-Plex-Mono-500-normal.woff2" },
  { family: "IBM Plex Mono", style: "normal", weight: "600", file: "IBM-Plex-Mono-600-normal.woff2" },
];

const WAVE = [40, 70, 55, 90, 60, 100, 50, 85, 65, 45, 75, 55, 95, 60, 40, 80];

/* Headshot grid geometry per guest count (matches template classes) */
const LAYOUTS = {
  1:    { cols: 1, rows: 1, tileW: 320, tileH: 400, gap: 18, circle: false },
  2:    { cols: 2, rows: 1, tileW: 264, tileH: 330, gap: 18, circle: false },
  3:    { cols: 3, rows: 1, tileW: 178, tileH: 230, gap: 18, circle: false },
  4:    { cols: 4, rows: 1, tileW: 134, tileH: 175, gap: 18, circle: false },
  5:    { cols: 3, rows: 2, tileW: 148, tileH: 192, gap: 18, circle: false },
  6:    { cols: 3, rows: 2, tileW: 148, tileH: 192, gap: 18, circle: false },
  many: { cols: 4, rows: 2, tileW: 96,  tileH: 96,  gap: 16, circle: true },
};

const MONOGRAM_SIZE = { 1: 84, 2: 64, 3: 44, 4: 34, 5: 34, 6: 34, many: 30 };

const escXml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  }[c]));

/* Greedy word-wrap with estimated average glyph width. */
function wrap(text, maxW, fontSize, factor = 0.52) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  const w = (s) => s.length * fontSize * factor;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (w(test) <= maxW || !line) line = test;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/* Word-wrap a list of title fragments, honouring `br` (forced break after the
   fragment) and `dim` (line inherits dim styling if it came from a dim fragment). */
function wrapFragments(frags, maxW, fontSize, factor = 0.52) {
  const lines = [];
  let line = "";
  let lineDim = false;
  const w = (s) => s.length * fontSize * factor;
  const push = () => {
    if (line.trim()) lines.push({ text: line.trim(), dim: lineDim });
    line = "";
    lineDim = false;
  };
  for (const frag of frags) {
    const words = String(frag.text ?? "").split(/\s+/).filter(Boolean);
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (w(test) <= maxW || !line) {
        line = test;
        lineDim = lineDim || !!frag.dim;
      } else {
        push();
        line = word;
        lineDim = !!frag.dim;
      }
    }
    if (frag.br) push();
  }
  if (line.trim()) lines.push({ text: line.trim(), dim: lineDim });
  return lines;
}

function initials(name) {
  return String(name)
    .replace(/,.*$/, "")
    .split(/[\s·–—-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/* ------------------------------------------------------------
   Layout math (mirrors the flex layout of the HTML template)
   ------------------------------------------------------------ */
function layout(cfg) {
  const guests = (cfg.guests || []).filter(Boolean);
  const n = Math.max(guests.length, 1);
  const L = LAYOUTS[Math.min(n, 6)] || LAYOUTS.many;
  const g = Math.min(n, 6);

  /* title lines */
  const titleLines = wrapFragments(cfg.title || [], 620, 50);
  const titleFont = 50, titleLineH = 54;
  const titleH = titleLines.length * titleLineH;

  /* byline + footer height */
  const nameFont = n === 1 ? 22 : 19;
  const nameLineH = nameFont * 1.25;
  const roleFont = n === 1 ? 15 : 14;
  const roleLineH = roleFont * 1.4;
  /* Placeholder tiles (created by gen.mjs `speakers` padding) fill the grid
     but must not appear in the footer byline. */
  const real = guests.filter((g2) => !g2.placeholder);
  const nameText =
    real.length === 1 ? real[0].name :
    real.length > 1 ? `With ${real.map((g2) => g2.name).join(" · ")}` : "";
  const roleText =
    real.length === 1 ? real[0].role || "" :
    real.length > 1 && real.every((g2) => g2.role) ? real.map((g2) => g2.role).join(" · ") : "";
  const maxW = W - PAD_X * 2;
  const nameLinesArr = wrap(nameText, maxW, nameFont, 0.55);
  const roleLinesArr = roleText ? wrap(roleText, maxW, roleFont, 0.55) : [];
  const bylineContentH =
    nameLinesArr.length * nameLineH + (roleLinesArr.length ? 3 + roleLinesArr.length * roleLineH : 0);

  /* Mirrors the HTML footer: 1px rule + 18px byline padding + byline lines +
     foot-row (16px top padding + 26px waveform). FOOT_ROW_H already includes
     the 16px padding — do not add it again. */
  const footerH = 1 + 18 + bylineContentH + FOOT_ROW_H;
  const ruleY = H - PAD_BOTTOM - footerH;
  const middleBottom = ruleY - 26;
  const middleCenter = (MIDDLE_TOP + middleBottom) / 2;
  const titleTop = middleCenter - titleH / 2;

  /* rail */
  const railW = L.cols * L.tileW + (L.cols - 1) * L.gap;
  const railH = L.rows * L.tileH + (L.rows - 1) * L.gap;
  const railX = RAIL_RIGHT - railW;
  const railY = middleCenter - railH / 2;

  return {
    n, L, g, titleLines, titleFont, titleLineH, titleTop,
    nameFont, nameLineH, roleFont, roleLineH, nameText, roleText,
    nameLinesArr, roleLinesArr, railX, railY, bylineContentH, ruleY, middleCenter,
    tileW: L.tileW, tileH: L.tileH, gap: L.gap, cols: L.cols, rows: L.rows,
  };
}

/* ------------------------------------------------------------
   SVG builders
   ------------------------------------------------------------ */
/* Embed the website's actual fonts so the SVG doesn't fall back to system
   fonts. Base64 woff2 data URIs keep the file fully self-contained. */
function fontFaceCss() {
  const faces = FONT_FACES.map((f) => {
    const p = path.join(FONT_MEDIA_DIR, f.file);
    if (!fs.existsSync(p)) {
      console.warn(`    (font not found, will fall back: ${f.file})`);
      return "";
    }
  const b64 = fs.readFileSync(p).toString("base64");
    return `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }).filter(Boolean);
  /* Match the template's body text rendering (antialiased + optimizeLegibility)
     so glyph coverage lines up with the HTML-rendered PNG. */
  return `<style>${faces.join("")}
text{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}</style>`;
}

/* Shared gradient / pattern / mask defs mirroring --gradient-hero,
   --gradient-hero-glow, the .dots texture and the .scrim layer. */
function defs() {
  return `
  <defs>
    <radialGradient id="bg-gradient-hero" gradientUnits="userSpaceOnUse" cx="998.4" cy="216" r="1472">
      <stop offset="0" stop-color="#5b7484"/>
      <stop offset="0.34" stop-color="#3e5361"/>
      <stop offset="0.62" stop-color="#263743"/>
      <stop offset="1" stop-color="#16232c"/>
    </radialGradient>
    <radialGradient id="bg-gradient-glow" gradientUnits="userSpaceOnUse" cx="921.6" cy="302.4" r="768">
      <stop offset="0" stop-color="#d6e4eb" stop-opacity="0.5"/>
      <stop offset="0.7" stop-color="#d6e4eb" stop-opacity="0"/>
    </radialGradient>
    <pattern id="bg-dots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#ffffff" fill-opacity="0.09"/>
    </pattern>
    <linearGradient id="bg-dots-mask" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.24" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.7" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
    </linearGradient>
    <mask id="bg-dots-mask-el" maskUnits="userSpaceOnUse" x="0" y="0" width="1280" height="720">
      <rect x="0" y="0" width="1280" height="720" fill="url(#bg-dots-mask)"/>
    </mask>
    <linearGradient id="bg-scrim-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0b1220" stop-opacity="0.52"/>
      <stop offset="0.4" stop-color="#0b1220" stop-opacity="0.26"/>
      <stop offset="0.6" stop-color="#0b1220" stop-opacity="0"/>
    </linearGradient>
    <filter id="tile-shadow" x="-40%" y="-40%" width="180%" height="220%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#0b1220" flood-opacity="0.55"/>
    </filter>
    <filter id="pill-blur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
  </defs>`;
}

function background(flat) {
  if (flat) {
    return `
  <g id="bg" data-name="Background">
    <rect id="bg-base" data-name="Background base" x="0" y="0" width="${W}" height="${H}" fill="#16232c"/>
    <ellipse id="bg-lobe-mid" data-name="Lobe mid steel" cx="980" cy="210" rx="620" ry="360" fill="#263743"/>
    <ellipse id="bg-lobe-core" data-name="Lobe core steel" cx="1010" cy="200" rx="430" ry="240" fill="#3e5361" fill-opacity="0.8"/>
    <rect id="bg-scrim" data-name="Left scrim" x="0" y="0" width="560" height="${H}" fill="#16232c" fill-opacity="0.55"/>
  </g>`;
  }
  /* CSS radial-gradient(115% 90% at 78% 30%) = ellipse rx 1472 / ry 648 centred
     at (998.4, 216). SVG radialGradients are circular, so paint the circle
     (r=1472) inside a Y-scaled group to squash it back into that ellipse. */
  return `
  <g id="bg" data-name="Background">
    <g id="bg-gradient" data-name="Background gradient" transform="translate(998.4 216) scale(1 0.4402) translate(-998.4 -216)">
      <rect id="bg-gradient-rect" data-name="Background gradient" x="0" y="-600" width="1280" height="2400" fill="url(#bg-gradient-hero)"/>
    </g>
    <g id="bg-glow" data-name="Glow lobe" opacity="0.45" transform="translate(921.6 302.4) scale(1 0.5156) translate(-921.6 -302.4)">
      <rect id="bg-glow-rect" data-name="Glow lobe" x="0" y="-600" width="1280" height="2400" fill="url(#bg-gradient-glow)"/>
    </g>
    <rect id="bg-dots" data-name="Dots texture" x="0" y="0" width="${W}" height="${H}" fill="url(#bg-dots)" opacity="0.55" mask="url(#bg-dots-mask-el)"/>
    <rect id="bg-scrim" data-name="Left scrim" x="0" y="0" width="${W}" height="${H}" fill="url(#bg-scrim-grad)"/>
  </g>`;
}

function topBar(eyebrow) {
  return `
  <g id="topbar" data-name="Top bar">
    <circle id="eyebrow-dot" data-name="Eyebrow dot" cx="60" cy="59" r="3.5" fill="#ffffff" fill-opacity="0.85"/>
    <text id="eyebrow" data-name="Eyebrow episode" x="73" y="63.5" font-family="${MONO}" font-size="13" font-weight="500" letter-spacing="1.82" fill="#ffffff" fill-opacity="0.66">${escXml(String(eyebrow).toUpperCase())}</text>
    <image id="oba-logo" data-name="OBA logo" href="__LOGO__" xlink:href="__LOGO__" x="1116.55" y="44" width="107.45" height="30" opacity="0.95"/>
  </g>`;
}

function titleBlock(ly) {
  return ly.titleLines
    .map((line, i) => {
      const y = (ly.titleTop + i * ly.titleLineH + baseOffset(SANS, ly.titleFont, ly.titleLineH)).toFixed(1);
      const dim = line.dim ? ' fill-opacity="0.55"' : "";
      return `    <text id="title-line-${i + 1}" data-name="Title ${i + 1}" x="${PAD_X}" y="${y}" font-family="${SANS}" font-size="${ly.titleFont}" font-weight="300" letter-spacing="-1" fill="#ffffff"${dim}>${escXml(line.text)}</text>`;
    })
    .join("\n");
}

function portraits(guests, ly) {
  const L = ly.L;
  const monoSize = MONOGRAM_SIZE[Math.min(ly.n, 6)] || MONOGRAM_SIZE.many;
  const radius = L.circle ? ly.tileW / 2 : 18;
  const showIndex = ly.n > 1 && !L.circle;
  const parts = [];
  guests.forEach((guest, idx) => {
    const r = Math.floor(idx / L.cols);
    const c = idx % L.cols;
    const tx = ly.railX + c * (ly.tileW + L.gap);
    const ty = ly.railY + r * (ly.tileH + L.gap);
    const num = String(idx + 1).padStart(2, "0");
    const name = `guest-${num}`;
    const label = guest.name || `Guest ${num}`;
    const shadowAttr = L.circle ? "" : ' filter="url(#tile-shadow)"';
    parts.push(`  <g id="${name}" data-name="${escXml(label)}">`);
    parts.push(
      `    <clipPath id="${name}-clip"><rect x="${tx}" y="${ty}" width="${ly.tileW}" height="${ly.tileH}" rx="${radius}"/></clipPath>`,
    );
    parts.push(`    <g${shadowAttr}>`);
    parts.push(
      `      <rect id="${name}-frame" data-name="Headshot frame ${num}" x="${tx}" y="${ty}" width="${ly.tileW}" height="${ly.tileH}" rx="${radius}" fill="#2a3741" stroke="#ffffff" stroke-width="1" stroke-opacity="0.16"/>`,
    );
    if (!L.circle) {
      parts.push(
        `      <text id="${name}-monogram" data-name="Monogram ${num}" x="${(tx + ly.tileW / 2).toFixed(1)}" y="${(ty + ly.tileH / 2 + monoSize * 0.36).toFixed(1)}" text-anchor="middle" font-family="${SANS}" font-size="${monoSize}" font-weight="300" fill="#f0f4f6">${escXml(initials(guest.name) || "?")}</text>`,
      );
    } else {
      parts.push(
        `      <text id="${name}-monogram" data-name="Monogram ${num}" x="${(tx + ly.tileW / 2).toFixed(1)}" y="${(ty + ly.tileH / 2 + 11).toFixed(1)}" text-anchor="middle" font-family="${SANS}" font-size="30" font-weight="300" fill="#f0f4f6">${escXml(initials(guest.name) || "?")}</text>`,
      );
    }
    if (guest.img) {
      parts.push(
        `      <image id="${name}-photo" data-name="Headshot photo ${num}" href="${escXml(guest.img)}" xlink:href="${escXml(guest.img)}" x="${tx + 1}" y="${ty + 1}" width="${ly.tileW - 2}" height="${ly.tileH - 2}" clip-path="url(#${name}-clip)" preserveAspectRatio="xMidYMid slice"/>`,
      );
    }
    parts.push(`    </g>`);
    if (!L.circle) {
      /* Two content-sized frosted pills (mirrors the template's figcaption):
         an index pill ("01") on the left and a name pill on the right. */
      /* Template measures: pill box top = tile top + tileH - 33.7, bottom
         lands at tile bottom - 11 (the figcaption's right/bottom 10px are
         relative to the 1px-border padding box). */
      const pillTop = ty + ly.tileH - 33.7;
      /* Chrome measurement: the mono-10px pill content (line box + 8px
         padding + 2px border) is 22px tall — the 23px box landed 1px low on
         the bottom edge. Text baselines stay pinned to pillTop. */
      const pillH = 22;
      const pillRx = pillH / 2;
      const pillFill = "#0b1220";
      const pillOpacity = 0.42;
      const pillBorder = "stroke=\"#ffffff\" stroke-opacity=\"0.12\" stroke-width=\"1\"";
      /* Pill label: prefer a short pill name (guest.short), else the full
         name. Names that still don't fit get ellipsized so text never spills
         past the pill (mirrors the template's text-overflow: ellipsis). */
      const labelText = String(guest.img ? guest.short || guest.name : "Portrait").toUpperCase();
      const indexW = 2 * 7 + 18; // "01" in mono 10px + 0.1em tracking + padding + border
      const maxLabelW = ly.tileW - 20 - (showIndex ? indexW + 18 : 0);
      const maxLabelChars = Math.max(1, Math.floor((maxLabelW - 18) / 7));
      const pillLabel = labelText.length > maxLabelChars
        ? `${labelText.slice(0, Math.max(1, maxLabelChars - 1)).trimEnd()}…`
        : labelText;
      const labelW = Math.min(pillLabel.length * 7 + 18, maxLabelW);
      /* Pixel cross-correlation against the template render: the pill boxes
         match, but the text ink lands 1px low and 1px left of the reference —
         nudge baseline up 1 and both text x's right 1. */
      const pillTextY = pillTop + 14;
      if (showIndex) {
        const pillX = tx + 11;
        const pillClipId = `${name}-index-pill-clip`;
        if (guest.img) {
        parts.push(`    <clipPath id="${pillClipId}"><rect x="${pillX}" y="${pillTop}" width="${indexW}" height="${pillH}" rx="${pillRx}"/></clipPath>`);
          parts.push(
            `    <image id="${name}-index-pill-blur" data-name="Index pill frost ${num}" href="${escXml(guest.img)}" xlink:href="${escXml(guest.img)}" x="${tx + 1}" y="${ty + 1}" width="${ly.tileW - 2}" height="${ly.tileH - 2}" clip-path="url(#${pillClipId})" filter="url(#pill-blur)" preserveAspectRatio="xMidYMid slice"/>`,
          );
        }
        parts.push(
          `    <rect id="${name}-index-pill" data-name="Index pill ${num}" x="${pillX}" y="${pillTop}" width="${indexW}" height="${pillH}" rx="${pillRx}" fill="${pillFill}" fill-opacity="${pillOpacity}" ${pillBorder}/>`,
          `    <text id="${name}-index" data-name="Index ${num}" x="${tx + 20}" y="${pillTextY}" font-family="${MONO}" font-size="10" font-weight="500" letter-spacing="1" fill="#ffffff" fill-opacity="0.55">${num}</text>`,
        );
      }
      const labelPillX = tx + ly.tileW - 11 - labelW;
      const labelClipId = `${name}-label-pill-clip`;
      if (guest.img) {
        parts.push(`    <clipPath id="${labelClipId}"><rect x="${labelPillX}" y="${pillTop}" width="${labelW}" height="${pillH}" rx="${pillRx}"/></clipPath>`);
        parts.push(
          `    <image id="${name}-label-pill-blur" data-name="Portrait pill frost ${num}" href="${escXml(guest.img)}" xlink:href="${escXml(guest.img)}" x="${tx + 1}" y="${ty + 1}" width="${ly.tileW - 2}" height="${ly.tileH - 2}" clip-path="url(#${labelClipId})" filter="url(#pill-blur)" preserveAspectRatio="xMidYMid slice"/>`,
        );
      }
      parts.push(
        `    <rect id="${name}-label-pill" data-name="Portrait pill ${num}" x="${labelPillX}" y="${pillTop}" width="${labelW}" height="${pillH}" rx="${pillRx}" fill="${pillFill}" fill-opacity="${pillOpacity}" ${pillBorder}/>`,
        `    <text id="${name}-label" data-name="Portrait label ${num}" x="${labelPillX + 9}" y="${pillTextY}" font-family="${MONO}" font-size="10" font-weight="500" letter-spacing="1" fill="#ffffff" fill-opacity="0.85">${escXml(pillLabel)}</text>`,
      );
    }
    parts.push(`  </g>`);
  });
  return parts.join("\n");
}

function footer(ly, category) {
  /* HTML footer: 1px rule border + 18px byline padding pushes the first
     guest-name line box to ruleY + 19. Baselines are CSS-correct via
     baseOffset() so the rendered ink lands where the template puts it. */
  const bylineTop = ly.ruleY + 19;
  const bylineLines = [];
  let baseline = bylineTop + baseOffset(SANS, ly.nameFont, ly.nameLineH);
  for (const line of ly.nameLinesArr) {
    bylineLines.push(
      `      <text data-name="Guest name" x="${PAD_X}" y="${baseline.toFixed(1)}" font-family="${SANS}" font-size="${ly.nameFont}" font-weight="500" fill="#ffffff">${escXml(line)}</text>`,
    );
    baseline += ly.nameLineH;
  }
  if (ly.roleLinesArr.length) {
    const roleTop = bylineTop + ly.nameLinesArr.length * ly.nameLineH + 3;
    let roleBaseline = roleTop + baseOffset(SANS, ly.roleFont, ly.roleLineH);
    for (const line of ly.roleLinesArr) {
      bylineLines.push(
        `      <text data-name="Guest role" x="${PAD_X}" y="${roleBaseline.toFixed(1)}" font-family="${SANS}" font-size="${ly.roleFont}" fill="#ffffff" fill-opacity="0.6">${escXml(line)}</text>`,
      );
      roleBaseline += ly.roleLineH;
    }
  }
  /* Category sits centered in the foot-row's 26px content area: row top
     (638) + 16px padding + (26−15)/2 = 659.5. IBM Plex Mono uppercase ink
     ascent = font-size, so text baseline = 659.5 + 12 = 671.5. */
  const footRowTop = H - PAD_BOTTOM - FOOT_ROW_H;
  const categoryTop = footRowTop + 16 + (26 - 15) / 2;
  const catInkTop = categoryTop;
  const catBaseline = catInkTop + 12;
  const waveH = 26;
  const waveW = WAVE.length * 3 + (WAVE.length - 1) * 3;
  const waveX = RAIL_RIGHT - waveW;
  const bars = WAVE.map((h, i) => {
    const bh = ((h / 100) * waveH).toFixed(1);
    const bx = waveX + i * 6;
    return `    <rect id="waveform-bar-${String(i + 1).padStart(2, "0")}" data-name="Waveform bar ${String(i + 1).padStart(2, "0")}" x="${bx}" y="${(H - PAD_BOTTOM - bh).toFixed(1)}" width="3" height="${bh}" rx="1.5" fill="#ffffff" fill-opacity="0.28"/>`;
  }).join("\n");
  return `
  <g id="footer" data-name="Footer">
    <rect id="footer-rule" data-name="Divider rule" x="${PAD_X}" y="${ly.ruleY}" width="${W - PAD_X * 2}" height="1" fill="#ffffff" fill-opacity="0.14"/>
    <g id="byline" data-name="Guest byline">
${bylineLines.join("\n")}
    </g>
    <g id="footrow" data-name="Bottom row">
      <g id="category" data-name="Category">
        <circle id="category-dot" data-name="Category dot" cx="60" cy="${catInkTop + 7.5}" r="3" fill="#ffffff" fill-opacity="0.7"/>
        <text id="category-text" data-name="Category text" x="72" y="${catBaseline}" font-family="${MONO}" font-size="12" font-weight="500" letter-spacing="1.68" fill="#ffffff" fill-opacity="0.55">${escXml(String(category || "").toUpperCase())}</text>
      </g>
      <g id="waveform" data-name="Waveform">
${bars}
      </g>
    </g>
  </g>`;
}

function buildSVG(cfg, opts = {}) {
  const guests = (cfg.guests || []).filter(Boolean);
  const ly = layout(cfg);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- OBA podcast thumbnail — 1280×720. Layered for Canva editing. -->
  <!-- Each <text> / <rect> / <ellipse> / <image> imports as an editable layer. -->
${fontFaceCss()}
${defs()}
${background(opts.flat)}

${topBar(cfg.eyebrow || "OBA · Podcast")}

  <g id="title" data-name="Title">
${titleBlock(ly)}
  </g>

  <g id="portraits" data-name="Headshots">
${portraits(guests, ly)}
  </g>

${footer(ly, cfg.category)}
</svg>
`;
}

/* Turn local image paths into self-contained data URIs so the SVG is portable
   (Canva / Figma / email — no external file references). */
function embedImages(cfg) {
  for (const guest of cfg.guests || []) {
    const img = guest.img;
    if (!img) continue;
    if (String(img).startsWith("data:")) continue;
    const p = path.resolve(__dirname, String(img));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      const ext = path.extname(p).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" :
        ext === ".gif" ? "image/gif" :
        "image/jpeg";
      guest.img = `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
      console.log(`    embedded headshot: ${path.basename(p)} (${guest.name})`);
    } else {
      console.warn(`    (headshot not found, keeping placeholder: ${img})`);
    }
  }
}

/* ------------------------------------------------------------
   CLI
   ------------------------------------------------------------ */
/* Expand a -c value: existing file, a directory, or a simple `dir/*.json` glob. */
function expandConfigPaths(pattern) {
  const abs = path.resolve(__dirname, pattern);
  if (fs.existsSync(abs)) {
    if (fs.statSync(abs).isDirectory()) {
      return fs
        .readdirSync(abs)
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(abs, f));
    }
    return [abs];
  }
  if (pattern.includes("*")) {
    const star = pattern.indexOf("*");
    const baseDir = path.resolve(__dirname, pattern.slice(0, star)) || __dirname;
    const prefix = pattern.slice(0, star).split(/[\\/]/).pop();
    const suffix = pattern.slice(star + 1);
    return fs
      .readdirSync(baseDir)
      .filter((f) => f.endsWith(".json") && f.startsWith(prefix) && f.endsWith(suffix))
      .map((f) => path.join(baseDir, f));
  }
  return [];
}

/* Resolve sharp: prefer a local install, fall back to the one shipped inside
   oba-website's node_modules. */
function loadSharp() {
  const local = createRequire(import.meta.url);
  try {
    return local("sharp");
  } catch {
    const siteReq = createRequire(path.join(ROOT, "package.json"));
    return siteReq("sharp");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const configs = [];
  let preview = false;
  let flat = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-c") configs.push(argv[++i]);
    else if (argv[i] === "--preview") preview = true;
    else if (argv[i] === "--flat") flat = true;
  }

  let files = configs.length
    ? configs.flatMap((c) => expandConfigPaths(c))
    : fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".json")).map((f) => path.join(EXAMPLES_DIR, f));
  files = files.filter((f) => fs.existsSync(f));

  if (!files.length) {
    console.error("No configs found.");
    process.exit(1);
  }

  /* Use the exact logo the HTML template embeds (480×134) so the SVG matches
     the reference PNG. Fall back to oba-website/public if the template's data
     URI can't be read. */
  const templatePath = path.join(__dirname, "template.html");
  let logoDataUri = null;
  if (fs.existsSync(templatePath)) {
    const tmpl = fs.readFileSync(templatePath, "utf8");
    const m = tmpl.match(/class="logo" src="(data:image\/png;base64,[^"]+)"/);
    if (m) logoDataUri = m[1];
  }
  if (!logoDataUri) {
    const logoPath = path.join(LOGOS, "oba-logo-white.png");
    logoDataUri = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
    console.warn("  (template logo not found — using oba-website/public/images/oba-logo-white.png)");
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let sharp = null;
  if (preview) {
    try {
      sharp = loadSharp();
    } catch (e) {
      console.error("(preview skipped — sharp unavailable:", e.message + ")");
    }
  }

  for (const file of files) {
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    embedImages(cfg);
    const base = (cfg.output || path.basename(file, ".json")).replace(/\.png$/, "");
    const outSvg = path.join(OUT_DIR, `OBA-${base}.svg`);
    const svg = buildSVG(cfg, { flat }).split("__LOGO__").join(logoDataUri);
    fs.writeFileSync(outSvg, svg);
    console.log(`✓ ${outSvg} (${Buffer.byteLength(svg).toLocaleString()} bytes)`);

    if (preview && sharp) {
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const outPng = path.join(OUT_DIR, `preview-OBA-${base}.png`);
      fs.writeFileSync(outPng, png);
      console.log(`  preview ${outPng}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
