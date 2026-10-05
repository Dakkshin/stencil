#!/usr/bin/env node
/**
 * zoom-banner — layered, Canva-friendly SVG renderer.
 *
 * Produces a self-contained `canva/<output>.svg` from the same normalized
 * `.gen/<name>.json` the PNG renderer uses, so the Canva artwork and the
 * shipped PNG can never drift apart. Same pattern as the siblings:
 *   - Plain <text> elements — one element = one editable Canva layer, with
 *     readable ids/data-names.
 *   - Inter + IBM Plex Mono embedded as base64 woff2 @font-face data URIs
 *     from panel-kit/assets/fonts/, so the SVG renders with the same
 *     type as the PNG instead of falling back to system fonts.
 *   - Headshots embedded as base64 image data URIs (the file:// path is
 *     stripped first), so the file is fully portable.
 *
 * The background stays zoom-banner-specific (invariant): the symmetric
 * top-centre lobe, the bottom-up scrim and the vertical dots mask all mirror
 * banner-template.html's CSS, not the siblings' horizontal composition.
 *
 * Geometry comes from lib/geometry.mjs — tileLayout(count, titleLines) —
 * the single source of truth, never a second copy.
 *
 * Usage:
 *   node render-svg.mjs -c .gen/<name>.json        # -> canva/<output>.svg
 *   node render-svg.mjs -c .gen/<name>.json --preview
 *     # + canva/preview-<output>.png rasterized in Chromium (real fonts),
 *     #   so the preview matches the shipped PNG, not a system-font fallback
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CANVAS, TYPE, BANDS, tileLayout, MAX_PANELISTS } from "../../geometry.mjs";
import { CANVA, FONTS, LOGOS, ROOT } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = CANVA;
const FONT_DIR = FONTS;

const SANS = "Inter";
const MONO = "IBM Plex Mono";

/* Tokens mirroring banner-template.html's :root + .canvas rules.
   Dark values are fallbacks; per-brand values come from cfg.brand. */
const ACCENT = "#6289D9";
const TEXT_MUTED = "rgba(255,255,255,0.62)";
const TEXT_FAINT = "rgba(255,255,255,0.44)";
const LINE = "rgba(255,255,255,0.14)";
const PILL_BG = "rgba(18,24,43,0.42)";
const TILE_BORDER = "rgba(255,255,255,0.22)";

function tokensFor(cfg) {
  const b = (cfg && cfg.brand) || {};
  return {
    accent: b.accent || ACCENT,
    textMuted: b.textMuted || TEXT_MUTED,
    textFaint: b.textFaint || TEXT_FAINT,
    titleText: b.titleText || "#ffffff",
    line: b.line || LINE,
    pillBg: b.pillBg || PILL_BG,
  };
}

/* Font ascent/descent (as a fraction of font-size), measured from the
   embedded woff2 files in Chrome. Used to compute CSS-style baselines:
   offset = (lineHeight - (asc+desc)*size)/2 + asc*size. */
const FONT_METRICS = {
  [SANS]: { asc: 0.97, desc: 0.24 },
  [MONO]: { asc: 1.03, desc: 0.28 },
};
const baseOffset = (font, size, lineH) => {
  const m = FONT_METRICS[font];
  return (lineH - (m.asc + m.desc) * size) / 2 + m.asc * size;
};

/* The same woff2 files the HTML template loads, embedded verbatim. */
const FONT_FACES = [
  { family: "Inter", weight: "300", file: "Inter-300-normal.woff2" },
  { family: "Inter", weight: "400", file: "Inter-400-normal.woff2" },
  { family: "Inter", weight: "500", file: "Inter-500-normal.woff2" },
  { family: "Inter", weight: "600", file: "Inter-600-normal.woff2" },
  { family: "IBM Plex Mono", weight: "500", file: "IBM-Plex-Mono-500-normal.woff2" },
  { family: "IBM Plex Mono", weight: "600", file: "IBM-Plex-Mono-600-normal.woff2" },
];

const escXml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  }[c]));

/* Greedy word-wrap with estimated average glyph width (same factor the
   siblings use). */
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

/* Estimated advance width of a text run: average glyph width + letter
   spacing between glyphs. Mono uses the 0.6em Plex advance; sans uses the
   0.52em average (matches the measured Inter runs in the 3x renders). */
function textWidth(s, fontSize, tracking = 0, mono = false) {
  const chars = [...String(s)];
  const adv = (mono ? 0.6 : 0.52) * fontSize;
  return chars.length * adv + Math.max(0, chars.length - 1) * tracking;
}

/* Ellipsize a nowrap string to fit maxW at the given size. */
function ellipsize(text, maxW, fontSize, tracking = 0, mono = false) {
  const s = String(text);
  if (textWidth(s, fontSize, tracking, mono) <= maxW) return s;
  const dotW = textWidth("…", fontSize, 0, mono);
  let cut = s;
  while (cut.length > 1 && textWidth(cut + "…", fontSize, tracking, mono) > maxW) {
    cut = cut.slice(0, -1);
  }
  return cut + "…";
}

/* ------------------------------------------------------------
   Layout — mirrors banner-template.html's DOM flow. Geometry
   (tile sizes, band top, column widths/gaps) comes from
   lib/geometry.mjs; only the vertical baselines live here.
   ------------------------------------------------------------ */
function layout(cfg) {
  const list = (cfg.panelists || []).filter(Boolean);
  const n = Math.max(1, Math.min(MAX_PANELISTS, list.length || 1));

  /* Title line count, mirroring the DOM: offsetHeight / (16*1.18), clamped
     to 1..2. Uses the same balance-aware breaker as titleBlock so the box
     always has a baseline for every line that is actually emitted. */
  const titleLinesArr = balanceTitleLines(
    cfg.title,
    CANVAS.w - 2 * CANVAS.padX,
    TYPE.title,
  );
  const titleLines = Math.max(1, Math.min(2, titleLinesArr.length || 1));
  const ly = tileLayout(n, titleLines);

  const bodyLh = TYPE.body * TYPE.bodyLh;
  const titleLh = TYPE.title * TYPE.titleLh;
  const nameH = Math.round(TYPE.body * TYPE.bodyLh);

  /* Header: logo + eyebrow + date chip sit in a headerH-tall flex row. The
     text line box is centred in that row, so the baseline is the centring
     offset plus the CSS baseline within the line box. */
  const headerBaseline =
    CANVAS.padTop + (BANDS.headerH - bodyLh) / 2 +
    baseOffset(MONO, TYPE.body, bodyLh);

  /* Title: box starts padTop + headerH + headerGap; one line box per line. */
  const titleTop = CANVAS.padTop + BANDS.headerH + BANDS.headerGap;
  const titleBaselines = Array.from(
    { length: titleLines },
    (_, i) => titleTop + i * titleLh + baseOffset(SANS, TYPE.title, titleLh),
  );

  /* Face band: centred flex row of columns. */
  const bandX = (CANVAS.w - (n * ly.columnW + (n - 1) * ly.gap)) / 2;
  const cols = list.slice(0, MAX_PANELISTS).map((p, i) => {
    const cx = bandX + i * (ly.columnW + ly.gap);
    return {
      p,
      centerX: cx + ly.columnW / 2,
      tileX: cx + (ly.columnW - ly.tileW) / 2,
      tileY: ly.bandTop,
    };
  });

  const nameBaseline =
    ly.bandTop + ly.tileH + BANDS.nameGap + baseOffset(SANS, TYPE.body, bodyLh);
  const roleBaseline = nameBaseline + nameH + BANDS.roleGap;
  const roleLineH = TYPE.body * TYPE.bodyLh;

  return {
    n, titleLines, cols, ly,
    titleLinesArr,
    headerBaseline, titleBaselines, nameBaseline, roleBaseline, roleLineH,
  };
}

/* ------------------------------------------------------------
   SVG builders
   ------------------------------------------------------------ */
function fontFaceCss() {
  const faces = FONT_FACES.map((f) => {
    const p = path.join(FONT_DIR, f.file);
    if (!fs.existsSync(p)) {
      console.warn(`    (font not found, will fall back: ${f.file})`);
      return "";
    }
    const b64 = fs.readFileSync(p).toString("base64");
    return `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }).filter(Boolean);
  /* Match the template's text rendering so glyph coverage lines up with the
     HTML-rendered PNG. */
  return `<style>${faces.join("")}
text{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}</style>`;
}

/* Zoom-banner background — same ground + lobes as iu-panel-social-posts
   (lib/iu/tokens.mjs THEMES + atmosphere.mjs ground()): directional radial
   (dark, cx 0.86 / cy 0.06) or diagonal linear (light), plus two soft glow
   lobes (top-right clarity, bottom-left indigo). Mirrors banner-template.html. */
function defs(cfg) {
  const brand = cfg.brand || {};
  const isLight = String(cfg.brandId || "").includes("LIGHT");
  const grad = Array.isArray(brand.gradient) && brand.gradient.length
    ? brand.gradient
    : [["#1B2560", 0], ["#12182B", 55], ["#0A0F22", 100]];
  const stops = grad
    .map(([c, p]) => {
      const off = Number(p) > 1 ? (Number(p) / 100).toFixed(3) : Number(p).toFixed(3);
      return `      <stop offset="${off}" stop-color="${c}"/>`;
    })
    .join("\n");

  // Lobe colors per ground, from tokens.mjs THEMES.
  const lobeA = isLight
    ? { color: "#8BB3E2", alpha: 0.38 }
    : { color: "#6289D9", alpha: 0.30 };
  const lobeB = isLight
    ? { color: "#6289D9", alpha: 0.16 }
    : { color: "#7277D2", alpha: 0.22 };

  // Use brand.scrim if present (array of [offset, color, alpha])
  const scrimStops = Array.isArray(brand.scrim) && brand.scrim.length
    ? brand.scrim.map(([o,c,a]) => `      <stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("\n")
    : `      <stop offset="0" stop-color="#0b1220" stop-opacity="0"/>
      <stop offset="0.38" stop-color="#0b1220" stop-opacity="0"/>
      <stop offset="0.72" stop-color="#0b1220" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#0b1220" stop-opacity="0.58"/>`;

  const groundDef = isLight
    ? `    <linearGradient id="bg-gradient-hero" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0.55" y2="1">
 ${stops}
    </linearGradient>`
    : `    <radialGradient id="bg-gradient-hero" gradientUnits="userSpaceOnUse" cx="550.4" cy="12" r="832">
 ${stops}
    </radialGradient>`;

  return `
  <defs>
${groundDef}
    <radialGradient id="bg-lobe-a" gradientUnits="objectBoundingBox" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${lobeA.color}" stop-opacity="${lobeA.alpha}"/>
      <stop offset="1" stop-color="${lobeA.color}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bg-lobe-b" gradientUnits="objectBoundingBox" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${lobeB.color}" stop-opacity="${lobeB.alpha}"/>
      <stop offset="1" stop-color="${lobeB.color}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg-scrim-grad" x1="0" y1="0" x2="0" y2="1">
${scrimStops}
    </linearGradient>
    <linearGradient id="tile-fill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#12182B" stop-opacity="0.35"/>
    </linearGradient>
    <filter id="tile-shadow" x="-40%" y="-40%" width="180%" height="220%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#12182B" flood-opacity="0.7"/>
    </filter>
  </defs>`;
}

function background(cfg) {
  const brand = cfg.brand || {};
  const W = CANVAS.w;
  const H = CANVAS.h;

  // Outer ring expansion from bottom-left corner.
  // Equal radial spacing (constant gap), softer than the social posts.
  const arcCx = -0.26 * W;
  const arcCy = 1.22 * H;
  const arcColor = brand.arc || "#8BB3E2";
  const [a0, a1] = brand.arcOpacity || [0.08, 0.03];
  const strokeW = 1.1;
  const far = Math.hypot(W - arcCx, 0 - arcCy);
  const r0 = 0.28 * Math.min(W, H);
  const gap = 22;
  const steps = Math.floor((far - r0) / gap) + 1;

  let arcsSvg = '';
  for (let i = 0; i < steps; i++) {
    const r = r0 + i * gap;
    const t = i / Math.max(1, steps - 1);
    const op = (a0 + (a1 - a0) * t).toFixed(3);
    arcsSvg += `    <circle cx="${arcCx.toFixed(1)}" cy="${arcCy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${arcColor}" stroke-width="${strokeW}" stroke-opacity="${op}"/>\n`;
  }

  // Glow lobes per tokens.mjs (scaled to the 640x200 strip).
  const isLightBg = String(cfg.brandId || "").includes("LIGHT");
  const lobeA = isLightBg
    ? { cx: 0.92 * W, cy: 0.10 * H, rx: 0.60 * W, ry: 0.50 * H }
    : { cx: 0.92 * W, cy: 0.12 * H, rx: 0.62 * W, ry: 0.50 * H };
  const lobeB = isLightBg
    ? { cx: 0.05 * W, cy: 0.96 * H, rx: 0.60 * W, ry: 0.42 * H }
    : { cx: 0.04 * W, cy: 0.98 * H, rx: 0.60 * W, ry: 0.42 * H };

  return `
  <g id="bg" data-name="Background">
    <rect id="bg-ground" data-name="Ground" x="0" y="0" width="${W}" height="${H}" fill="url(#bg-gradient-hero)"/>
    <ellipse id="bg-lobe-a" data-name="Glow lobe top-right" cx="${lobeA.cx.toFixed(1)}" cy="${lobeA.cy.toFixed(1)}" rx="${lobeA.rx.toFixed(1)}" ry="${lobeA.ry.toFixed(1)}" fill="url(#bg-lobe-a)"/>
    <ellipse id="bg-lobe-b" data-name="Glow lobe bottom-left" cx="${lobeB.cx.toFixed(1)}" cy="${lobeB.cy.toFixed(1)}" rx="${lobeB.rx.toFixed(1)}" ry="${lobeB.ry.toFixed(1)}" fill="url(#bg-lobe-b)"/>
    <rect id="bg-scrim" data-name="Bottom scrim" x="0" y="0" width="${W}" height="${H}" fill="url(#bg-scrim-grad)"/>
    <g id="arc-field" data-name="Arc field (corner expansion)">
${arcsSvg}
    </g>
  </g>`;
}

/* Decode the intrinsic size of a PNG data URI (IHDR) so the logo renders at
   logoH with the correct aspect, whatever asset the brand ships. */
function pngSize(dataUri) {
  const b64 = String(dataUri).split(",")[1] || "";
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 24) return { w: 0, h: 0 };
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function header(cfg, ly) {
  const logo = cfg.logo || "";
  const brand = cfg.brand || {};
  const logoH = Number(brand.logoH || TYPE.logoH);
  const { w: lw, h: lh } = logo.startsWith("data:image/png")
    ? pngSize(logo)
    : (logo.startsWith("data:image/svg") ? { w: 462, h: 340 } : { w: 0, h: 0 });
  const logoW = lw && lh ? (logoH * lw) / lh : 0;
  const logoX = CANVAS.padX;
  const logoY = CANVAS.padTop;

  const isIU = (cfg.brandId || "").startsWith("IU");
  const ce = cfg.ce || "";
  const paceLogoPath = path.join(LOGOS, "pace-academy-logo.png");
  let paceData = "";
  if (isIU && ce && fs.existsSync(paceLogoPath)) {
    paceData = `data:image/png;base64,${fs.readFileSync(paceLogoPath).toString("base64")}`;
  }

  let eyebrow = String(cfg.eyebrow || "").toUpperCase();
  if (isIU && ce) {
    let cred = String(ce).replace(/\s*credits?/i, "").trim().toUpperCase();
    if (!/CE/i.test(cred)) cred = cred + " CE";
    eyebrow = (eyebrow ? eyebrow + "  ·  " : "") + cred;
  }
  const eyebrowTracking = 0.14 * TYPE.body;
  let afterLogoX = logoX + logoW + 8;
  let paceEl = "";
  if (paceData) {
    const pH = 14;
    const pW = pH * (658 / 324);
    const pX = afterLogoX;
    const pY = CANVAS.padTop + (BANDS.headerH - pH) / 2;
    paceEl = `    <image id="pace-plate" data-name="PACE plate" href="${paceData}" xlink:href="${paceData}" x="${pX.toFixed(2)}" y="${pY.toFixed(2)}" width="${pW.toFixed(2)}" height="${pH.toFixed(2)}" />`;
    afterLogoX += pW + 6;
  }
  const dotCx = afterLogoX + 3; // gap + half dot
  const eyebrowX = dotCx + 3 + 10; // dot right + gap
  const eyebrowY = ly.headerBaseline;

  const chipText = String(cfg.date || "").toUpperCase();
  const chipTracking = 0.10 * TYPE.body;
  const chipW = textWidth(chipText, TYPE.body, chipTracking, true);
  const chipTextRight = CANVAS.w - CANVAS.padX - 1 - 9; // border + padding
  const chipTextX = chipTextRight - chipW;
  const chipH = 2 + 6 + (FONT_METRICS[MONO].asc + FONT_METRICS[MONO].desc) * TYPE.body;
  const chipY = CANVAS.padTop + (BANDS.headerH - chipH) / 2;
  const chipX = chipTextX - 9 - 1;

  const T = tokensFor(cfg);
  const isLightHdr = String(cfg.brandId || "").includes("LIGHT");
  const chipInk = isLightHdr ? (cfg.brand.titleText || "#12182B") : "#ffffff";
  const logoEl = logo
    ? `    <image id="iu-logo" data-name="IU logo" href="${logo}" xlink:href="${logo}" x="${logoX.toFixed(2)}" y="${logoY}" width="${logoW.toFixed(2)}" height="${logoH}" opacity="0.96"/>`
    : `    <text id="wordmark" data-name="Wordmark" x="${logoX}" y="${eyebrowY}" font-family="${SANS}" font-size="16" font-weight="600" letter-spacing="-0.16" fill="${T.titleText}">${escXml((cfg.brand && cfg.brand.wordmark) || "IU")}</text>`;

  return `
  <g id="header" data-name="Header">
 ${logoEl}
 ${paceEl}
      <circle id="eyebrow-dot" data-name="Eyebrow dot" cx="${dotCx.toFixed(2)}" cy="${CANVAS.padTop + BANDS.headerH / 2}" r="3" fill="${T.accent}"/>
      <text id="eyebrow" data-name="Eyebrow" x="${eyebrowX.toFixed(2)}" y="${eyebrowY.toFixed(2)}" font-family="${MONO}" font-size="${TYPE.body}" font-weight="500" letter-spacing="${eyebrowTracking.toFixed(2)}" fill="${T.textMuted}">${escXml(eyebrow)}</text>
    <g id="date-chip" data-name="Date chip">
      <rect id="date-chip-pill" data-name="Date chip pill" x="${chipX.toFixed(2)}" y="${chipY.toFixed(2)}" width="${(chipW + 18 + 2).toFixed(2)}" height="${chipH.toFixed(2)}" rx="${(chipH / 2).toFixed(2)}" fill="${T.pillBg}" stroke="${T.line}" stroke-width="1"/>
      <text id="date-chip-text" data-name="Date chip text" x="${chipTextX.toFixed(2)}" y="${eyebrowY.toFixed(2)}" font-family="${MONO}" font-size="${TYPE.body}" font-weight="500" letter-spacing="${chipTracking.toFixed(2)}" fill="${chipInk}">${escXml(chipText)}</text>
    </g>
  </g>`;
}

/* `~` toggles the accent colour — "A ~B~ C" renders B in --accent-warm. */
function titleFragments(title) {
  return String(title || "")
    .split("~")
    .map((text, i) => ({ text, accent: i % 2 === 1 }))
    .filter((f) => f.text.length);
}

/* Wrap title fragments into lines, keeping the accent split. The DOM uses
   `text-wrap: balance`, which never leaves line 2 ragged the way a greedy
   wrap does: for the 2-line path every candidate break is scored by the
   wider of its two lines and the break that minimises that score wins. */
function balanceTitleLines(title, maxW, fontSize) {
  const tracking = -0.02 * fontSize;
  const spaceW = 0.27 * fontSize; // a space is narrower than the 0.52 avg
  const words = [];
  for (const f of titleFragments(title)) {
    for (const word of String(f.text).split(/\s+/).filter(Boolean)) {
      words.push({ word, accent: f.accent });
    }
  }
  if (!words.length) return [];

  const lineWidth = (ws) =>
    ws.reduce(
      (sum, w, i) =>
        sum + textWidth(w.word, fontSize, tracking) + (i > 0 ? spaceW : 0),
      0,
    );
  if (lineWidth(words) <= maxW) return [words];

  let best = words.length - 1;
  let bestScore = Infinity;
  for (let b = 1; b < words.length; b++) {
    const score = Math.max(lineWidth(words.slice(0, b)), lineWidth(words.slice(b)));
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return [words.slice(0, best), words.slice(best)];
}

/* Emit each line as centred text runs — one <text> per plain/accent run with
   text-anchor="middle" at the run's centre, mirroring the DOM's centred
   title block while keeping the accent fragment a single editable layer. */
function titleBlock(cfg, ly) {
  const T = tokensFor(cfg);
  const lines = ly.titleLinesArr || [];
  const tracking = -0.02 * TYPE.title;
  const spaceW = 0.27 * TYPE.title;
  return lines
    .map((line, li) => {
      const y = ly.titleBaselines[li].toFixed(2);
      /* group consecutive words with the same accent flag into runs */
      const runs = [];
      for (const f of line) {
        const last = runs[runs.length - 1];
        if (last && last.accent === f.accent) last.words.push(f.word);
        else runs.push({ accent: f.accent, words: [f.word] });
      }
      const totalW = line.reduce(
        (sum, f, i) =>
          sum + textWidth(f.word, TYPE.title, tracking) + (i > 0 ? spaceW : 0),
        0,
      );
      let x = CANVAS.w / 2 - totalW / 2;
      return runs
        .map((run, ri) => {
          const runW = run.words.reduce(
            (s, w, i) =>
              s + textWidth(w, TYPE.title, tracking) + (i > 0 ? spaceW : 0),
            0,
          );
          const cx = x + runW / 2;
          x += runW + spaceW;
          const tag = ri > 0 ? `-${ri + 1}` : "";
          const name = `Title ${li + 1}${run.accent ? " accent" : ""}${ri > 0 ? ` part ${ri + 1}` : ""}`;
          return `      <text id="title-line-${li + 1}${tag}-${run.accent ? "accent" : "plain"}" data-name="${name}" x="${cx.toFixed(2)}" y="${y}" text-anchor="middle" font-family="${SANS}" font-size="${TYPE.title}" font-weight="500" letter-spacing="${tracking.toFixed(2)}" fill="${run.accent ? T.accent : T.titleText}">${escXml(run.words.join(" "))}</text>`;
        })
        .join("\n");
    })
    .join("\n");
}

function panelistTile(p, idx, ly, cfg) {
  const T = tokensFor(cfg || {});
  const brand = (cfg && cfg.brand) || {};
  const monoFill = brand.monoText || "rgba(255,255,255,0.72)";
  const num = String(idx + 1).padStart(2, "0");
  const id = `guest-${num}`;
  const label = p.name || `Guest ${num}`;
  const tx = ly.cols[idx].tileX;
  const ty = ly.cols[idx].tileY;
  const tw = ly.ly.tileW;
  const th = ly.ly.tileH;
  const cx = ly.cols[idx].centerX;
  const rx = 6;
  const lh = (FONT_METRICS[SANS].asc + FONT_METRICS[SANS].desc) * 22;
  const monoBaseline = ty + (th - lh) / 2 + FONT_METRICS[SANS].asc * 22;
  const mono = p.placeholder ? "?" : initials(p.name) || "?";

  const parts = [];
  parts.push(`  <g id="${id}" data-name="${escXml(label)}">`);
  parts.push(`    <clipPath id="${id}-clip"><rect x="${tx.toFixed(2)}" y="${ty}" width="${tw}" height="${th}" rx="${rx}"/></clipPath>`);
  parts.push(`    <g filter="url(#tile-shadow)">`);
  parts.push(
    `      <rect id="${id}-frame" data-name="Headshot frame ${num}" x="${tx.toFixed(2)}" y="${ty}" width="${tw}" height="${th}" rx="${rx}" fill="url(#tile-fill)"/>`,
  );
  parts.push(
    `      <text id="${id}-monogram" data-name="Monogram ${num}" x="${cx.toFixed(2)}" y="${monoBaseline.toFixed(2)}" text-anchor="middle" font-family="${SANS}" font-size="22" font-weight="300" letter-spacing="0.44" fill="${monoFill}">${escXml(mono)}</text>`,
  );
  if (p.img) {
    parts.push(
      `      <image id="${id}-photo" data-name="Headshot photo ${num}" href="${p.img}" xlink:href="${p.img}" x="${tx.toFixed(2)}" y="${ty}" width="${tw}" height="${th}" clip-path="url(#${id}-clip)" preserveAspectRatio="xMidYMid slice"/>`,
    );
  }
  parts.push(`    </g>`);
  parts.push(
    `    <rect id="${id}-border" data-name="Headshot border ${num}" x="${(tx + 0.5).toFixed(2)}" y="${ty + 0.5}" width="${tw - 1}" height="${th - 1}" rx="${rx - 0.5}" fill="none" stroke="${TILE_BORDER}" stroke-width="1"/>`,
  );

  if (!p.placeholder) {
    const name = ellipsize(p.name || "", ly.ly.columnW, TYPE.body);
    parts.push(
      `    <text id="${id}-name" data-name="Name ${num}" x="${cx.toFixed(2)}" y="${ly.nameBaseline.toFixed(2)}" text-anchor="middle" font-family="${SANS}" font-size="${TYPE.body}" font-weight="500" fill="${T.titleText}">${escXml(name)}</text>`,
    );
    const roleLines = wrap(p.role || "", ly.ly.columnW, TYPE.body, 0.52).slice(0, 2);
    const truncated = wrap(p.role || "", ly.ly.columnW, TYPE.body, 0.52).length > 2;
    roleLines.forEach((line, i) => {
      const text = i === 1 && truncated ? line.replace(/\s*$/, "") + "…" : line;
      parts.push(
        `    <text id="${id}-role-${i + 1}" data-name="Role ${num} line ${i + 1}" x="${cx.toFixed(2)}" y="${(ly.roleBaseline + i * ly.roleLineH).toFixed(2)}" text-anchor="middle" font-family="${SANS}" font-size="${TYPE.body}" font-weight="400" fill="${T.textFaint}">${escXml(text)}</text>`,
      );
    });
  }
  parts.push(`  </g>`);
  return parts.join("\n");
}

function panelists(cfg, ly) {
  return ly.cols.map((c, i) => panelistTile(c.p, i, ly, cfg)).join("\n");
}

/* Full-detail small CE stamp matching the IU Panel Social Posts generator.
   Serrated (40 teeth), hairline rings, rotated individual glyphs for ring text,
   large count + label. Scaled for 640x200 banner (r~34px). */
function smallCeStampIfNeeded(cfg) {
  const brand = cfg.brand || {};
  const ce = cfg.ce || "";
  if (!ce || !brand) return "";

  const isLight = String(cfg.brandId || "").includes("LIGHT");
  const seal = brand.ceSeal || (isLight ? "#2A3A71" : "#C8DDF5");
  const ink = brand.ceInk || (isLight ? "#FFFFFF" : "#12182B");
  const hair = isLight ? "rgba(255,255,255,0.45)" : "rgba(18,24,43,0.35)";

  const m = String(ce).trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  const num = m ? m[1] : "1";
  const label = (m ? (m[2] || "CE credit") : "CE credit").toUpperCase();

  // Size for the banner (not too big, clear of canvas edge)
  let r = 32;
  const cx = CANVAS.w - 40;
  const cy = CANVAS.h - 40;
  const rotate = -10;

  // Teeth
  const teeth = 40;
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth;
    const rr = i % 2 === 0 ? r : r * 0.93;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }

  // Ring text texture — visual match to social posts stamp (small size)
  const rfSize = Math.max(5.2, r * 0.105);
  const rt = r * 0.70;
  const letters = "CONTINUINGCECOMPL";
  let ringGlyphs = "";
  const step = (2 * Math.PI) / letters.length;
  let ang = -Math.PI / 2;
  for (let i = 0; i < letters.length; i++) {
    const ch = letters[i];
    const mid = ang + step / 2;
    const gx = cx + rt * Math.cos(mid);
    const gy = cy + rt * Math.sin(mid);
    const deg = (mid * 180) / Math.PI + 90;
    ringGlyphs += `<g transform="rotate(${deg.toFixed(1)} ${gx.toFixed(1)} ${gy.toFixed(1)})">` +
      `<text x="${gx.toFixed(1)}" y="${(gy - rfSize * 0.4).toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-size="${rfSize.toFixed(1)}" fill="${ink}">${ch}</text></g>`;
    ang += step;
  }

  // Center count + label
  const countSize = Math.min(r * 0.72, 22);
  const labelSize = Math.max(r * 0.14, 7.5);
  const top = cy - (countSize * 0.45 + labelSize * 0.7);

  return `
  <g id="ce-stamp" data-name="CE stamp" transform="rotate(${rotate} ${cx} ${cy})">
    <path id="stamp-seal" data-name="Stamp seal" d="M${pts.join(" L")} Z" fill="${seal}"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.86).toFixed(2)}" fill="none" stroke="${hair}" stroke-width="${Math.max(1.2, r*0.012).toFixed(2)}"/>
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.60).toFixed(2)}" fill="none" stroke="${hair}" stroke-width="${Math.max(1.2, r*0.012).toFixed(2)}"/>
    ${ringGlyphs}
    <text id="stamp-count" data-name="Stamp count" x="${cx}" y="${top.toFixed(2)}" text-anchor="middle" font-family="${SANS}" font-size="${countSize.toFixed(1)}" font-weight="700" fill="${ink}">${num}</text>
    <text id="stamp-label" data-name="Stamp label" x="${cx}" y="${(top + countSize * 0.85).toFixed(2)}" text-anchor="middle" font-family="${MONO}" font-size="${labelSize.toFixed(1)}" font-weight="600" fill="${ink}">${label}</text>
  </g>`;
}

function buildSVG(cfg) {
  const ly = layout(cfg);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CANVAS.w}" height="${CANVAS.h}" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}">
  <!-- IU Zoom banner — ${CANVAS.w}×${CANVAS.h}. Layered for Canva editing. -->
  <!-- Each <text> / <rect> / <image> imports as an editable layer. -->
${fontFaceCss()}
${defs(cfg)}
${background(cfg)}

${header(cfg, ly)}

  <g id="title" data-name="Title">
${titleBlock(cfg, ly)}
  </g>

  <g id="panelists" data-name="Panelists">
 ${panelists(cfg, ly)}
  </g>

${smallCeStampIfNeeded(cfg)}
</svg>
`;
}

/* Turn file:// image paths into self-contained data URIs so the SVG is
   portable (Canva / Figma / email — no external file references). */
function embedImages(cfg) {
  for (const p of cfg.panelists || []) {
    const img = p.img;
    if (!img) continue;
    if (String(img).startsWith("data:")) continue;
    const file = String(img).replace(/^file:\/\//, "");
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" :
        ext === ".gif" ? "image/gif" :
        "image/jpeg";
      p.img = `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
      console.log(`    embedded headshot: ${path.basename(file)} (${p.name})`);
    } else {
      console.warn(`    (headshot not found, keeping placeholder: ${img})`);
    }
  }
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

/* The faithful preview path: Chromium loads the embedded @font-face data
   URIs, so the rasterized preview shows real Inter / IBM Plex Mono and
   matches the shipped PNG — librsvg (sharp) would silently fall back to a
   wider system font. Sharp remains a last-resort fallback. */
async function previewChromium(svgFile, outPng) {
  const OBA_SITE = path.join(ROOT, "package.json");
  const local = createRequire(import.meta.url);
  let chromium;
  try {
    chromium = local("playwright").chromium;
  } catch {
    chromium = createRequire(OBA_SITE)("playwright").chromium;
  }
  const browser = await chromium
    .launch({ channel: "chrome", args: ["--no-sandbox"] })
    .catch(() => chromium.launch({ args: ["--no-sandbox"] }));
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS.w * CANVAS.scale, height: CANVAS.h * CANVAS.scale },
      deviceScaleFactor: CANVAS.scale,
    });
    await page.goto(`file://${svgFile}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const buf = await page.locator("svg").screenshot();
    fs.writeFileSync(outPng, buf);
  } finally {
    await browser.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const configs = [];
  let preview = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-c") configs.push(argv[++i]);
    else if (argv[i] === "--preview") preview = true;
  }

  const files = configs
    .map((c) => path.resolve(__dirname, c))
    .filter((f) => fs.existsSync(f));
  if (!files.length) {
    console.error("no configs found — pass -c .gen/<name>.json");
    process.exit(1);
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
    const base = String(cfg.output || path.basename(file, ".json")).replace(/\.png$/, "");
    const outSvg = path.join(OUT_DIR, `${base}.svg`);
    const svg = buildSVG(cfg);
    fs.writeFileSync(outSvg, svg);
    console.log(`✓ ${path.relative(__dirname, outSvg)} (${Buffer.byteLength(svg).toLocaleString()} bytes)`);

    if (preview) {
      const outPng = path.join(OUT_DIR, `preview-${base}.png`);
      try {
        await previewChromium(outSvg, outPng);
        console.log(`  preview ${path.relative(__dirname, outPng)} (Chromium, real fonts)`);
      } catch (err) {
        /* Last resort: sharp/librsvg (system-font fallback, wider text). */
        if (sharp) {
          try {
            const buf = await sharp(outSvg)
              .resize(CANVAS.w * CANVAS.scale, CANVAS.h * CANVAS.scale, { fit: "fill" })
              .png().toBuffer();
            fs.writeFileSync(outPng, buf);
            console.log(`  preview ${path.relative(__dirname, outPng)} (sharp fallback)`);
          } catch (err2) {
            console.warn(`  (preview skipped — Chromium: ${err.message}; sharp: ${err2.message})`);
          }
        } else {
          console.warn(`  (preview skipped — Chromium: ${err.message}; sharp unavailable)`);
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
