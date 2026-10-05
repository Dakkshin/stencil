/**
 * Every shape the deck can draw, as pure functions returning SVG strings.
 *
 * Two rules keep this file honest:
 *
 *   1. Nothing here computes a position. Callers pass pre-computed rects from
 *      lib/geometry.mjs, so layout lives in exactly one place.
 *   2. Every element gets an `id` AND a `data-name`. That is what makes the SVG import
 *      into Canva as individually named, editable layers — the entire reason the SVG
 *      output exists. Text stays as <text>; it is never converted to paths.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { FONT_FACES, fontPath } from "./paths.mjs";
import { CANVAS, DOTS, SURFACE, INK, TYPE, SANS } from "./geometry.mjs";
import { measure, baseOffset } from "./text.mjs";

export const escXml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const n = (v) => (Math.round(v * 100) / 100).toString();

/**
 * Fonts, embedded so a generated SVG renders identically anywhere — in a browser, in
 * Canva, and in the headless Chrome that produces the PNG and PDF.
 *
 * Faces sharing the same file are declared ONCE over a weight range. That matters here
 * because the shared pool's four Inter files are byte-identical (same md5): fontsource
 * ships the VARIABLE font four times under static weight names. Declaring it four times
 * embedded the same 48KB payload four times into every slide, for nothing.
 *
 * font-display:block, not swap: with swap, document.fonts.ready resolves before the
 * real faces are active and the renderer screenshots fallback glyphs.
 */
let FONT_CSS = null;
export function fontFaceCss() {
  if (FONT_CSS !== null) return FONT_CSS;

  const groups = new Map();
  for (const f of FONT_FACES) {
    const p = fontPath(f.file);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    const key = `${f.family}|${crypto.createHash("sha1").update(buf).digest("hex")}`;
    if (!groups.has(key)) groups.set(key, { family: f.family, buf, weights: [] });
    groups.get(key).weights.push(f.weight);
  }

  const faces = [...groups.values()].map((g) => {
    const lo = Math.min(...g.weights);
    const hi = Math.max(...g.weights);
    const weight = lo === hi ? `${lo}` : `${lo} ${hi}`;
    return `@font-face{font-family:"${g.family}";font-style:normal;font-weight:${weight};` +
      `font-display:block;src:url("data:font/woff2;base64,${g.buf.toString("base64")}") format("woff2");}`;
  });

  FONT_CSS =
    `  <style>\n${faces.join("\n")}\n` +
    `text{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}\n  </style>`;
  return FONT_CSS;
}

export function imageDataUri(file) {
  if (!file) return "";
  if (file.startsWith("data:")) return file;
  if (!fs.existsSync(file)) return "";
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".svg" ? "image/svg+xml" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

/** Intrinsic size of a PNG, JPEG or SVG, read from the header — no image library needed. */
export function imageSize(file) {
  try {
    const b = fs.readFileSync(file);
    /* SVG logos (the IU lockup is vector): width/height attributes, else the viewBox. */
    const svg = b.slice(0, 4096).toString("utf8").match(/<svg\b[^>]*>/);
    if (svg) {
      const attr = (k) => parseFloat((svg[0].match(new RegExp(`\\s${k}="([\\d.]+)`)) || [])[1]);
      if (attr("width") && attr("height")) return { w: attr("width"), h: attr("height") };
      const vb = svg[0].match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
      if (vb) return { w: parseFloat(vb[1]), h: parseFloat(vb[2]) };
    }
    if (b.slice(1, 4).toString("latin1") === "PNG") {
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  } catch {}
  return null;
}

/* ------------------------------------------------------------------ text ---------- */

/**
 * One line of text, positioned by BASELINE.
 *
 * `y` is the top of the line box; baseOffset converts it. Passing a baseline directly
 * is the most common way to get text sitting a few px off in a way that reads as a
 * spacing bug rather than a baseline bug.
 */
export function text(id, name, x, yTop, content, spec, fill = INK.primary, opts = {}) {
  const { anchor = "start", lineH = spec.fs * spec.lh, upper = false, opacity } = opts;
  const s = upper ? String(content ?? "").toUpperCase() : content;
  const y = yTop + baseOffset(spec.font, spec.fs, lineH);
  const track = spec.track ? ` letter-spacing="${n(spec.track * spec.fs)}"` : "";
  const anch = anchor === "start" ? "" : ` text-anchor="${anchor}"`;
  const op = opacity === undefined ? "" : ` opacity="${n(opacity)}"`;
  return `    <text id="${id}" data-name="${escXml(name)}" x="${n(x)}" y="${n(y)}"` +
    ` font-family="${spec.font}" font-size="${spec.fs}" font-weight="${spec.weight}"${track}` +
    `${anch} fill="${fill}"${op}>${escXml(s)}</text>`;
}

/** A wrapped block. Returns "" for no lines so callers can join() without blanks. */
export function textBlock(idBase, name, x, yTop, lines, spec, fill = INK.primary, opts = {}) {
  const lineH = opts.lineH ?? spec.fs * spec.lh;
  return lines
    .map((line, i) => {
      const content = typeof line === "string" ? line : line.text;
      const lineFill = typeof line === "string" ? fill : line.dim ? opts.dimFill || INK.muted : fill;
      return text(`${idBase}-${i + 1}`, `${name} ${i + 1}`, x, yTop + i * lineH, content, spec, lineFill, { ...opts, lineH });
    })
    .join("\n");
}

/* ------------------------------------------------------------------ defs ---------- */

const gradStops = (stops) =>
  stops.map(([color, at]) => `      <stop offset="${n(at)}%" stop-color="${color}"/>`).join("\n");

/**
 * Elliptical gradients, the SVG way.
 *
 * CSS `radial-gradient(115% 90% at 78% 30%, …)` has independent x and y radii. SVG's
 * radialGradient is circular, so the ellipse is faked by scaling the gradient's own
 * coordinate system about its centre.
 */
function ellipticalRadial(id, cxPct, cyPct, rxPct, ryPct, stops) {
  const cx = (cxPct / 100) * CANVAS.w;
  const cy = (cyPct / 100) * CANVAS.h;
  const rx = (rxPct / 100) * CANVAS.w;
  const ry = (ryPct / 100) * CANVAS.h;
  return `    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(rx)}"
      gradientTransform="translate(${n(cx)},${n(cy)}) scale(1,${n(ry / rx)}) translate(${n(-cx)},${n(-cy)})">
${gradStops(stops)}
    </radialGradient>`;
}

export function defs(brand, extra = "") {
  const hero = brand.gradient.map(([c, at]) => [c, at]);
  /* The dots grid is a deck-scoped brand token (formats.deck.tokens.dotsGrid in the
     pack); geometry's DOTS is the fallback. */
  const dots = brand.dotsGrid || DOTS;
  const glass = SURFACE.glass.map(([c, at]) => [c, at * 100]);

  return `  <defs>
${ellipticalRadial("bg-hero", 78, 30, 115, 90, hero)}
${ellipticalRadial("bg-glow", 72, 42, 60, 55, [[brand.glow, 0], ["rgba(214,228,235,0)", 70]])}
    <linearGradient id="bg-scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(11,18,32,0.52)"/>
      <stop offset="40%" stop-color="rgba(11,18,32,0.26)"/>
      <stop offset="60%" stop-color="rgba(11,18,32,0)"/>
    </linearGradient>
    <linearGradient id="tile-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(11,18,32,0)"/>
      <stop offset="100%" stop-color="rgba(11,18,32,0.85)"/>
    </linearGradient>
    <pattern id="dots-pattern" width="${dots.spacing}" height="${dots.spacing}" patternUnits="userSpaceOnUse">
      <circle cx="${n(dots.spacing / 2)}" cy="${n(dots.spacing / 2)}" r="${dots.radius}" fill="rgba(255,255,255,${dots.alpha})"/>
    </pattern>
${ellipticalRadial("vignette", SURFACE.vignette.cx * 100, SURFACE.vignette.cy * 100, SURFACE.vignette.r * 100, SURFACE.vignette.r * 100 * (CANVAS.w / CANVAS.h), [
  ["rgba(11,18,32,0)", 0], ["rgba(11,18,32,0)", 55], [`rgba(11,18,32,${SURFACE.vignette.maxAlpha})`, 100],
])}
    <linearGradient id="glass" x1="0" y1="0" x2="0.42" y2="1">
${gradStops(glass)}
    </linearGradient>
    <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="${SURFACE.shadow.dy}" stdDeviation="${SURFACE.shadow.blur / 2}"
        flood-color="${SURFACE.shadow.color}" flood-opacity="${SURFACE.shadow.opacity}"/>
    </filter>
    <filter id="tile-shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feDropShadow dx="0" dy="${SURFACE.tileShadow.dy}" stdDeviation="${SURFACE.tileShadow.blur / 2}"
        flood-color="${SURFACE.tileShadow.color}" flood-opacity="${SURFACE.tileShadow.opacity}"/>
    </filter>
${extra}
  </defs>`;
}

/* ------------------------------------------------------------ backdrop ------------ */

/**
 * The four-layer OBA backdrop, plus a deck-only vignette.
 *
 * Layer order is load-bearing (OBA BRAND.md §5): gradient, glow lobe, dots, scrim. The
 * dots are masked to fade in from the left so they never sit behind primary text, and
 * the scrim keeps foreground copy legible over the bright side of the gradient.
 */
export function background(brand = {}) {
  const full = `width="${CANVAS.w}" height="${CANVAS.h}"`;
  return `  <g id="background" data-name="Background">
    <rect id="bg-base" data-name="Backdrop gradient" ${full} fill="url(#bg-hero)"/>
    <rect id="bg-glow" data-name="Glow lobe" ${full} fill="url(#bg-glow)" opacity="0.45"/>
${dotsLayer(10, brand.dotsGrid || DOTS)}
    <rect id="bg-scrim" data-name="Scrim" ${full} fill="url(#bg-scrim)"/>
  </g>`;
}

/**
 * The dots texture, faded in from the left WITHOUT an SVG mask.
 *
 * The obvious implementation masks a pattern-filled rect with a horizontal gradient.
 * That renders correctly, but Chrome cannot express an SVG mask in PDF, so it rasterizes
 * the whole layer — measured at a 6000x3375 image plus a 1.1 MB alpha channel on EVERY
 * page, about half the size of a twelve-slide deck.
 *
 * Stepping the opacity across a handful of bands is visually indistinguishable at this
 * alpha and stays pure vector. The bands are one group so Canva still imports the
 * texture as a single deletable layer.
 */
function dotsLayer(bands = 10, dots = DOTS) {
  const x0 = dots.maskFrom * CANVAS.w;
  const x1 = dots.maskTo * CANVAS.w;
  const bandW = (x1 - x0) / bands;
  const rects = [];
  for (let i = 0; i < bands; i++) {
    const o = dots.layerOpacity * ((i + 1) / bands);
    rects.push(`      <rect x="${n(x0 + i * bandW)}" y="0" width="${n(bandW + 0.5)}" height="${CANVAS.h}"` +
      ` fill="url(#dots-pattern)" opacity="${n(o)}"/>`);
  }
  rects.push(`      <rect x="${n(x1)}" y="0" width="${n(CANVAS.w - x1)}" height="${CANVAS.h}"` +
    ` fill="url(#dots-pattern)" opacity="${n(dots.layerOpacity)}"/>`);
  return `    <g id="bg-dots" data-name="Dots texture">\n${rects.join("\n")}\n    </g>`;
}

/** Always last in the tree — one rect, and the cheapest depth in the whole system. */
export const vignette = () =>
  `  <rect id="vignette" data-name="Vignette" width="${CANVAS.w}" height="${CANVAS.h}" fill="url(#vignette)"/>`;

/* ------------------------------------------------------------ surfaces ------------ */

/** Glass panel: shadow, gradient fill, hairline stroke, inset highlight. */
export function glassCard(id, name, r, opts = {}) {
  const radius = opts.radius ?? SURFACE.radius.card;
  const shadow = opts.shadow === false ? "" : ` filter="url(#card-shadow)"`;
  const fill = opts.fill ?? "url(#glass)";
  return `  <g id="${id}" data-name="${escXml(name)}">
    <rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${radius}"
      fill="${fill}" stroke="${SURFACE.cardStroke.fill}" stroke-width="${SURFACE.cardStroke.w}"${shadow}/>
    <rect x="${n(r.x + 1)}" y="${n(r.y + 1)}" width="${n(r.w - 2)}" height="${n(r.h - 2)}" rx="${radius - 1}"
      fill="none" stroke="${SURFACE.cardInset}" stroke-width="1"/>
  </g>`;
}

/** Four corner L-marks. Frames a hero slide without boxing it in. */
export function cornerBrackets() {
  const { inset: i, arm: a, w, fill } = SURFACE.bracket;
  const W = CANVAS.w, H = CANVAS.h;
  const corner = (x, y, dx, dy) => `M ${x} ${y + dy * a} L ${x} ${y} L ${x + dx * a} ${y}`;
  const d = [
    corner(i, i, 1, 1), corner(W - i, i, -1, 1),
    corner(i, H - i, 1, -1), corner(W - i, H - i, -1, -1),
  ].join(" ");
  return `  <path id="corner-brackets" data-name="Corner brackets" d="${d}" fill="none"
    stroke="${fill}" stroke-width="${w}" stroke-linecap="square"/>`;
}

export const hairline = (id, name, x, y, w, fill = SURFACE.hairline.fill) =>
  `  <rect id="${id}" data-name="${escXml(name)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${SURFACE.hairline.w}" fill="${fill}"/>`;

export const vrule = (id, name, x, y, h, fill = SURFACE.hairline.fill) =>
  `  <rect id="${id}" data-name="${escXml(name)}" x="${n(x)}" y="${n(y)}" width="${SURFACE.hairline.w}" height="${n(h)}" fill="${fill}"/>`;

/** Mono pill. Width is measured, not guessed, so the label never crowds the radius. */
export function pill(id, name, x, y, label, opts = {}) {
  const spec = opts.spec ?? TYPE.monoChip;
  const h = opts.h ?? SURFACE.pill.h;
  const padX = opts.padX ?? SURFACE.pill.padX;
  const upper = opts.upper !== false;
  const content = upper ? String(label).toUpperCase() : String(label);
  const w = Math.round(measure(content, spec) + padX * 2);
  const fill = opts.fill ?? SURFACE.pillFill;
  return {
    w,
    svg: `  <g id="${id}" data-name="${escXml(name)}">
    <rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"
      stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
${text(`${id}-label`, `${name} label`, x + padX, y + (h - spec.fs * spec.lh) / 2, content, spec, opts.textFill ?? INK.lead)}
  </g>`,
  };
}

/**
 * Multi-row badge — same surface treatment as `pill()`, but for stacking lines that
 * need DIFFERENT specs (e.g. a bold name over a smaller muted role) inside one shared
 * background, or a single field that wraps to more than one line. Corner radius is
 * fixed rather than full-capsule (`h/2`), since a tall multi-line box with rounded-off
 * ends reads as a mistake, not a badge.
 *
 * Each row is `{ text, spec, fill?, upper? }` — a single string, or an array of strings
 * for a field that has already been wrapped to several lines at that row's spec.
 */
export function pillBlock(id, name, x, y, rows, opts = {}) {
  const padX = opts.padX ?? 18;
  const padY = opts.padY ?? 10;
  const rowGap = opts.rowGap ?? 2;
  const fill = opts.fill ?? SURFACE.pillFill;

  const lines = rows.flatMap((row) => {
    const spec = row.spec;
    const upper = row.upper ?? false;
    const lineH = row.lineH ?? Math.round(spec.fs * spec.lh);
    const rowFill = row.fill ?? INK.lead;
    const texts = Array.isArray(row.text) ? row.text : [row.text];
    return texts.map((t, i) => ({
      content: upper ? String(t).toUpperCase() : String(t),
      spec, lineH, fill: rowFill,
      rowGapBefore: i === 0 ? (row.rowGapBefore ?? rowGap) : 0,
    }));
  });

  /* Content-sized by default; a caller that wants a row of identical badges (the cover
     plates) hands in the box and the rows top-align inside it. */
  const w = opts.w ?? Math.round(Math.max(...lines.map((l) => measure(l.content, l.spec))) + padX * 2);
  const h = opts.h ?? lines.reduce((sum, l, i) => sum + l.lineH + (i === 0 ? 0 : l.rowGapBefore), 0) + padY * 2;

  let cy = y + padY;
  const body = lines
    .map((l, i) => {
      cy += i === 0 ? 0 : l.rowGapBefore;
      const t = text(`${id}-line-${i + 1}`, `${name} line ${i + 1}`, x + padX, cy, l.content, l.spec, l.fill);
      cy += l.lineH;
      return t;
    })
    .join("\n");

  return {
    w, h,
    svg: `  <g id="${id}" data-name="${escXml(name)}">
    <rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="${opts.radius ?? 14}" fill="${fill}"
      stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
${body}
  </g>`,
  };
}

/** The eyebrow dot that precedes a mono label — the brand's "bullet + label" rhythm. */
export const dotMarker = (id, name, cx, cy, r = 5, fill = "rgba(255,255,255,0.85)") =>
  `  <circle id="${id}" data-name="${escXml(name)}" cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="${fill}"/>`;

/* -------------------------------------------------------------- imagery ----------- */

/**
 * A portrait inside a rounded tile.
 *
 * The image is clipped rather than masked and uses `slice`, so any aspect ratio fills
 * the tile without distortion. The crop is anchored to the TOP of the photo (`YMin`),
 * not its centre: a headshot's subject is in the upper part of the frame, and a centred
 * crop into a squarer tile takes the overflow off the top and bottom equally — which
 * clipped the top of a head on the first real deck. Anchoring top spends all of the
 * overflow on the chest, which nobody misses.
 *
 * A missing photo falls back to initials over a flat plate: the layout must never
 * break because a headshot has not arrived yet.
 */
export function headshotTile(id, name, r, speaker, opts = {}) {
  const radius = opts.radius ?? SURFACE.radius.tile;
  const clipId = `${id}-clip`;
  const uri = imageDataUri(speaker.photo);
  const monoFs = opts.monogramSize ?? Math.min(Math.round(r.w * 0.26), 96);

  const body = uri
    ? `    <image href="${uri}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}"
      preserveAspectRatio="xMidYMin slice" clip-path="url(#${clipId})"/>`
    : `    <text x="${n(r.x + r.w / 2)}" y="${n(r.y + r.h / 2 + monoFs * 0.35)}" text-anchor="middle"
      font-family="${SANS}" font-size="${monoFs}" font-weight="300" fill="rgba(255,255,255,0.42)">${escXml(speaker.initials)}</text>`;

  /* Optional bottom scrim, for a caption drawn back on top of the tile by the caller
     (the cover's name/role pills). Clipped to the same rounded rect as the photo so it
     never squares off the tile's corners. */
  const scrimH = opts.scrimH ?? 0;
  const scrim = scrimH
    ? `    <rect x="${n(r.x)}" y="${n(r.y + r.h - scrimH)}" width="${n(r.w)}" height="${n(scrimH)}"
      clip-path="url(#${clipId})" fill="url(#tile-scrim)"/>`
    : "";

  const shadow = opts.shadow === false ? "" : ` filter="url(#tile-shadow)"`;

  return `  <g id="${id}" data-name="${escXml(name)}"${shadow}>
    <clipPath id="${clipId}"><rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${radius}"/></clipPath>
    <rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${radius}" fill="#22323d"/>
${body}
${scrim}
    <rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${radius}" fill="none"
      stroke="${SURFACE.tileRing.fill}" stroke-width="${SURFACE.tileRing.w}"/>
  </g>`;
}

/**
 * QR plate. A missing code still renders the frame and the caption, so the slide reads
 * as intentional rather than broken while you are waiting on the real image.
 */
export function qrPlate(id, name, x, y, size, file, caption) {
  const uri = imageDataUri(file);
  const quiet = 12;
  const placeholderSpec = TYPE.monoLabel;
  const inner = uri
    ? `    <image href="${uri}" x="${n(x + quiet)}" y="${n(y + quiet)}" width="${n(size - quiet * 2)}" height="${n(size - quiet * 2)}"/>`
    : text(`${id}-placeholder`, `${name} placeholder`, x + size / 2, y + (size - placeholderSpec.fs * placeholderSpec.lh) / 2,
        "Scan here", placeholderSpec, SURFACE.qr.placeholderFill, { anchor: "middle", upper: true });
  /* The caption is optional. It is drawn as ONE unwrapped line, so a caller whose
     caption is wider than its column has to lay it out itself — the offer panel's
     "Scan to reserve in under a minute" measures 391px against a 368px panel. */
  const cap = caption
    ? "\n" + text(`${id}-caption`, `${name} caption`, x + size / 2, y + size + SURFACE.qr.captionGap,
        caption, TYPE.monoLabel, INK.muted, { anchor: "middle", upper: true })
    : "";
  /* tile-shadow, not card-shadow: every caller sets a caption or label 24px below this
     plate (SURFACE.qr.captionGap), and card-shadow's 24px drop plus 28px blur reaches
     well past that gap, darkening the ground behind the caption so the shadow reads as
     mispositioned rather than as belonging to the plate. Same finding as headshot tiles
     and the sponsor logo plate — see SURFACE.tileShadow. */
  return `  <g id="${id}" data-name="${escXml(name)}">
    <rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" rx="${SURFACE.radius.plate}"
      fill="#ffffff" filter="url(#tile-shadow)"/>
${inner}${cap}
  </g>`;
}

/**
 * A star rating, drawn as polygons.
 *
 * Deliberately NOT the "★" character. CHARSET in lib/metrics.mjs is ASCII plus a short
 * list of brand punctuation and does not include it, so measure() would fall back to a
 * wrong advance and every width check on that row would be quietly off. A rating is a
 * shape, not type, so MIN_TYPE does not apply to it either.
 *
 * Each star is its own <polygon> with an id and a data-name, so Canva imports a rating
 * as five editable marks rather than one opaque blob.
 */
export function stars(id, name, x, yTop, count, opts = {}) {
  const size = opts.size ?? SURFACE.star.size;
  const gap = opts.gap ?? SURFACE.star.gap;
  /* No default hue in SURFACE — the caller passes brand.accentText. */
  const fill = opts.fill ?? INK.primary;
  const R = size / 2;
  const r = R * (opts.innerRatio ?? SURFACE.star.innerRatio);

  const marks = [];
  for (let i = 0; i < count; i++) {
    const cx = x + i * (size + gap) + R;
    const cy = yTop + R;
    const pts = [];
    /* Ten vertices, alternating outer and inner radius, starting at the top point. */
    for (let v = 0; v < 10; v++) {
      const rad = v % 2 === 0 ? R : r;
      const a = -Math.PI / 2 + (v * Math.PI) / 5;
      pts.push(`${n(cx + rad * Math.cos(a))},${n(cy + rad * Math.sin(a))}`);
    }
    const idx = String(i + 1).padStart(2, "0");
    marks.push(`    <polygon id="${id}-${idx}" data-name="${escXml(name)} ${idx}" points="${pts.join(" ")}" fill="${fill}"/>`);
  }
  return `  <g id="${id}" data-name="${escXml(name)}">\n${marks.join("\n")}\n  </g>`;
}

/**
 * The one white surface in the system.
 *
 * Sponsor marks are rarely white-safe, so the logo gets a plate rather than being
 * dropped onto slate and disappearing. A missing file still renders the plate with the
 * sponsor's name ghosted into it, so the slot reads as reserved rather than broken.
 */
export function logoPlate(id, name, r, file, fallback, opts = {}) {
  const padX = opts.padX ?? opts.pad ?? 0;
  const padY = opts.padY ?? opts.pad ?? 0;
  /* tile-shadow, not card-shadow. The card shadow's 24px drop and 28px blur reach 66px
     below the plate, but its filter region only extends 62% of the way — Chrome clips
     the gradient and the plate ends in a hard horizontal edge. It is also simply too
     heavy for an element this size, the same finding that gave headshot tiles their own
     shadow (see SURFACE.tileShadow). */
  const shadow = opts.shadow === false ? "" : ` filter="url(#${opts.shadow ?? "tile-shadow"})"`;
  const parts = [
    `    <rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${opts.radius ?? SURFACE.radius.card}"
      fill="${SURFACE.logoPlate.fill}"${shadow}/>`,
  ];
  const uri = imageDataUri(file);
  if (uri) {
    const size = imageSize(file) || { w: 4, h: 1 };
    const maxW = Math.min(opts.maxW ?? Infinity, r.w - padX * 2);
    const maxH = r.h - padY * 2;
    const s = Math.min(maxW / size.w, maxH / size.h);
    const w = size.w * s, h = size.h * s;
    parts.push(`    <image id="${id}-mark" data-name="${escXml(name)} mark" href="${uri}"
      x="${n(r.x + (r.w - w) / 2)}" y="${n(r.y + (r.h - h) / 2)}" width="${n(w)}" height="${n(h)}"/>`);
  } else {
    const spec = opts.fallbackSpec ?? TYPE.h2;
    parts.push(text(`${id}-placeholder`, `${name} placeholder`, r.x + r.w / 2,
      r.y + (r.h - spec.fs * spec.lh) / 2, fallback || "Sponsor", spec,
      SURFACE.logoPlate.placeholderFill, { anchor: "middle" }));
  }
  return `  <g id="${id}" data-name="${escXml(name)}">\n${parts.join("\n")}\n  </g>`;
}

/**
 * Line icons, authored in a 24x24 box and scaled to whatever size the caller asks for.
 *
 * Paths, not an icon font: this deck embeds exactly two faces (Inter, IBM Plex Mono) and
 * pulling in a third for two glyphs would cost a full woff2 in every slide. Stroke width
 * is inside the scaled group, so the weight stays proportional at any size.
 */
const ICONS = {
  // Microphone: "speak up".
  mic: [
    "M12 2.6a2.8 2.8 0 0 1 2.8 2.8v5.5a2.8 2.8 0 0 1-5.6 0V5.4A2.8 2.8 0 0 1 12 2.6z",
    "M5.6 10.9a6.4 6.4 0 0 0 12.8 0",
    "M12 17.3v4.1",
    "M8.4 21.4h7.2",
  ],
  // Speech bubble with two text rules: "or type it".
  chat: [
    "M20 3.6H4A2.5 2.5 0 0 0 1.5 6.1v8.4A2.5 2.5 0 0 0 4 17h2.4v4.4L11.3 17H20a2.5 2.5 0 0 0 2.5-2.5V6.1A2.5 2.5 0 0 0 20 3.6z",
    "M6.4 8.4h11.2",
    "M6.4 12.2h7",
  ],
};

export function icon(id, name, x, yTop, size, which, opts = {}) {
  const paths = ICONS[which];
  if (!paths) return "";
  const body = paths
    .map((d, i) => `      <path id="${id}-${String(i + 1).padStart(2, "0")}" d="${d}"/>`)
    .join("\n");
  return `  <g id="${id}" data-name="${escXml(name)}" transform="translate(${n(x)},${n(yTop)}) scale(${n(size / 24)})"
    fill="none" stroke="${opts.stroke ?? INK.lead}" stroke-width="${n(opts.width ?? 1.25)}"
    stroke-linecap="round" stroke-linejoin="round">
${body}
  </g>`;
}

/* ------------------------------------------------------------- chrome ------------- */

/**
 * Oversized ghost numeral — structure, not decoration. Never reads as content.
 *
 * Each digit is placed in its OWN fixed-width cell rather than set as one string, so a
 * column of numerals lines up on both edges. Inter's figures are proportional: at 84px
 * "1" advances 33.1 against ~52 for every other digit, and this build has no `tnum`
 * feature to fall back on (checked in Chrome — enabling it changes the advances not at
 * all). Setting "01" as a string and anchoring it "end" therefore scattered the column's
 * left edge across ~20px, which is exactly what a reader notices.
 *
 * `xRight` is the column's right edge; digits fill leftward from it. The cell width is
 * measured rather than tabled, the same way pill() measures its own label, so the column
 * stays exact at any font size. Tracking is dropped: letter-spacing is meaningless when
 * every glyph's position is being set explicitly, and it would bias each cell's centre.
 */
export function ghostNumeral(id, name, xRight, yTop, value, spec, fill = SURFACE.ghostNumeral) {
  const digits = String(value).split("");
  const cell = Math.max(..."0123456789".split("").map((d) => measure(d, { ...spec, track: 0 })));
  const y = yTop + baseOffset(spec.font, spec.fs, spec.fs * spec.lh);
  const xs = digits.map((_, i) => n(xRight - (digits.length - i) * cell + cell / 2));
  return `    <text id="${id}" data-name="${escXml(name)}" x="${xs.join(" ")}" y="${n(y)}"` +
    ` font-family="${spec.font}" font-size="${spec.fs}" font-weight="${spec.weight}"` +
    ` text-anchor="middle" fill="${fill}">${escXml(digits.join(""))}</text>`;
}

/**
 * The running footer: hairline, event name left, slide number right.
 *
 * The current number is brighter than the total, so position reads at a glance without
 * adding a progress bar.
 */
export function slideFooter(left, number, total, bands) {
  const { footerRuleY, footerBaseY } = bands;
  const spec = TYPE.monoLabel;
  const cur = String(number).padStart(2, "0");
  const rest = ` / ${String(total).padStart(2, "0")}`;
  const restW = measure(rest.toUpperCase(), spec);
  const yTop = footerBaseY - spec.fs * spec.lh;
  return [
    hairline("footer-rule", "Footer rule", 120, footerRuleY, 1680),
    text("footer-left", "Footer event name", 120, yTop, left, spec, INK.muted, { upper: true }),
    text("footer-total", "Footer slide total", 1800, yTop, rest, spec, INK.faint, { anchor: "end", upper: true }),
    text("footer-number", "Footer slide number", 1800 - restW, yTop, cur, spec, "rgba(255,255,255,0.85)", { anchor: "end", upper: true }),
  ].join("\n");
}

/** Decorative equalizer from OBA BRAND.md §5.2. Bottom-anchored, purely ornamental. */
export function waveform(id, name, x, yBottom) {
  const profile = [40, 70, 55, 90, 60, 100, 50, 85, 65, 45, 75, 55, 95, 60, 40, 80];
  const barW = 4, gap = 4, maxH = 34;
  const bars = profile.map((pct, i) => {
    const h = (pct / 100) * maxH;
    return `    <rect id="${id}-bar-${String(i + 1).padStart(2, "0")}" data-name="Waveform bar ${String(i + 1).padStart(2, "0")}"` +
      ` x="${n(x + i * (barW + gap))}" y="${n(yBottom - h)}" width="${barW}" height="${n(h)}" rx="${barW / 2}"` +
      ` fill="rgba(255,255,255,0.28)"/>`;
  });
  return `  <g id="${id}" data-name="${escXml(name)}" aria-hidden="true">\n${bars.join("\n")}\n  </g>`;
}

export const waveformWidth = 16 * 4 + 15 * 4;

/** Brand logo, top-right, at a fixed height with its aspect preserved. */
export function brandLogo(id, name, file, x, y, h = SURFACE.logoH) {
  const uri = imageDataUri(file);
  if (!uri) return "";
  const size = imageSize(file);
  const w = size ? (size.w / size.h) * h : h * 2.4;
  return `  <image id="${id}" data-name="${escXml(name)}" href="${uri}" x="${n(x - w)}" y="${n(y)}"` +
    ` width="${n(w)}" height="${n(h)}" opacity="0.95"/>`;
}
