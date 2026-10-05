#!/usr/bin/env node
/**
 * Generate layered, Canva-friendly SVG social posts from the same JSON
 * configs used by the HTML template / PNG renderer.
 *
 * Canva editability rules honoured here (same as podcast-thumbnails):
 *   - Plain <text> elements (best chance of staying editable text in Canva)
 *   - One element = one editable layer, with readable ids/data-names
 *   - The real backdrop (radial gradient / glow / dots / scrim) is baked in
 *     so the SVG preview matches the PNG
 *   - Inter + IBM Plex Mono embedded as base64 woff2 data URIs
 *
 * Usage:
 *   node render-svg.mjs                      # render every .gen/*.json
 *   node render-svg.mjs -c .gen/the_intro.json
 *   node render-svg.mjs -c x.json --format square   # one format only
 *   node render-svg.mjs -o /tmp/svg
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORMATS,
  FORMAT_ORDER,
  TYPE,
  SPEAKER_TYPE,
  GROUP_QR,
  MANY4,
  tileLayout,
  tileOffset,
  monogramSize,
} from "../../geometry.mjs";
import { portraitBBox, portraitRect, PORTRAIT_GAP } from "../../portrait-fit.mjs";
import { CANVA, FONTS, GEN, ROOT, WORKSPACE } from "../../../../core/paths.mjs";
import { BRANDS, logoDataUri, resolveLogo } from "./brands.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEN_DIR = GEN;
const OUT_DIR = CANVA;
const HEADSHOTS_FALLBACK = path.join(ROOT, "assets", "headshots");

const SANS = "Inter";
const MONO = "IBM Plex Mono";

/* Brand logo render height. The two card types differ, and each must match its
   template: 46 on the speaker card (speaker-template.html `.logo`), 40 in the
   group posts' top bar (template.html `.logo`). */
const LOGO_H = 46;
const LOGO_H_TOP = 40;
/* Fallback aspect for the OBA mark (2278x634), used only if the asset can't be
   measured. Must match what the HTML gets from `width: auto`. */
const LOGO_ASPECT = 2278 / 634;
/* The logo's backdrop (speaker cards only). Now matches the name chip:
   translucent pillBg (0.42), 22px pad (was 44), 18px radius (was 30), 0.18 stroke.
   This is a known §8 divergence — the white mark sits over the portrait photo.
   See agents.md Known divergences. */
const LOGO_PLATE_PAD = 22;
const LOGO_PLATE_FILL = "#0d151b"; /* legacy; speaker plate now uses brand.pillBg for translucent chip match */
const LOGO_PLATE_RADIUS = 18; /* match name chip radius */
const HAIRLINE_ALPHA = 0.18; /* match name chip stroke */

/* Font ascent/descent (fraction of font-size), used for CSS-style baselines. */
const FONT_METRICS = {
  [SANS]: { asc: 0.97, desc: 0.24 },
  [MONO]: { asc: 1.03, desc: 0.28 },
};
const baseOffset = (font, size, lineH) => {
  const m = FONT_METRICS[font];
  return (lineH - (m.asc + m.desc) * size) / 2 + m.asc * size;
};

const FONT_FACES = [
  { family: "Inter", weight: "300", file: "Inter-300-normal.woff2" },
  { family: "Inter", weight: "400", file: "Inter-400-normal.woff2" },
  { family: "Inter", weight: "500", file: "Inter-500-normal.woff2" },
  { family: "Inter", weight: "600", file: "Inter-600-normal.woff2" },
  { family: "IBM Plex Mono", weight: "500", file: "IBM-Plex-Mono-500-normal.woff2" },
  { family: "IBM Plex Mono", weight: "600", file: "IBM-Plex-Mono-600-normal.woff2" },
];

const WAVE = [40, 70, 55, 90, 60, 100, 50, 85, 65, 45, 75, 55, 95, 60, 40, 80];

const escXml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  }[c]));

/* Approximate glyph width of a string: length * fontSize * factor. */
function measure(text, fontSize, factor = 0.52) {
  return String(text).length * fontSize * factor;
}

function wrap(text, maxW, fontSize, factor = 0.52) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (measure(test, fontSize, factor) <= maxW || !line) line = test;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/* Word-wrap title fragments, honouring `br` and `dim`. */
function wrapFragments(frags, maxW, fontSize, factor = 0.52) {
  const lines = [];
  let line = "";
  let lineDim = false;
  const push = () => {
    if (line.trim()) lines.push({ text: line.trim(), dim: lineDim });
    line = "";
    lineDim = false;
  };
  for (const frag of frags || []) {
    const words = String(frag.text ?? "").split(/\s+/).filter(Boolean);
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (measure(test, fontSize, factor) <= maxW || !line) {
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

function pngSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.slice(0, 8).toString("latin1") !== "\x89PNG\r\n\x1a\n") return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {
    return null;
  }
}

function photoDataUri(p) {
  if (!p) return "";
  if (p.startsWith("data:")) return p;
  if (!fs.existsSync(p)) return "";
  const ext = path.extname(p).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

function resolvePhoto(photo) {
  if (!photo) return "";
  if (photo.startsWith("data:") || path.isAbsolute(photo)) return photo;
  const candidates = [
    path.join(ROOT, "assets", "headshots", "cutouts", photo),
    path.join(__dirname, "headshots", "cutouts", photo),
    path.join(ROOT, "assets", "headshots", photo),
    path.join(__dirname, "headshots", photo),
    path.join(HEADSHOTS_FALLBACK, photo),
    path.resolve(__dirname, photo),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return "";
}

/* ------------------------------------------------------------
   Layout (mirrors the flex template, driven by lib/geometry.mjs)
   ------------------------------------------------------------ */
function computeLayout(cfg, format) {
  const F = FORMATS[format];
  const T = TYPE[format];
  const PAD = F.pad, PAD_TOP = F.padTop, PAD_BOTTOM = F.padBottom;
  const contentW = F.w - PAD * 2;

  const guests = (cfg.panelists || []).filter(Boolean);
  const n = Math.max(guests.length, 1);
  const L = tileLayout(format, n);
  const railW = L.cols * L.tileW + (L.cols - 1) * L.gap;
  const railH = L.rows * L.tileH + (L.rows - 1) * L.gap;

  /* Top bar: eyebrow (mono) and brand lockup (logo/wordmark) on one line. */
  const eyebrowLh = T.eyebrow * 1.3;
  const logoH = LOGO_H_TOP;
  const topBarH = Math.max(eyebrowLh, logoH);
  const topBarBottom = PAD_TOP + topBarH;

  /* Badge row (urgency pill / countdown). */
  const urgency = cfg.urgency ? String(cfg.urgency) : "";
  const countdown = cfg.countdown || {};
  const urgencyH = urgency ? T.badge * 1.4 + 20 : 0;
  const urgencyW = urgency ? 2 * 22 + measure(urgency, T.badge, 0.62) : 0;
  const countdownNumH = 54;
  const countdownH = countdown.number ? Math.max(countdownNumH, T.badge * 1.4) : 0;
  const badgeH = Math.max(urgencyH, countdownH);
  const badgeTop = topBarBottom + 22;
  const badgeBottom = badgeTop + badgeH;
  const middleTop = badgeBottom + (badgeH ? 18 : 0);

  /* Footer: rule + byline + foot row. */
  const real = guests.filter((g) => !g.placeholder);
  const many = real.length > 1;
  const nameFont = real.length === 1 ? T.bylineName
    : { square: 22, portrait: 22, story: 32, landscape: 22 }[format] || 22;
  const nameLh = nameFont * 1.25;
  const roleFont = real.length === 1 ? T.bylineRole
    : { square: 16, portrait: 16, story: 22, landscape: 16 }[format] || 16;
  const roleLh = roleFont * 1.4;
  const nameText =
    real.length === 1
      ? real[0].name + (real[0].credentials ? `, ${real[0].credentials}` : "")
      : real.length > 1
        ? `With ${real.map((g) => g.name).join(" · ")}`
        : "";
  const roleText =
    real.length === 1
      ? [real[0].role, real[0].company].filter(Boolean).join(" · ")
      : real.length > 1 && real.every((g) => g.role || g.company)
        ? real.map((g) => [g.role, g.company].filter(Boolean).join(" · ")).join(" · ")
        : "";
  const bylineMaxW = contentW;
  const nameLines = wrap(nameText, bylineMaxW, nameFont, 0.55);
  const roleLines = roleText ? wrap(roleText, bylineMaxW, roleFont, 0.55) : [];
  const bylineContentH =
    nameLines.length * nameLh + (roleLines.length ? 3 + roleLines.length * roleLh : 0);

  /* Foot row content height = tallest visible item.
     4+ panelists (MANY4 compact): smaller footer QR + CTA pill so the middle
     band keeps its room. Mirrors .canvas.many .qr / .cta in template.html. */
  const compact = n >= 4;
  const ev = cfg.event || {};
  const qrData = ev.qr ? photoDataUri(resolvePhoto(ev.qr)) : "";
  const qrH = qrData ? (format === "story" ? (compact ? MANY4.qrFootStory : 140) : (compact ? MANY4.qrFoot : 96)) : 0;
  const ctaText = ev.cta ? String(ev.cta) : "";
  const ctaFont = format === "story" ? (compact ? MANY4.ctaFontStory : 22) : (compact ? MANY4.ctaFont : 16);
  const ctaPad = format === "story" ? (compact ? MANY4.ctaPadStory : 18) : (compact ? MANY4.ctaPad : 12);
  const ctaH = ctaText ? ctaPad * 2 + ctaFont * 1.4 : 0;
  const eventH = ev.date || ev.time || ev.website ? (format === "landscape" ? 14 : 16) * 1.4 : 0;
  const categoryH = cfg.category ? Math.max(8, T.category * 1.4) : 0;
  const waveH = 24;
  const footContentH = Math.max(qrH, ctaH, eventH, categoryH, waveH);
  const footerH = 1 + 16 + bylineContentH + 16 + footContentH;

  const ruleY = F.h - PAD_BOTTOM - footerH;
  const middleBottom = ruleY - 24; // .bottom margin-top
  const middleCenter = (middleTop + middleBottom) / 2;

  /* Title. 4+ panelists: shrink so each headline fragment holds one line.
     Mirrors .canvas.many .title h1 in template.html. */
  const titleFont = compact ? Math.round(T.title * MANY4.titleScale) : T.title;
  const titleLh = titleFont * T.titleLh;
  const titleMaxW =
    format === "story"
      ? Math.min(760, contentW)
      : Math.min({ square: 640, portrait: 640, landscape: 620 }[format] || 640,
                 contentW - railW - 48);
  const titleLines = wrapFragments(cfg.title, titleMaxW, titleFont);
  const titleH = titleLines.length * titleLh;

  /* QR below headline (square group posts only, when event.qr is set).
     Mirrors .qr-below in template.html + GROUP_QR in lib/geometry.mjs:
     frame + SCAN TO / REGISTER stacked below, left-aligned under the
     headline. Block height matches the HTML metrics (gap + frame +
     label gap + scan line + register line) so vertical centering agrees. */
  const hasQrBelow = format === "square" && !!qrData;
  const qrBelowGap = GROUP_QR.gap;
  const qrBelowFrameSize = hasQrBelow && compact ? MANY4.qrBelowSize : GROUP_QR.size;
  const qrBelowScanFs = hasQrBelow && compact ? MANY4.qrBelowScan : GROUP_QR.scanFs;
  const qrBelowRegFs = hasQrBelow && compact ? MANY4.qrBelowReg : GROUP_QR.regFs;
  const qrBelowBlockH = hasQrBelow
    ? qrBelowGap + qrBelowFrameSize + GROUP_QR.labelGap +
      Math.round(qrBelowScanFs * 1.05) + 2 + Math.round(qrBelowRegFs * 1.05)
    : 0;

  const titleBlockH = titleH + qrBelowBlockH;

  let titleTop, railY;
  if (format === "story") {
    const total = titleBlockH + 56 + railH;
    const startY = middleCenter - total / 2;
    titleTop = startY;
    railY = startY + titleBlockH + 56;
  } else {
    titleTop = middleCenter - titleBlockH / 2;
    railY = titleTop + 40;  // align rail to approx first title line for organized side-by-side look
  }

  const railX = format === "story" ? PAD : F.w - PAD - railW;

  /* QR-below-headline frame position (absolute canvas coords). */
  const qrBelowFrameX = PAD;
  const qrBelowFrameY = hasQrBelow ? titleTop + titleH + qrBelowGap : 0;
  const qrBelowInnerPad = GROUP_QR.innerPad;
  const qrBelowLabelY = hasQrBelow ? qrBelowFrameY + qrBelowFrameSize + GROUP_QR.labelGap : 0;

  return {
    F, T, PAD, PAD_TOP, PAD_BOTTOM, contentW,
    n, L, railW, railH, railX, railY,
    topBarBottom, topBarCenterY: PAD_TOP + topBarH / 2,
    badgeTop, badgeBottom, badgeH, urgency, urgencyW, urgencyH, countdown, countdownNumH,
    middleTop, middleBottom, middleCenter,
    titleFont, titleLh, titleLines, titleTop, titleH, titleMaxW,
    hasQrBelow, qrBelowFrameX, qrBelowFrameY, qrBelowFrameSize, qrBelowInnerPad, qrBelowLabelY,
    qrBelowScanFs, qrBelowRegFs,
    nameFont, nameLh, roleFont, roleLh, nameLines, roleLines,
    bylineContentH, footContentH, ruleY,
    ev, qrData, qrH, ctaText, ctaFont, ctaPad, ctaH, eventH, categoryH, waveH,
    guests, real, many,
  };
}

/* ------------------------------------------------------------
   Speaker-promo layout (mirrors speaker-template.html)

   Composition (same as the "The Intro" speaker reference):
    · Large cutout portrait — fixed 780px wide on square at 264,202 , top 75%
      of the image visible, bleeding to the bottom edge (color by default;
      grayscale when portrait_tone = "bw")
    · Category (mono eyebrow) -> two-tone headline -> event date/time line
    · (Optional) Top-right frosted QR block (frame + SCAN TO/REGISTER below) — omitted by default
    · Name/role chip (bottom-left)
    · Brand logo (bottom-right)
   ------------------------------------------------------------ */
function computeSpeakerLayout(cfg, format) {
  const F = FORMATS[format];
  const T = SPEAKER_TYPE[format];
  const PAD = F.pad, PAD_TOP = F.padTop, PAD_BOTTOM = F.padBottom;
  const contentW = F.w - PAD * 2;

  const guests = (cfg.panelists || []).filter(Boolean);
  const guest = guests[0] || {};

  /* Text block (top-left, 60% wide like .text-block). */
  const eyebrowFs = T.eyebrow;
  const eyebrow = cfg.eyebrow || "";
  const eyebrowLh = eyebrowFs * 1.5;
  const eyebrowTop = PAD_TOP;
  const titleFont = T.title;
  const titleLh = titleFont * T.titleLh;
  const titleMaxW = Math.round(F.w * 0.6);
  /* 0.50 factor (vs 0.52 in the shared wrapFragments) matches the browser's
     `text-wrap: balance` on .headline (letter-spacing -0.02em tightens the
     line), so the SVG's event-line position stays in sync with the PNG. */
  const titleLines = wrapFragments(cfg.title, titleMaxW, titleFont, 0.5);
  const titleH = titleLines.length * titleLh;
  const titleTop = eyebrowTop + eyebrowLh + 20; // .headline margin-top
  const titleBottom = titleTop + titleH;

  /* Event line (date · time · website) — each item in its own pill. */
  const ev = cfg.event || {};
  const eventItems = [ev.date, ev.time, ev.website].filter(Boolean);
  const eventFont = T.event;
  const eventPadX = 16, eventPadY = 9, eventGap = 12;
  const eventPills = eventItems.map((t) => ({
    text: t,
    w: Math.round(eventPadX * 2 + measure(t, eventFont, 0.55)),
  }));
  const eventPillH = Math.round(eventFont * 1.4 + eventPadY * 2);
  const eventTop = titleBottom + 22; // .event-line margin-top
  const eventBottom = eventTop + eventPillH;

  /* Portrait — auto-fitted to the cutout so the head clears the event line
     and the silhouette bleeds to the bottom. Falls back to the fixed
     fractions (mirroring the template CSS vars) for monograms / no bbox. */
  const portraitWFrac = { square: 0.46, portrait: 0.5, story: 0.56, landscape: 0.46 }[format] || 0.46;
  const portraitHFrac = { square: 0.74, portrait: 0.76, story: 0.64, landscape: 0.78 }[format] || 0.74;
  const fit = guest.portraitFit || null;
  let portraitX = 0;
  let portraitY = F.h - Math.round(F.h * portraitHFrac);
  let portraitW = Math.round(F.w * portraitWFrac);
  let portraitH = Math.round(F.h * portraitHFrac);
  let portraitObjX = 0;
  let portraitObjY = 0;
  let portraitScale = 0;
  let portraitImgW = 0;
  let portraitImgH = 0;
  let portraitPosX = 50;
  let portraitPosY = 0;
  if (fit) {
    const safeTop = eventBottom + (PORTRAIT_GAP[format] ?? 34);
    const rect = portraitRect(fit, F.w, F.h, safeTop, format);
    portraitX = rect.x;
    portraitY = Math.round(rect.y);
    portraitW = Math.round(rect.w);
    portraitH = Math.round(rect.h);
    portraitObjX = rect.ox;
    portraitObjY = rect.oy;
    portraitScale = rect.scale;
    portraitImgW = fit.w;
    portraitImgH = fit.h;
    portraitPosX = rect.posX;
    portraitPosY = rect.posY;
  }

  /* QR block (top-right). The block is a frosted rounded rect for the QR
     with the CTA text stacked below it ("SCAN TO" over "REGISTER").
     Omitted by default. */
  const hasQr = !!ev.qr;
  let qrFrameX = 0, qrFrameY = 0, qrFrameSize = 0;
  let qrInnerX = 0, qrInnerY = 0, qrInnerSize = 0;
  let scanY = 0, regY = 0, scanFs = 0, regFs = 0;
  const qrData = ev.qr ? photoDataUri(resolvePhoto(ev.qr)) : "";
  if (hasQr) {
    qrFrameSize = T.qrSize;
    qrFrameX = F.w - PAD - qrFrameSize;
    qrFrameY = PAD_TOP;
    const innerPad = 6;
    qrInnerSize = qrFrameSize - innerPad * 2;
    qrInnerX = qrFrameX + innerPad;
    qrInnerY = qrFrameY + innerPad;
    scanFs = Math.max(11, Math.round(T.scan * 0.85));
    regFs = Math.max(16, Math.round(T.scan * 1.25));
    const labelGap = 4;
    const labelY = qrFrameY + qrFrameSize + labelGap;
    scanY = labelY + 10;
    regY = labelY + 22;
  }

  /* Name chip (bottom-left over the portrait; wraps like the template).
      QR block is top-right so no shifting needed. */
  const chipName = [guest.name, guest.credentials].filter(Boolean).join(", ");
  const chipRole = [guest.role, guest.company].filter(Boolean).join(" · ");
  const chipNameFs = T.chipName;
  const chipRoleFs = T.chipRole;
  const chipPadX = 17, chipPadY = 13;
  const chipNameLh = chipNameFs * 1.22;
  const chipRoleLh = chipRoleFs * 1.45;
  const maxChipW = Math.round(F.w * T.chipW);
  const nameW = measure(chipName || "", chipNameFs, 0.5) + chipPadX * 2;
  const roleW = chipRole ? measure(chipRole, chipRoleFs, 0.5) + chipPadX * 2 : 0;
  let chipW = Math.min(Math.max(nameW, roleW), maxChipW);
  const chipX = PAD;
  const chipInnerW = Math.max(chipW - chipPadX * 2, 40);
  const chipNameLines = wrap(chipName, chipInnerW, chipNameFs, 0.5);
  const chipRoleLines = chipRole ? wrap(chipRole, chipInnerW, chipRoleFs, 0.5) : [];
  const chipBodyH =
    chipNameLines.length * chipNameLh +
    (chipRoleLines.length ? 4 + chipRoleLines.length * chipRoleLh : 0);
  const chipH = chipPadY * 2 + chipBodyH;
  const chipBottom = F.h - PAD_BOTTOM;
  const chipY = chipBottom - chipH;

  /* Brand lockup (bottom-right). The mark sits on the (translucent chip-style) plate,
     and it is the plate (not the mark) that lands on the padding line — so the centre
     is offset by the plate's half-height. Matches HTML via inner padding. */
  const logoH = LOGO_H;
  const brandCy = F.h - PAD_BOTTOM - (logoH + LOGO_PLATE_PAD * 2) / 2;

  const portraitTone = cfg.portraitTone === "bw" ? "bw" : "color";

  return {
    F, T, PAD, PAD_TOP, PAD_BOTTOM, contentW,
    portraitX, portraitY, portraitW, portraitH,
    portraitObjX, portraitObjY, portraitScale, portraitImgW, portraitImgH,
    portraitPosX, portraitPosY,
    eyebrow, eyebrowFs, eyebrowLh, eyebrowTop,
    titleFont, titleLh, titleLines, titleTop, titleMaxW, titleH,
    ev, eventItems, eventFont, eventPills, eventPillH, eventPadX, eventGap,
    eventTop, eventBottom,
    hasQr, qrData, qrFrameX, qrFrameY, qrFrameSize, qrInnerX, qrInnerY, qrInnerSize, scanY, regY, scanFs, regFs,
    chipX, chipY, chipW, chipH, chipName, chipRole,
    chipNameFs, chipRoleFs, chipNameLh, chipRoleLh, chipPadX, chipPadY,
    chipNameLines, chipRoleLines,
    brandCy, logoH,
    guest, portraitTone,
  };
}

/* ------------------------------------------------------------
   SVG builders
   ------------------------------------------------------------ */
function fontFaceCss() {
  const faces = FONT_FACES.map((f) => {
    const p = path.join(FONTS, f.file);
    if (!fs.existsSync(p)) {
      console.warn(`    (font not found, will fall back: ${f.file})`);
      return "";
    }
    const b64 = fs.readFileSync(p).toString("base64");
    return `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};font-display:swap;src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }).filter(Boolean);
  return `<style>${faces.join("")}
text{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}</style>`;
}

function defs(brand, W, H, ly = null) {
  const stops = brand.gradient
    .map(([c, p]) => `<stop offset="${p / 100}" stop-color="${c}"/>`)
    .join("\n      ");
  const dots = splitRgba(brand.dots);
  const r = W * 1.15;
  const scaleY = ((H * 0.9) / r).toFixed(4);
  const rGlow = W * 0.6;
  const scaleYGlow = ((H * 0.55) / rGlow).toFixed(4);

  /* Extra defs for the speaker-promo layout (portrait clip, QR inner clip,
     chip drop shadow). */
  let speaker = "";
  if (ly && ly.portraitW) {
    const { portraitX, portraitY, portraitW, portraitH, qrInnerX, qrInnerY, qrInnerSize } = ly;
    speaker = `
    <clipPath id="speaker-portrait-clip"><rect x="${portraitX}" y="${portraitY}" width="${portraitW}" height="${portraitH}"/></clipPath>
    <linearGradient id="speaker-portrait-mono" gradientUnits="objectBoundingBox" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#0b1220" stop-opacity="0.35"/>
    </linearGradient>
    ${qrInnerSize ? `<clipPath id="qr-inner-clip"><rect x="${(qrInnerX + 1).toFixed(1)}" y="${(qrInnerY + 1).toFixed(1)}" width="${(qrInnerSize - 2).toFixed(1)}" height="${(qrInnerSize - 2).toFixed(1)}" rx="4"/></clipPath>` : ""}
    <filter id="chip-shadow" x="-30%" y="-40%" width="160%" height="220%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#0b1220" flood-opacity="0.6"/>
    </filter>`;
  }
  /* Group-post QR below the headline (square only) needs its own inner clip
     for the QR image corners. */
  let groupQr = "";
  if (ly && ly.hasQrBelow) {
    const ix = ly.qrBelowFrameX + ly.qrBelowInnerPad;
    const iy = ly.qrBelowFrameY + ly.qrBelowInnerPad;
    const is = ly.qrBelowFrameSize - ly.qrBelowInnerPad * 2;
    groupQr = `
    <clipPath id="qr-below-inner-clip"><rect x="${(ix + 1).toFixed(1)}" y="${(iy + 1).toFixed(1)}" width="${(is - 2).toFixed(1)}" height="${(is - 2).toFixed(1)}" rx="4"/></clipPath>`;
  }
  return `
  <defs>
    <radialGradient id="bg-gradient-hero" gradientUnits="userSpaceOnUse" cx="${(0.78 * W).toFixed(1)}" cy="${(0.3 * H).toFixed(1)}" r="${r}">
      ${stops}
    </radialGradient>
    <radialGradient id="bg-gradient-glow" gradientUnits="userSpaceOnUse" cx="${(0.72 * W).toFixed(1)}" cy="${(0.42 * H).toFixed(1)}" r="${rGlow}">
      <stop offset="0" stop-color="${brand.glow.replace(/[()]/g, "").replace(/rgba?\s*/, "") || "#ffffff"}" stop-opacity="${glowAlpha(brand.glow)}"/>
      <stop offset="0.7" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <pattern id="bg-dots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${dots.color}" fill-opacity="${dots.alpha}"/>
    </pattern>
    <linearGradient id="bg-dots-mask" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.24" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.7" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
    </linearGradient>
    <mask id="bg-dots-mask-el" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg-dots-mask)"/>
    </mask>
    <linearGradient id="bg-scrim-grad" x1="0" y1="0" x2="1" y2="0">
      ${(brand.scrim || [[0, "#0b1220", 0.52], [0.4, "#0b1220", 0.26], [0.6, "#0b1220", 0]]).map(([o, c, a]) => `      <stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("\n")}
    </linearGradient>
    <filter id="tile-shadow" x="-40%" y="-40%" width="180%" height="220%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#0b1220" flood-opacity="0.55"/>
    </filter>
    ${speaker}
    ${groupQr}
  </defs>`;
}

/* Parse "rgba(214, 228, 235, 0.5)" → alpha 0.5. */
function glowAlpha(glow) {
  const m = String(glow).match(/[\d.]+(?=\))/);
  const a = m ? parseFloat(m[0]) : 1;
  return Number.isFinite(a) ? a.toFixed(2) : "0.5";
}

/* Parse "rgba(22, 35, 44, 0.14)" → { color: "#16232c", alpha: "0.14" }. */
function splitRgba(rgba, fallback = "#ffffff") {
  const m = String(rgba).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return { color: fallback, alpha: "0.10" };
  const hex = [m[1], m[2], m[3]]
    .map((v) => Math.max(0, Math.min(255, Math.round(parseFloat(v)))).toString(16).padStart(2, "0"))
    .join("");
  return { color: `#${hex}`, alpha: m[4] ?? "1" };
}

function background(brand, ly) {
  const { F, PAD, PAD_TOP, PAD_BOTTOM } = ly;
  const W = F.w, H = F.h;
  return `
  <g id="bg" data-name="Background">
    <g id="bg-gradient" data-name="Background gradient" transform="translate(${(0.78 * W).toFixed(1)} ${(0.3 * H).toFixed(1)}) scale(1 ${(0.4402).toFixed(4)}) translate(-${(0.78 * W).toFixed(1)} -${(0.3 * H).toFixed(1)})">
      <rect id="bg-gradient-rect" data-name="Background gradient" x="${-W}" y="${-H}" width="${W * 3}" height="${H * 3}" fill="url(#bg-gradient-hero)"/>
    </g>
    <g id="bg-glow" data-name="Glow lobe" opacity="0.45" transform="translate(${(0.72 * W).toFixed(1)} ${(0.42 * H).toFixed(1)}) scale(1 ${((H * 0.55) / (W * 0.6)).toFixed(4)}) translate(-${(0.72 * W).toFixed(1)} -${(0.42 * H).toFixed(1)})">
      <rect id="bg-glow-rect" data-name="Glow lobe" x="${-W}" y="${-H}" width="${W * 3}" height="${H * 3}" fill="url(#bg-gradient-glow)"/>
    </g>
    <rect id="bg-dots" data-name="Dots texture" x="0" y="0" width="${W}" height="${H}" fill="url(#bg-dots)" opacity="0.75" mask="url(#bg-dots-mask-el)"/>
    <rect id="bg-scrim" data-name="Left scrim" x="0" y="0" width="${W}" height="${H}" fill="url(#bg-scrim-grad)"/>
  </g>`;
}

/* `plate` draws a backdrop behind the mark. Only the speaker card needs it —
   its portrait bleeds under that corner and washes the logo out — and only it
   has the room, since the group posts' logo shares a fixed-height header row. */
function brandLockup(brand, ly, wordmarkOnly = false, cyOverride = null, plate = false, logoH = LOGO_H_TOP) {
  const W = ly.F.w;
  const cy = cyOverride != null ? cyOverride : ly.topBarCenterY;
  if (!wordmarkOnly && brand.logo) {
    const size = pngSize(logoPath(brand));
    const h = logoH;
    const w = Math.round((size ? size.w / size.h : LOGO_ASPECT) * h);
    if (!plate) {
      const x = W - ly.PAD - w;
      return `
  <g id="brand-lockup" data-name="Brand logo">
    <image id="brand-logo" data-name="Brand logo" href="${brand.logo}" x="${x}" y="${(cy - h / 2).toFixed(1)}" width="${w}" height="${h}" opacity="0.95"/>
  </g>`;
    }
    /* The backdrop, not the mark, is what sits on the padding line — on both
       axes. `cy` is expected to already account for the plate's height (see
       computeSpeakerLayout); the HTML gets the same result for free, because
       CSS padding sits inside the absolutely-positioned border box.
       Fill uses brand.pillBg (translucent) to visually match the name chip. */
    const plateW = w + LOGO_PLATE_PAD * 2;
    const plateH = h + LOGO_PLATE_PAD * 2;
    const plateX = W - ly.PAD - plateW;
    const plateY = cy - plateH / 2;
    const x = plateX + LOGO_PLATE_PAD;
    const plateFill = brand.pillBg || LOGO_PLATE_FILL;
    return `
  <g id="brand-lockup" data-name="Brand logo">
    <rect id="brand-logo-plate" data-name="Brand logo backdrop" x="${plateX.toFixed(1)}" y="${plateY.toFixed(1)}" width="${plateW}" height="${plateH}" rx="${LOGO_PLATE_RADIUS}" fill="${plateFill}" stroke="#ffffff" stroke-opacity="${HAIRLINE_ALPHA}"/>
    <image id="brand-logo" data-name="Brand logo" href="${brand.logo}" x="${x}" y="${(cy - h / 2).toFixed(1)}" width="${w}" height="${h}"/>
  </g>`;
  }
  const text = brand.wordmark || "BRAND";
  const fs = 15;
  const w = measure(text, fs, 0.62) + fs * 0.16 * text.length; // + letter-spacing
  const x = W - ly.PAD - w;
  return `
  <g id="brand-lockup" data-name="Brand wordmark">
    <text id="brand-wordmark" data-name="Brand wordmark" x="${x.toFixed(1)}" y="${(cy + baseOffset(MONO, fs, fs * 1.3)).toFixed(1)}" font-family="${MONO}" font-size="${fs}" font-weight="600" letter-spacing="2.4" fill="${brand.wordmarkColor || "#ffffff"}">${escXml(text)}</text>
  </g>`;
}

function logoPath(brand) {
  if (brand.logoFile) return brand.logoFile;
  if (!brand.logo || brand.logo.startsWith("data:")) return "";
  return path.isAbsolute(brand.logo) ? brand.logo : path.join(__dirname, brand.logo);
}

function topBar(brand, ly) {
  const x = ly.PAD;
  const cy = ly.topBarCenterY;
  const { T } = ly;
  return `
  <g id="topbar" data-name="Top bar">
    <circle id="eyebrow-dot" data-name="Eyebrow dot" cx="${x + 3.5}" cy="${cy.toFixed(1)}" r="3.5" fill="${brand.accent}"/>
    <text id="eyebrow" data-name="Eyebrow" x="${(x + 14).toFixed(1)}" y="${(cy + baseOffset(MONO, T.eyebrow, T.eyebrow * 1.3)).toFixed(1)}" font-family="${MONO}" font-size="${T.eyebrow}" font-weight="500" letter-spacing="${(T.eyebrow * 0.14).toFixed(2)}" fill="${brand.textMuted}">${escXml(String(ly && ly.eyebrow || "").toUpperCase())}</text>
${brandLockup(brand, ly)}
  </g>`;
}

function badgeRow(brand, ly) {
  const parts = [];
  if (!ly.badgeH) return "";
  const { T } = ly;
  const centerY = ly.badgeTop + ly.badgeH / 2;
  let x = ly.PAD;
  if (ly.urgency) {
    const h = ly.urgencyH;
    const w = ly.urgencyW;
    const y = centerY - h / 2;
    parts.push(`  <g id="badge-urgency" data-name="Urgency pill">`);
    parts.push(`    <rect id="urgency-pill" data-name="Urgency pill" x="${x}" y="${y.toFixed(1)}" width="${w}" height="${h}" rx="${h / 2}" fill="${brand.accent}"/>`);
    parts.push(`    <text id="urgency-text" data-name="Urgency text" x="${(x + 22).toFixed(1)}" y="${(centerY + baseOffset(MONO, T.badge, T.badge * 1.4)).toFixed(1)}" font-family="${MONO}" font-size="${T.badge}" font-weight="600" letter-spacing="${(T.badge * 0.14).toFixed(2)}" fill="${brand.inkOnAccent}">${escXml(ly.urgency.toUpperCase())}</text>`);
    parts.push(`  </g>`);
    x += w + 16;
  }
  if (ly.countdown && ly.countdown.number) {
    const numW = measure(String(ly.countdown.number), ly.countdownNumH, 0.55);
    const label = ly.countdown.label || "";
    const labelFs = 17;
    const labelW = label ? measure(label, labelFs, 0.62) + labelFs * 0.14 * label.length : 0;
    parts.push(`  <g id="badge-countdown" data-name="Countdown">`);
    parts.push(`    <text id="countdown-number" data-name="Countdown number" x="${x.toFixed(1)}" y="${(centerY + baseOffset(SANS, ly.countdownNumH, ly.countdownNumH)).toFixed(1)}" font-family="${SANS}" font-size="${ly.countdownNumH}" font-weight="600" letter-spacing="-0.9" fill="${brand.accent}">${escXml(String(ly.countdown.number))}</text>`);
    if (label) {
      const lx = x + numW + 16;
      parts.push(`    <text id="countdown-label" data-name="Countdown label" x="${lx.toFixed(1)}" y="${(centerY + baseOffset(MONO, labelFs, labelFs * 1.3)).toFixed(1)}" font-family="${MONO}" font-size="${labelFs}" font-weight="500" letter-spacing="2.1" fill="${brand.textMuted}">${escXml(label.toUpperCase())}</text>`);
    }
    parts.push(`  </g>`);
  }
  return parts.join("\n");
}

function titleBlock(brand, ly) {
  const parts = [];
  const x = ly.PAD;
  const { titleFont, titleLh } = ly;
  parts.push(`  <g id="title-block" data-name="Headline">`);
  ly.titleLines.forEach((line, i) => {
    const y = ly.titleTop + i * titleLh + baseOffset(SANS, titleFont, titleLh);
    const fill = line.dim ? brand.dim : (brand.titleText || "#ffffff");
    parts.push(
      `    <text id="title-line-${i + 1}" data-name="Title ${i + 1}" x="${x}" y="${y.toFixed(1)}" font-family="${SANS}" font-size="${titleFont}" font-weight="300" letter-spacing="-1.1" fill="${fill}">${escXml(line.text)}</text>`,
    );
  });
  parts.push(`  </g>`);
  return parts.join("\n");
}

/* QR below the headline (square group posts only). Mirrors .qr-below in
   template.html + GROUP_QR in lib/geometry.mjs: frosted frame + SCAN TO /
   REGISTER stacked below, left-aligned under the headline. */
function qrBelowHeadline(brand, ly) {
  if (!ly.hasQrBelow || !ly.qrData) return "";
  const fx = ly.qrBelowFrameX;
  const fy = ly.qrBelowFrameY;
  const fs = ly.qrBelowFrameSize;
  const pad = ly.qrBelowInnerPad;
  const ix = fx + pad;
  const iy = fy + pad;
  const is = fs - pad * 2;
  const cx = (fx + fs / 2).toFixed(1);
  const scanY = (ly.qrBelowLabelY + 10).toFixed(1);
  const regY = (ly.qrBelowLabelY + 22).toFixed(1);
  const capFill = brand.qrCaption || "#ffffff";
  const frameFill = brand.qrFrame || "rgba(255,255,255,0.08)";
  const frameStroke = brand.qrStroke || "#ffffff";
  const parts = [];
  parts.push(`  <g id="qr-below-headline" data-name="QR code block">`);
  parts.push(`    <rect id="qr-below-frame" data-name="QR frame" x="${fx}" y="${fy.toFixed(1)}" width="${fs}" height="${fs}" rx="${GROUP_QR.frameRadius}" fill="${frameFill}" stroke="${frameStroke}" stroke-width="2"/>`);
  parts.push(`    <image id="qr-below-image" data-name="QR code" href="${ly.qrData}" x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${is}" height="${is}" clip-path="url(#qr-below-inner-clip)"/>`);
  parts.push(`    <text id="qr-below-scan-to" data-name="Scan to" x="${cx}" y="${scanY}" text-anchor="middle" font-family="${SANS}" font-size="${ly.qrBelowScanFs ?? GROUP_QR.scanFs}" font-weight="500" fill="${capFill}" fill-opacity="0.8">SCAN TO</text>`);
  parts.push(`    <text id="qr-below-register" data-name="Register" x="${cx}" y="${regY}" text-anchor="middle" font-family="${MONO}" font-size="${ly.qrBelowRegFs ?? GROUP_QR.regFs}" font-weight="600" fill="${capFill}" fill-opacity="0.8">REGISTER</text>`);
  parts.push(`  </g>`);
  return parts.join("\n");
}

function portraits(brand, ly) {
  const { guests, L } = ly;
  const monoSize = monogramSize(null, ly.L.tileW, ly.n);
  const radius = L.circle ? ly.L.tileW / 2 : 18;
  const parts = [];
  guests.forEach((guest, idx) => {
    const off = tileOffset(L, idx);
    const tx = ly.railX + off.x;
    const ty = ly.railY + off.y;
    const num = String(idx + 1).padStart(2, "0");
    const label = guest.name || `Guest ${num}`;
    const img = photoDataUri(resolvePhoto(guest.photo));
    const shadowAttr = L.circle ? "" : ' filter="url(#tile-shadow)"';
    parts.push(`  <g id="guest-${num}" data-name="${escXml(label)}">`);
    parts.push(`    <clipPath id="guest-${num}-clip"><rect x="${tx}" y="${ty}" width="${ly.L.tileW}" height="${ly.L.tileH}" rx="${radius}"/></clipPath>`);
    parts.push(`    <g${shadowAttr}>`);
    parts.push(
      `      <rect id="guest-${num}-frame" data-name="Headshot frame ${num}" x="${tx}" y="${ty}" width="${ly.L.tileW}" height="${ly.L.tileH}" rx="${radius}" fill="#2a3741" stroke="${brand.line || "#ffffff"}" stroke-width="1"/>`,
    );
    if (img) {
      parts.push(
        `      <image id="guest-${num}-photo" data-name="Portrait ${num}" href="${img}" x="${tx}" y="${ty}" width="${ly.L.tileW}" height="${ly.L.tileH}" preserveAspectRatio="xMidYMin slice" clip-path="url(#guest-${num}-clip)"/>`,
      );
    }
    /* Monogram behind the photo (placeholder for missing headshots). */
    parts.push(
      `      <text id="guest-${num}-monogram" data-name="Monogram ${num}" x="${(tx + ly.L.tileW / 2).toFixed(1)}" y="${(ty + ly.L.tileH / 2 + monoSize * 0.34).toFixed(1)}" text-anchor="middle" font-family="${SANS}" font-size="${monoSize}" font-weight="300" letter-spacing="${(monoSize * 0.04).toFixed(1)}" fill="#ffffff" fill-opacity="0.9">${escXml(initials(guest.name) || "?")}</text>`,
    );
    parts.push(`    </g>`);
    if (!L.circle) {
      const pillText = img ? (guest.short || guest.name) : "Portrait";
      const pillFont = ly.T.monoPill;
      const pillH = pillFont * 1.4 + 8;
      const labelW = Math.min(measure(pillText, pillFont, 0.62) + 16, ly.L.tileW - 20);
      const py = ty + ly.L.tileH - 10 - pillH;
      parts.push(`    <rect id="guest-${num}-label-pill" data-name="Label ${num}" x="${(tx + 10).toFixed(1)}" y="${py.toFixed(1)}" width="${labelW.toFixed(1)}" height="${pillH.toFixed(1)}" rx="${(pillH / 2).toFixed(1)}" fill="${brand.pillBg}" stroke="#ffffff" stroke-opacity="0.12"/>`);
      parts.push(`    <text id="guest-${num}-label-text" data-name="Label ${num}" x="${(tx + 10 + 8).toFixed(1)}" y="${(py + baseOffset(MONO, pillFont, pillFont * 1.4) + 4).toFixed(1)}" font-family="${MONO}" font-size="${pillFont}" font-weight="500" letter-spacing="${(pillFont * 0.1).toFixed(2)}" fill="#ffffff" fill-opacity="0.85">${escXml(pillText)}</text>`);
    }
    parts.push(`  </g>`);
  });
  return parts.join("\n");
}

function byline(brand, ly) {
  if (!ly.nameLines.length) return "";
  const x = ly.PAD;
  const y0 = ly.ruleY + 1 + 16;
  const parts = [`  <g id="byline" data-name="Byline">`];
  ly.nameLines.forEach((line, i) => {
    parts.push(
      `    <text id="byline-name-${i + 1}" data-name="Byline name" x="${x}" y="${(y0 + i * ly.nameLh + baseOffset(SANS, ly.nameFont, ly.nameLh)).toFixed(1)}" font-family="${SANS}" font-size="${ly.nameFont}" font-weight="500" fill="${brand.titleText || "#ffffff"}">${escXml(line)}</text>`,
    );
  });
  const roleY = y0 + ly.nameLines.length * ly.nameLh + 3;
  ly.roleLines.forEach((line, i) => {
    parts.push(
      `    <text id="byline-role-${i + 1}" data-name="Byline role" x="${x}" y="${(roleY + i * ly.roleLh + baseOffset(SANS, ly.roleFont, ly.roleLh)).toFixed(1)}" font-family="${SANS}" font-size="${ly.roleFont}" font-weight="400" fill="${brand.textMuted}">${escXml(line)}</text>`,
    );
  });
  parts.push(`  </g>`);
  return parts.join("\n");
}

function footRow(brand, ly) {
  const { F, T } = ly;
  const x = ly.PAD;
  const right = F.w - ly.PAD;
  const rowTop = ly.ruleY + 1 + 16 + ly.bylineContentH + 16;
  const cy = rowTop + ly.footContentH / 2;
  const parts = [`  <g id="foot-row" data-name="Footer row">`];

  /* Category (left). */
  if (ly.ev && ly.ev.category !== undefined || ly.category) {
    const cat = ly.category || "";
    const catFs = T.category;
    const dotX = x + 3;
    parts.push(`    <circle id="category-dot" data-name="Category dot" cx="${dotX}" cy="${cy.toFixed(1)}" r="3" fill="${brand.accent}"/>`);
    parts.push(`    <text id="category" data-name="Category" x="${(x + 14).toFixed(1)}" y="${(cy + baseOffset(MONO, catFs, catFs * 1.4)).toFixed(1)}" font-family="${MONO}" font-size="${catFs}" font-weight="500" letter-spacing="${(catFs * 0.14).toFixed(2)}" fill="${brand.textFaint}">${escXml(cat.toUpperCase())}</text>`);
  }

  /* Event (left, after category). */
  if (ly.ev.date || ly.ev.time || ly.ev.website) {
    const evFs = T.category;
    const items = [ly.ev.date, ly.ev.time, ly.ev.website].filter(Boolean);
    const sep = "  ·  ";
    const evText = items.join(sep);
    const evW = measure(evText, evFs, 0.55);
    const evX = x + 14 + measure(ly.category || "", T.category, 0.62) + 24;
    parts.push(`    <text id="event" data-name="Event" x="${evX.toFixed(1)}" y="${(cy + baseOffset(SANS, evFs, evFs * 1.4)).toFixed(1)}" font-family="${SANS}" font-size="${evFs}" font-weight="400" fill="${brand.titleText || "#ffffff"}" fill-opacity="0.75">${escXml(evText)}</text>`);
    parts.push(`    <text id="event-website" data-name="Event website" x="${(evX + evW).toFixed(1)}" y="${(cy + baseOffset(SANS, evFs, evFs * 1.4)).toFixed(1)}" font-family="${MONO}" font-size="${(evFs - 1)}" font-weight="500" letter-spacing="0.6" fill="${brand.textMuted}"></text>`);
  }

  /* Right group (right-to-left): waveform, cta, qr. */
  const waveW = WAVE.length * 6 - 3;
  const waveX = right - waveW;
  const waveY = cy - 12;
  parts.push(`    <g id="waveform" data-name="Waveform">`);
  WAVE.forEach((h, i) => {
    const bh = (h / 100) * 24;
    parts.push(
      `      <rect data-name="Wave bar" x="${(waveX + i * 6).toFixed(1)}" y="${(waveY + 24 - bh).toFixed(1)}" width="3" height="${bh.toFixed(1)}" rx="1.5" fill="${brand.wave || "#ffffff"}" fill-opacity="0.28"/>`,
    );
  });
  parts.push(`    </g>`);

  let cursor = waveX - 24;
  if (ly.ctaText) {
    const w = measure(ly.ctaText, ly.ctaFont, 0.55) + ly.ctaPad * 2;
    const ctaX = cursor - w;
    parts.push(`    <g id="cta" data-name="CTA pill">`);
    parts.push(`      <rect id="cta-pill" data-name="CTA pill" x="${ctaX.toFixed(1)}" y="${(cy - ly.ctaH / 2).toFixed(1)}" width="${w}" height="${ly.ctaH}" rx="${(ly.ctaH / 2).toFixed(1)}" fill="${brand.accent}"/>`);
    parts.push(`      <text id="cta-text" data-name="CTA text" x="${(ctaX + ly.ctaPad).toFixed(1)}" y="${(cy + baseOffset(SANS, ly.ctaFont, ly.ctaFont * 1.4)).toFixed(1)}" font-family="${SANS}" font-size="${ly.ctaFont}" font-weight="600" letter-spacing="0.3" fill="${brand.inkOnAccent}">${escXml(ly.ctaText)}</text>`);
    parts.push(`    </g>`);
    cursor = ctaX - 24;
  }
  /* Square group posts show the QR below the headline instead, so the footer
     QR is hidden there to avoid duplication. Other formats keep footer QR. */
  if (ly.qrData && !ly.hasQrBelow) {
    const qx = cursor - ly.qrH;
    parts.push(`    <image id="qr" data-name="QR code" href="${ly.qrData}" x="${qx.toFixed(1)}" y="${(cy - ly.qrH / 2).toFixed(1)}" width="${ly.qrH}" height="${ly.qrH}"/>`);
    cursor = qx - 24;
  }

  parts.push(`  </g>`);
  return parts.join("\n");
}

/* ------------------------------------------------------------
    Speaker-promo SVG — large cutout portrait + headline + (optional top-right
    QR block: frosted frame + SCAN TO/REGISTER below) + name chip + brand lockup.
    QR omitted by default. Mirrors speaker-template.html.
   ------------------------------------------------------------ */
function speakerPromo(brand, ly) {
  const parts = [];
  const x = ly.PAD;

  /* ---- Portrait (left, bleeding to the bottom edge) ---- */
  const img = photoDataUri(resolvePhoto(ly.guest.photo));
  parts.push(`  <g id="portrait" data-name="Portrait">`);
  if (img) {
    const tone = ly.portraitTone === "color" ? "" : ' style="filter: grayscale(1) contrast(1.07) brightness(1.02)"';
    /* Auto-fitted: when the alpha bbox is known, place the image at the exact
       cover-crop offsets (ox/oy + scaled source dims) so the SVG preview
       matches the HTML/PNG (head cleared of the date/time line, silhouette
       bleeding to the bottom). */
    if (ly.portraitScale) {
      parts.push(
        `    <image id="portrait-photo" data-name="Portrait photo" href="${img}" x="${(ly.portraitX - ly.portraitObjX).toFixed(1)}" y="${(ly.portraitY - ly.portraitObjY).toFixed(1)}" width="${(ly.portraitImgW * ly.portraitScale).toFixed(1)}" height="${(ly.portraitImgH * ly.portraitScale).toFixed(1)}" preserveAspectRatio="none" clip-path="url(#speaker-portrait-clip)"${tone}/>`,
      );
    } else {
      parts.push(
        `    <image id="portrait-photo" data-name="Portrait photo" href="${img}" x="${ly.portraitX}" y="${ly.portraitY}" width="${ly.portraitW}" height="${ly.portraitH}" preserveAspectRatio="xMidYMin slice" clip-path="url(#speaker-portrait-clip)"${tone}/>`,
      );
    }
  } else {
    parts.push(
      `    <rect id="portrait-mono-bg" data-name="Portrait placeholder" x="${ly.portraitX}" y="${ly.portraitY}" width="${ly.portraitW}" height="${ly.portraitH}" fill="url(#speaker-portrait-mono)" clip-path="url(#speaker-portrait-clip)"/>`,
    );
    const monoSize = Math.min(Math.round(ly.portraitW * 0.26), 110);
    parts.push(
      `    <text id="portrait-mono" data-name="Monogram" x="${(ly.portraitX + ly.portraitW / 2).toFixed(1)}" y="${(ly.portraitY + ly.portraitH / 2 + monoSize * 0.34).toFixed(1)}" text-anchor="middle" font-family="${SANS}" font-size="${monoSize}" font-weight="300" letter-spacing="${(monoSize * 0.04).toFixed(1)}" fill="#ffffff" fill-opacity="0.9">${escXml(initials(ly.guest.name) || "?")}</text>`,
    );
  }
  parts.push(`  </g>`);

  /* ---- Text block: eyebrow -> headline -> event line ---- */
  parts.push(`  <g id="text-block" data-name="Headline block">`);
  parts.push(`    <circle id="eyebrow-dot" data-name="Eyebrow dot" cx="${(x + 3.5).toFixed(1)}" cy="${(ly.eyebrowTop + ly.eyebrowFs * 0.55).toFixed(1)}" r="3.5" fill="${brand.accent}"/>`);
  parts.push(`    <text id="eyebrow" data-name="Eyebrow" x="${(x + 14).toFixed(1)}" y="${(ly.eyebrowTop + baseOffset(MONO, ly.eyebrowFs, ly.eyebrowLh)).toFixed(1)}" font-family="${MONO}" font-size="${ly.eyebrowFs}" font-weight="500" letter-spacing="${(ly.eyebrowFs * 0.14).toFixed(2)}" fill="${brand.textMuted}">${escXml(String(ly.eyebrow).toUpperCase())}</text>`);
  ly.titleLines.forEach((line, i) => {
    const y = ly.titleTop + i * ly.titleLh + baseOffset(SANS, ly.titleFont, ly.titleLh);
    const fill = line.dim ? brand.dim : "#ffffff";
    parts.push(
      `    <text id="title-line-${i + 1}" data-name="Title ${i + 1}" x="${x}" y="${y.toFixed(1)}" font-family="${SANS}" font-size="${ly.titleFont}" font-weight="300" letter-spacing="-1.1" fill="${fill}">${escXml(line.text)}</text>`,
    );
  });
  let evX = x;
  ly.eventPills.forEach((pill, i) => {
    const pillY = ly.eventTop;
    const rx = ly.eventPillH / 2;
    parts.push(
      `    <rect id="event-pill-${i + 1}" data-name="Event pill ${i + 1}" x="${evX}" y="${pillY}" width="${pill.w}" height="${ly.eventPillH}" rx="${rx.toFixed(1)}" fill="rgba(255,255,255,0.08)" stroke="#ffffff" stroke-opacity="0.18"/>`,
    );
    parts.push(
      `    <text id="event-pill-text-${i + 1}" data-name="Event pill text ${i + 1}" x="${(evX + pill.w / 2).toFixed(1)}" y="${(pillY + baseOffset(SANS, ly.eventFont, ly.eventPillH)).toFixed(1)}" text-anchor="middle" font-family="${SANS}" font-size="${ly.eventFont}" font-weight="400" fill="#ffffff" fill-opacity="0.9">${escXml(pill.text)}</text>`,
    );
    evX += pill.w + ly.eventGap;
  });
  parts.push(`  </g>`);

  /* ---- QR block (top-right). Frosted rounded rect for QR + CTA text below.
     Only when event.qr; omitted by default for clean speaker cards. */
  if (ly.qrData) {
    const q = ly;
    parts.push(`  <g id="qr-block" data-name="QR code block">`);
    parts.push(`    <rect id="qr-frame" data-name="QR frame" x="${q.qrFrameX}" y="${q.qrFrameY}" width="${q.qrFrameSize}" height="${q.qrFrameSize}" rx="14" fill="rgba(255,255,255,0.08)" stroke="#ffffff" stroke-width="2"/>`);
    parts.push(`    <image id="qr-image" data-name="QR code" href="${ly.qrData}" x="${q.qrInnerX.toFixed(1)}" y="${q.qrInnerY.toFixed(1)}" width="${q.qrInnerSize}" height="${q.qrInnerSize}"${q.qrInnerSize ? ` clip-path="url(#qr-inner-clip)"` : ""}/>`);
    const centerX = (q.qrFrameX + q.qrFrameSize / 2).toFixed(1);
    parts.push(`    <text id="scan-to" data-name="Scan to" x="${centerX}" y="${q.scanY.toFixed(1)}" text-anchor="middle" font-family="${SANS}" font-size="${q.scanFs}" font-weight="500" fill="#ffffff" fill-opacity="0.8">SCAN TO</text>`);
    parts.push(`    <text id="register" data-name="Register" x="${centerX}" y="${q.regY.toFixed(1)}" text-anchor="middle" font-family="${MONO}" font-size="${q.regFs}" font-weight="600" fill="#ffffff" fill-opacity="0.8">REGISTER</text>`);
    parts.push(`  </g>`);
  }

  /* ---- Name chip (bottom-left over the portrait) ---- */
  parts.push(`  <g id="chip" data-name="Panelist name chip">`);
  parts.push(`    <rect id="chip-bg" data-name="Name chip" x="${ly.chipX}" y="${ly.chipY.toFixed(1)}" width="${ly.chipW}" height="${ly.chipH.toFixed(1)}" rx="18" fill="${brand.pillBg}" stroke="#ffffff" stroke-opacity="0.18" filter="url(#chip-shadow)"/>`);
  ly.chipNameLines.forEach((line, i) => {
    parts.push(
      `    <text id="chip-name-${i + 1}" data-name="Panelist name" x="${(ly.chipX + ly.chipPadX).toFixed(1)}" y="${(ly.chipY + ly.chipPadY + i * ly.chipNameLh + baseOffset(SANS, ly.chipNameFs, ly.chipNameLh)).toFixed(1)}" font-family="${SANS}" font-size="${ly.chipNameFs}" font-weight="500" fill="#ffffff">${escXml(line)}</text>`,
    );
  });
  ly.chipRoleLines.forEach((line, i) => {
    const roleTop = ly.chipY + ly.chipPadY + ly.chipNameLines.length * ly.chipNameLh + 4;
    parts.push(
      `    <text id="chip-role-${i + 1}" data-name="Panelist role" x="${(ly.chipX + ly.chipPadX).toFixed(1)}" y="${(roleTop + i * ly.chipRoleLh + baseOffset(SANS, ly.chipRoleFs, ly.chipRoleLh)).toFixed(1)}" font-family="${SANS}" font-size="${ly.chipRoleFs}" font-weight="400" fill="#a9c1d0">${escXml(line)}</text>`,
    );
  });
  parts.push(`  </g>`);

  /* ---- Brand logo (bottom-right) ---- */
  parts.push(brandLockup(brand, ly, false, ly.brandCy, true, LOGO_H));

  return parts.join("\n");
}

function buildSvg(cfg, format) {
  const brand = BRANDS[cfg.brand] || BRANDS.OBA;
  /* logoFile keeps the real asset path alongside the embedded data URI, so the
     lockup can measure the logo's true aspect — the data URI alone can't be
     read off disk, and guessing a width makes the SVG disagree with the PNG. */
  const brandForSvg = {
    ...brand,
    logo: logoDataUri(cfg.brand || "OBA", __dirname),
    logoFile: resolveLogo(cfg.brand || "OBA", __dirname),
  };

  /* Speaker promo uses a completely different composition (large cutout
      portrait + headline + optional QR + name chip + brand lockup). */
  if (cfg.postType === "speaker_promo") {
    const ly = computeSpeakerLayout(cfg, format);
    const { F } = ly;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${F.w}" height="${F.h}" viewBox="0 0 ${F.w} ${F.h}">
${fontFaceCss()}
${defs(brandForSvg, F.w, F.h, ly)}
${background(brandForSvg, ly)}
${speakerPromo(brandForSvg, ly)}
</svg>`;
    return svg;
  }

  const ly = computeLayout(cfg, format);
  ly.eyebrow = cfg.eyebrow || "";
  const { F } = ly;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${F.w}" height="${F.h}" viewBox="0 0 ${F.w} ${F.h}">
${fontFaceCss()}
${defs(brandForSvg, F.w, F.h, ly)}
${background(brandForSvg, ly)}
${topBar(brandForSvg, ly)}
${badgeRow(brandForSvg, ly)}
  <g id="middle" data-name="Middle">
${titleBlock(brandForSvg, ly)}
${qrBelowHeadline(brandForSvg, ly)}
${portraits(brandForSvg, ly)}
  </g>
  <g id="footer" data-name="Footer">
    <rect id="rule" data-name="Rule" x="${ly.PAD}" y="${ly.ruleY}" width="${ly.F.w - ly.PAD * 2}" height="1" fill="${brandForSvg.line}"/>
${byline(brandForSvg, ly)}
${footRow(brandForSvg, ly)}
  </g>
</svg>`;
  return svg;
}

/* ------------------------------------------------------------
   CLI
   ------------------------------------------------------------ */
function parseArgs(argv) {
  const args = { configs: [], outDir: OUT_DIR, formats: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-c") args.configs.push(argv[++i]);
    else if (a === "-o") args.outDir = argv[++i];
    else if (a === "--format") args.formats = [argv[++i]];
    else if (a === "--help" || a === "-h") args.help = true;
    else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function expandConfigPaths(pattern) {
  const abs = path.resolve(WORKSPACE, pattern);
  if (fs.existsSync(abs)) {
    if (fs.statSync(abs).isDirectory()) {
      return fs.readdirSync(abs).filter((f) => f.endsWith(".json")).map((f) => path.join(abs, f));
    }
    return [abs];
  }
  if (pattern.includes("*")) {
    const star = pattern.indexOf("*");
    const baseDir = path.resolve(WORKSPACE, pattern.slice(0, star)) || __dirname;
    const prefix = pattern.slice(0, star).split(/[\\/]/).pop();
    const suffix = pattern.slice(star + 1);
    return fs
      .readdirSync(baseDir)
      .filter((f) => f.endsWith(".json") && f.startsWith(prefix) && f.endsWith(suffix))
      .map((f) => path.join(baseDir, f));
  }
  return [];
}

/* For speaker_promo, read each panelist photo's alpha bbox (Node/sharp) so
   computeSpeakerLayout() can auto-fit the portrait clear of the event line.
   The HTML/PNG path gets the same data injected via window.__setSpeakerBBox,
   and the browser measures the live event-line position, so all three outputs
   stay in sync without hard-coded magic numbers. */
async function attachFits(cfg) {
  if (cfg.postType !== "speaker_promo") return cfg;
  for (const g of cfg.panelists || []) {
    if (!g || !g.photo) continue;
    const p = resolvePhoto(g.photo);
    if (!p || p.startsWith("data:")) continue;
    g.portraitFit = await portraitBBox(p);
  }
  return cfg;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Generate layered Canva SVGs (see file header).");
    return;
  }
  fs.mkdirSync(args.outDir, { recursive: true });

  const files = [];
  if (args.configs.length) {
    for (const pattern of args.configs) files.push(...expandConfigPaths(pattern));
  } else if (fs.existsSync(GEN_DIR)) {
    files.push(...fs.readdirSync(GEN_DIR).filter((f) => f.endsWith(".json")).map((f) => path.join(GEN_DIR, f)));
  }
  if (!files.length) {
    console.error("Nothing to render. Pass -c <config.json> (or run gen.mjs first).");
    process.exit(1);
  }

  for (const file of files.sort()) {
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    await attachFits(cfg);
    const formats = args.formats || (cfg.formats && cfg.formats.length ? cfg.formats : ["square"]);
    for (const format of formats) {
      if (!FORMATS[format]) {
        console.warn(`  [${cfg.name}] unknown format "${format}" — skipped`);
        continue;
      }
      const stem = cfg.fileStem || cfg.name;
      const dirName = path.basename(args.outDir || "");
      const useClean = cfg.campaign || FORMAT_ORDER.includes(dirName);
      const fname = useClean ? `${stem}.svg` : `${stem}-${format}.svg`;
      const out = path.join(args.outDir, fname);
      fs.writeFileSync(out, buildSvg(cfg, format));
      console.log(`✓ ${out}`);
    }
  }
}

/* Exported for layout verification / tooling (e.g. node -e checks). */
export { computeLayout, computeSpeakerLayout };

/* Run the CLI only when executed directly, so the module can be imported. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
