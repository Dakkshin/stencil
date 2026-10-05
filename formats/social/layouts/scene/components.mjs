/**
 * IU components — the building blocks every layout composes. Each takes the
 * Scene, the theme and a box, draws named layers, and returns its footprint
 * ({ w, h } plus anything a caller needs to align to). Positions always come
 * from measured footprints, never eyeballed constants.
 *
 *   logo          stacked IU lockup (reversed on dark, colour master on light)
 *   kicker        uppercase topic label (thumbnail language, no leading rule)
 *   pill          outline / glass / signal pill, optional leading dot
 *   marker        "( Panelist )" parenthetical session marker
 *   titleBlock    Inter Display claim + EB Garamond italic accent line
 *   ctaCard       frosted card: lead line, SIGNAL "Register now →" pill, date
 *   dateLine      calendar glyph + date · time
 *   portrait      B&W cutout (or tile) with face-anchored framing
 *   ring          hairline credibility ring around a face
 *   nameTag       speech-bubble name tag with a tail (Design Inspiration #7)
 *   monogram      placeholder when no photo exists
 *   ceBadge       PACE logo + "1 CE credit" on a light plate (mandatory on
 *                 every CE-accredited event post)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { C, FONT, LH, RADIUS, ACCENT_SCALE, SPACE, CE } from "./tokens.mjs";
import { measure, wrap, withSize } from "./text.mjs";
import { fitFace } from "./photo.mjs";
import { LOGOS } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- logo ---------------- */

const LOGO_ASPECT = 462 / 340;
const _logoCache = new Map();
function logoHref(file) {
  if (_logoCache.has(file)) return _logoCache.get(file);
  const p = path.join(LOGOS, path.basename(file));
  const mime = p.endsWith(".svg") ? "image/svg+xml" : "image/png";
  const href = `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
  _logoCache.set(file, href);
  return href;
}

/** Logo by height; `align` "left" | "right" anchors x. */
export function logo(s, theme, { x, y, h, align = "left" }) {
  const w = h * LOGO_ASPECT;
  const lx = align === "right" ? x - w : x;
  s.image({ href: logoHref(theme.logo), x: lx, y, w, h, name: "IU logo" });
  return { x: lx, y, w, h };
}

/* ---------------- labels ---------------- */

export function kicker(s, theme, { x, y, text, size, color = theme.kicker }) {
  if (!text) return { w: 0, h: 0 };
  const font = withSize(FONT.label, size);
  const lh = Math.round(size * LH.label);
  /* no leading rule: on a feed it reads as an em dash (removed 2026-09-24) */
  s.text({ x, top: y, lines: [text], font, lh, fill: color, name: "Kicker" });
  return { w: measure(text, font), h: lh };
}

/**
 * Pill. variant: "outline" (hairline, transparent) | "glass" | "signal".
 * `dot` draws a leading status dot. `align:"right"` anchors x at the right edge.
 */
export function pill(s, theme, { x, y, text, size, variant = "outline", dot = false, align = "left", font = FONT.label }) {
  const f = withSize(font, size);
  const padX = Math.round(size * 1.05);
  const h = Math.round(size * 2.3);
  const dotR = dot ? Math.round(size * 0.3) : 0;
  const dotGap = dot ? Math.round(size * 0.65) : 0;
  const w = padX * 2 + dotR * 2 + dotGap + measure(text, f);
  const px = align === "right" ? x - w : x;
  const fill = variant === "signal" ? theme.signal : variant === "glass" ? theme.glass : "none";
  const ink = variant === "signal" ? theme.onSignal : theme.fg;
  s.rect({ x: px, y, w, h, rx: h / 2, fill, stroke: variant === "signal" ? null : variant === "outline" ? theme.pillLine : theme.glassLine, name: "Pill" });
  if (dot) s.circle({ cx: px + padX + dotR, cy: y + h / 2, r: dotR, fill: variant === "signal" ? theme.onSignal : theme.kicker, name: "Pill dot" });
  s.text({ x: px + padX + dotR * 2 + dotGap, top: y, lines: [text], font: f, lh: h, fill: ink, name: "Pill text" });
  return { x: px, y, w, h };
}

/** "( Panelist )" — the quiet parenthetical session marker. */
export function marker(s, theme, { x, y, text, size, color = theme.fgMuted }) {
  const font = withSize(FONT.body, size);
  const lh = Math.round(size * LH.body);
  const t = `( ${text} )`;
  s.text({ x, top: y, lines: [t], font, lh, fill: color, name: "Session marker" });
  return { w: measure(t, font), h: lh };
}

/* ---------------- headline ---------------- */

/**
 * Claim + accent. `title` is the normalized fragment list ({text, dim, br}).
 * Non-dim fragments = Inter Display claim; dim = EB Garamond italic accent at
 * ACCENT_SCALE. (No highlight swipe under the accent — removed at the user's
 * request, 2026-09-23.)
 * Returns { h, lines:[{text, accent, top, w, size}] } — the caller may reuse
 * line geometry (e.g. to hang a petal or route off the last line).
 * Pass `dryRun:true` to measure without drawing.
 */
export function titleBlock(s, theme, { x, top, maxW, title, size, claimFont = FONT.claim, align = "start", dryRun = false, accentScale = ACCENT_SCALE }) {
  const claim = withSize(claimFont, size);
  const accent = withSize(FONT.accent, Math.round(size * accentScale));
  const claimLh = Math.round(size * LH.claim);
  const accentLh = Math.round(accent.size * LH.accent);
  const lines = [];
  for (const frag of title || []) {
    const font = frag.dim ? accent : claim;
    for (const t of wrap(frag.text, maxW, font)) {
      lines.push({ text: t, accent: !!frag.dim, font, lh: frag.dim ? accentLh : claimLh, w: measure(t, font) });
    }
  }
  let y = top;
  for (const l of lines) {
    l.top = y;
    y += l.lh;
  }
  if (!dryRun) {
    s.group("Headline", () => {
      for (const l of lines) {
        s.text({
          x: align === "middle" ? x : x, top: l.top, lines: [l.text], font: l.font, lh: l.lh,
          fill: l.accent ? theme.accentText : theme.fg, anchor: align === "middle" ? "middle" : "start",
          name: l.accent ? "Accent line" : "Claim",
        });
      }
    });
  }
  return { h: y - top, lines, width: Math.max(0, ...lines.map((l) => l.w)) };
}

/* ---------------- date + CTA ---------------- */

function calendarGlyph(s, theme, { x, y, size, color }) {
  const w = size, h = size * 0.92, r = size * 0.14;
  s.group("Calendar icon", () => {
    s.rect({ x, y: y + size * 0.08, w, h, rx: r, fill: "none", stroke: color, sw: Math.max(1.5, size * 0.085) });
    s.rect({ x, y: y + size * 0.08, w, h: size * 0.26, rx: r, fill: color });
    s.rect({ x: x + w * 0.24, y, w: size * 0.09, h: size * 0.2, rx: size * 0.04, fill: color });
    s.rect({ x: x + w * 0.67, y, w: size * 0.09, h: size * 0.2, rx: size * 0.04, fill: color });
  });
}

/** Calendar glyph + "Thu, Oct 22 · 8:00 PM EST". Returns footprint. */
export function dateLine(s, theme, { x, y, date, time, size, color = theme.fg, align = "left" }) {
  const text = [date, time].filter(Boolean).join("  ·  ");
  if (!text) return { w: 0, h: 0 };
  const font = withSize(FONT.meta, size);
  const lh = Math.round(size * 1.4);
  const icon = Math.round(size * 0.95);
  const gap = Math.round(size * 0.6);
  const w = icon + gap + measure(text, font);
  const lx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  calendarGlyph(s, theme, { x: lx, y: y + (lh - icon) / 2, size: icon, color });
  s.text({ x: lx + icon + gap, top: y, lines: [text], font, lh, fill: color, name: "Date + time" });
  return { x: lx, w, h: lh };
}

/**
 * iOS-style arrow glyph (SF Symbols arrow.right language): a thin shaft plus
 * a chevron head, stroked with round caps — a real vector, never a text
 * glyph, so it renders identically on every platform. `size` is the glyph
 * box edge.
 */
export function arrowGlyph(s, { x, y, size, color, sw }) {
  const w = sw || Math.max(1.5, size * 0.12);
  const f = (v) => Number(v.toFixed(2));
  const x0 = x + size * 0.18, x1 = x + size * 0.8, my = y + size * 0.5;
  const hx = x + size * 0.52, hy0 = y + size * 0.24, hy1 = y + size * 0.76;
  s.path({
    d: `M${f(x0)} ${f(my)}L${f(x1)} ${f(my)}M${f(hx)} ${f(hy0)}L${f(x1)} ${f(my)}L${f(hx)} ${f(hy1)}`,
    stroke: color, sw: w, name: "Button arrow",
  });
}

/** Width of a button's text + arrow content (before the button's own padding). */
export function buttonContentW(label, font, size) {
  return measure(label, font) + Math.round(size * 0.55) + Math.round(size * 1.0);
}

/**
 * Button label with a vector arrow: draws `label` and an iOS-style arrow as
 * one unit centred on `cx`. `top`/`lh` are the text line box; the glyph is
 * centred on the button's vertical middle. Returns the content width.
 */
export function buttonLabel(s, { cx, top, lh, label, font, size, color }) {
  const textW = measure(label, font);
  const gap = Math.round(size * 0.55);
  const icon = Math.round(size * 1.0);
  const x0 = cx - (textW + gap + icon) / 2;
  s.text({ x: x0, top, lines: [label], font, lh, fill: color, name: "Register text" });
  arrowGlyph(s, { x: x0 + textW + gap, y: top + lh / 2 - icon / 2, size: icon, color });
  return textW + gap + icon;
}

/**
 * Frosted CTA card (Design Inspiration #9). The CTA pill is the post's ONE
 * Signal Teal use. `lead` is optional ("Join us live"). Returns { x, y, w, h };
 * `dryRun:true` measures without drawing.
 */
export function ctaCard(s, theme, { x, y, w, lead, cta = "Register now", date, time, size, align = "left", dryRun = false }) {
  const pad = Math.round(size * 1.3);
  const leadFont = withSize(FONT.claimLight, Math.round(size * 1.35));
  const leadLh = Math.round(leadFont.size * 1.15);
  const ctaFont = withSize(FONT.cta, size);
  const ctaH = Math.round(size * 2.6);
  const ctaW = Math.round(buttonContentW(cta, ctaFont, size) + size * 2.4);
  const dateH = date || time ? Math.round(size * 1.4) : 0;
  const gap = Math.round(size * 0.9);
  const h = pad * 2 + (lead ? leadLh + gap : 0) + ctaH + (dateH ? gap + dateH : 0);
  if (dryRun) return { x, y, w, h };
  s.group("CTA card", () => {
    s.rect({ x, y, w, h, rx: RADIUS.card, fill: theme.glass, stroke: theme.glassLine, name: "CTA card" });
    let cy = y + pad;
    const cx = align === "center" ? x + w / 2 : x + pad;
    if (lead) {
      s.text({ x: cx, top: cy, lines: [lead], font: leadFont, lh: leadLh, fill: theme.fg, anchor: align === "center" ? "middle" : "start", name: "CTA lead" });
      cy += leadLh + gap;
    }
    const bx = align === "center" ? cx - ctaW / 2 : cx;
    s.rect({ x: bx, y: cy, w: ctaW, h: ctaH, rx: ctaH / 2, fill: theme.signal, name: "Register button" });
    buttonLabel(s, { cx: bx + ctaW / 2, top: cy, lh: ctaH, label: cta, font: ctaFont, size, color: theme.onSignal });
    cy += ctaH + gap;
    if (dateH) dateLine(s, theme, { x: align === "center" ? cx : cx, y: cy, date, time, size: Math.round(size * 0.92), color: theme.fgMuted, align: align === "center" ? "center" : "left" });
  });
  return { x, y, w, h };
}

/**
 * The series registration unit: a SIGNAL pill button paired with a separate
 * frosted container holding date/time beside the PACE plate — logistics +
 * accreditation grouped, action adjacent. Single-line date by default;
 * `dateStack` stacks date over muted time for narrow portrait rows.
 * dir "stack": pill over container (card footers). dir "row": pill beside
 * container (floating rows). Returns { x, y, w, h, reg, box, info } — the
 * pill, container and date boxes for seal/face keep-outs.
 * `dryRun:true` measures without drawing.
 */
export function registerUnit(s, theme, { x, y, dir = "stack", cta, ctaFont, size, date, time, dateSize, dateStack = false, paceH = 52, dryRun = false }) {
  const gap = SPACE.s, padC = SPACE.s;
  const ctaH = cta ? Math.round(size * 2.6) : 0;
  const ctaW = cta ? Math.round(buttonContentW(cta, ctaFont, size) + size * 2.4) : 0;
  const hasDT = !!(date || time);
  const dateFont = withSize(FONT.meta, dateSize);
  const timeFont = withSize(FONT.meta, dateSize);
  const timeMuted = "rgba(255,255,255,0.68)";
  const dateW = hasDT && !dateStack ? Math.round(dateSize * 0.95) + Math.round(dateSize * 0.6) + measure([date, time].filter(Boolean).join("  ·  "), dateFont) : 0;
  const dateLh = hasDT && !dateStack ? Math.round(dateSize * 1.4) : 0;
  /* stacked date block (portrait rows): date over muted time, same width class */
  const timeW = hasDT && dateStack && time ? measure(time, timeFont) : 0;
  const dateLineW = hasDT && dateStack && date ? measure(date, dateFont) : 0;
  const stackW = hasDT && dateStack ? Math.max(dateLineW, timeW) : 0;
  const stackH = hasDT && dateStack ? Math.round(dateSize * 1.4) + 4 + Math.round(timeFont.size * 1.35) : 0;
  const dtW = dateStack ? stackW : dateW;
  const dtH = dateStack ? stackH : dateLh;
  const badge = ceBadge(s, theme, { x: 0, y: 0, h: paceH, dryRun: true });
  const containerW = padC * 2 + (hasDT ? dtW + gap : 0) + badge.w;
  const containerH = Math.max(dtH, paceH) + padC * 2;
  const w = dir === "row" ? (cta ? ctaW + gap : 0) + containerW : Math.max(ctaW, containerW);
  const h = dir === "row" ? Math.max(ctaH, containerH) : ctaH + (cta ? gap : 0) + containerH;
  const reg = cta ? (dir === "row"
    ? { x, y: y + (h - ctaH) / 2, w: ctaW, h: ctaH }
    : { x, y, w: ctaW, h: ctaH }) : null;
  const box = dir === "row"
    ? { x: x + (cta ? ctaW + gap : 0), y: y + (h - containerH) / 2, w: containerW, h: containerH }
    : { x, y: y + ctaH + (cta ? gap : 0), w: containerW, h: containerH };
  const info = hasDT ? { x: box.x + padC, y: box.y + (containerH - dtH) / 2, w: dtW, h: dtH } : null;
  if (dryRun) return { x, y, w, h, reg, box, info };
  s.group("Registration unit", () => {
    if (cta) {
      s.rect({ x: reg.x, y: reg.y, w: reg.w, h: reg.h, rx: reg.h / 2, fill: theme.signal, name: "Register button" });
      buttonLabel(s, { cx: reg.x + reg.w / 2, top: reg.y, lh: reg.h, label: cta, font: ctaFont, size, color: theme.onSignal });
    }
    /* smoked-glass chip, both themes: a translucent dark gradient (background
       shows through = frosted read) with a specular hairline up top. True
       backdrop blur is off the table (scene has no filters, by design for
       Canva fidelity) — sheen + hairline is the sanctioned glass language.
       The white PACE plate and light date ink sit on smoke, never on glass. */
    s.rect({
      x: box.x, y: box.y, w: box.w, h: box.h, rx: RADIUS.soft,
      fill: { type: "linear", x1: 0, y1: 0, x2: 0, y2: 1, stops: [["rgba(30,40,78,0.82)", 0], ["rgba(13,18,36,0.68)", 1]] },
      stroke: theme.glassLine, name: "Logistics container",
    });
    s.rect({ x: box.x + RADIUS.soft, y: box.y + 1, w: box.w - RADIUS.soft * 2, h: 1.5, fill: "#FFFFFF", opacity: 0.22, name: "Glass highlight" });
    if (hasDT && !dateStack) dateLine(s, theme, { x: info.x, y: info.y, date, time, size: dateSize, color: C.WHITE });
    if (hasDT && dateStack) {
      const dateLh = Math.round(dateSize * 1.4);
      if (date) s.text({ x: info.x, top: info.y, lines: [date], font: dateFont, lh: dateLh, fill: C.WHITE, name: "Date + time" });
      if (time) s.text({ x: info.x, top: info.y + dateLh + 4, lines: [time], font: timeFont, lh: Math.round(timeFont.size * 1.35), fill: timeMuted, name: "Date + time" });
    }
    ceBadge(s, theme, { x: box.x + box.w - padC - badge.w, y: box.y + (containerH - paceH) / 2, h: paceH });
  });
  return { x, y, w, h, reg, box, info };
}

/* ---------------- people ---------------- */

/** Hairline credibility ring centred on a face (thumbnail RING language). */
export function ring(s, theme, { cx, cy, r, sw = 2, opacity = 0.6 }) {
  s.circle({ cx, cy, r, stroke: theme.ring, sw, strokeOpacity: opacity, name: "Credibility ring" });
}

/**
 * Face-anchored B&W portrait. `clip` is the shape the photo is cut to (rect
 * {x,y,w,h,rx} or circle {cx,cy,r}); for a bleeding cutout pass a rect that
 * runs off the canvas. Returns the fit rect.
 */
export function portrait(s, photo, { faceH, cx, faceTop, clip, name = "Portrait" }) {
  const fit = fitFace(photo, { faceH, cx, faceTop });
  s.image({ href: photo.href, x: fit.x, y: fit.y, w: fit.w, h: fit.h, clip, name });
  return fit;
}

export function initials(name) {
  return String(name || "")
    .replace(/,.*$/, "")
    .replace(/^(dr|mr|ms|mrs)\.?\s+/i, "")
    .split(/[\s·–—-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Monogram placeholder filling `clip` (rect or circle). */
export function monogram(s, theme, { name, clip, size }) {
  const box = clip.r != null ? { x: clip.cx - clip.r, y: clip.cy - clip.r, w: clip.r * 2, h: clip.r * 2 } : clip;
  s.group("Monogram", () => {
    if (clip.r != null) s.circle({ cx: clip.cx, cy: clip.cy, r: clip.r, fill: theme.tileFill, stroke: theme.line });
    else s.rect({ ...clip, fill: theme.tileFill, stroke: theme.line });
    const font = withSize(FONT.claimLight, size);
    s.text({ x: box.x + box.w / 2, top: box.y, lines: [initials(name) || "?"], font, lh: box.h, fill: theme.fgMuted, anchor: "middle", name: "Initials" });
  });
}

/**
 * Speech-bubble name tag with a tail pointing toward (tx, ty) — the tail sits
 * on the bubble's bottom-left or bottom-right corner depending on `side`.
 * `fill` defaults to the plate colour; name bold + optional role line.
 */
export function nameTag(s, theme, { x, y, name, role, size, side = "left", fill = theme.plate, maxW = 420, minSize = 18, roleSize }) {
  const nf = withSize(FONT.name, size);
  /* The role line never drops below the format's caption floor (`minSize`). */
  const rf = withSize(FONT.body, roleSize ?? Math.max(minSize, Math.round(size * 0.72)));
  const padX = Math.round(size * 0.7), padY = Math.round(size * 0.45);
  const nameLines = wrap(name, maxW - padX * 2, nf);
  const roleLines = role ? wrap(role, maxW - padX * 2, rf) : [];
  const nlh = Math.round(size * 1.2), rlh = Math.round(rf.size * 1.35);
  const w = Math.min(maxW, padX * 2 + Math.max(...nameLines.map((l) => measure(l, nf)), ...roleLines.map((l) => measure(l, rf)), 0));
  const h = padY * 2 + nameLines.length * nlh + roleLines.length * rlh;
  const tail = Math.round(size * 0.55);
  const r = Math.min(RADIUS.soft, h / 2);
  /* bubble outline with a tail notch on the bottom edge */
  const tx0 = side === "left" ? x + r + 6 : x + w - r - 6 - tail;
  const d = [
    `M${x + r} ${y}`, `H${x + w - r}`, `Q${x + w} ${y} ${x + w} ${y + r}`, `V${y + h - r}`, `Q${x + w} ${y + h} ${x + w - r} ${y + h}`,
    ...(side === "right"
      ? [`H${tx0 + tail}`, `L${tx0 + tail} ${y + h + tail}`, `L${tx0} ${y + h}`]
      : [`H${tx0 + tail}`, `L${tx0} ${y + h + tail}`, `L${tx0} ${y + h}`]),
    `H${x + r}`, `Q${x} ${y + h} ${x} ${y + h - r}`, `V${y + r}`, `Q${x} ${y} ${x + r} ${y}`, "Z",
  ].join(" ");
  s.group("Name tag", () => {
    s.path({ d, fill, stroke: theme.glassLine, sw: 1, name: "Tag bubble" });
    s.text({ x: x + padX, top: y + padY, lines: nameLines, font: nf, lh: nlh, fill: theme.fg, name: "Tag name" });
    if (roleLines.length) s.text({ x: x + padX, top: y + padY + nameLines.length * nlh, lines: roleLines, font: rf, lh: rlh, fill: theme.fgMuted, name: "Tag role" });
  });
  return { x, y, w, h: h + tail, bubbleH: h };
}

/* ---------------- CE badge ---------------- */

const PACE_LOGO = "assets/pace-academy-logo.png";
const PACE_ASPECT = 658 / 324;
/* The plate the partner mark sits on. Never the brand ground, never a tint. */
const C_PLATE = "#FFFFFF";

/**
 * PACE badge — the AGD PACE logo on a light plate.
 *
 * This is the accreditation PROVIDER mark: it says who approved the programme
 * and carries no credit count. The CE stamp carries the count, and only it, so
 * a post never states the number twice.
 *
 * It takes no input and has no empty state. Every IU event post carries it, so
 * there is nothing to be missing and nothing to decide — it used to return a
 * zero-width box when no credit line was set, which meant a post with no `ce`
 * silently shipped with no accreditation on it at all.
 *
 * The plate is not decoration: PACE's grey wordmark disappears on the dark IU
 * ground and a partner's logo is never recoloured, so it always sits on
 * CLOUD/white. `h` is the plate height (≥ 64 keeps the mark recognisable).
 * `align:"right"` anchors x at the right edge. `dryRun` measures only.
 * Returns { x, y, w, h }.
 */
export function ceBadge(s, theme, { x, y, h, align = "left", dryRun = false }) {
  const pad = Math.round(h * 0.16);
  const logoH = h - pad * 2;
  const w = pad * 2 + logoH * PACE_ASPECT;
  const bx = align === "right" ? x - w : x;
  if (dryRun) return { x: bx, y, w, h };
  s.group("PACE badge", () => {
    s.rect({ x: bx, y, w, h, rx: RADIUS.soft, fill: C_PLATE, stroke: theme.mode === "light" ? theme.line : null, name: "PACE plate" });
    s.image({ href: logoHref(PACE_LOGO), x: bx + pad, y: y + pad, w: logoH * PACE_ASPECT, h: logoH, name: "PACE logo" });
  });
  return { x: bx, y, w, h };
}

/* ---------------- CE stamp ---------------- */

/** "1 CE credit" → { num: "1", label: "CE CREDIT" }; plural kept ("2 CE credits"). */
export function parseCredits(ce) {
  const m = String(ce || "").trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  return m ? { num: m[1], label: (m[2] || "CE credit").toUpperCase() } : { num: "", label: String(ce || "").toUpperCase() };
}

/** The radius ceStamp will actually draw at — use it to plan placement. */
export function stampRadius({ r, credits, minSize = CE.stampMinLabel }) {
  const { label } = parseCredits(credits);
  const lf0 = withSize({ ...FONT.label, tracking: 0.06 }, minSize);
  return Math.max(r, (measure(label, lf0) + minSize * 0.5) / 1.08);
}

/**
 * CE stamp — the attention device for CE credits: a serrated seal, tilted,
 * with the credit count huge in the centre and a ring of text around it.
 * Colours: POWDER seal + INK text on dark; NAVY seal + WHITE text on light
 * (never Signal Teal — that stays the Register button's). The ring text is
 * individual rotated glyphs, not a textPath, so Canva imports it faithfully.
 * `ring` is the circular text (default "CONTINUING EDUCATION · COMPLIMENTARY ·").
 * Returns the bounding box { x, y, w, h } of the un-rotated seal.
 */
export function ceStamp(s, theme, { cx, cy, r, credits, rotate = -10, ring = "CONTINUING EDUCATION · COMPLIMENTARY · ", minSize = CE.stampMinLabel }) {
  const { num, label } = parseCredits(credits);
  /* Not a silent no-op: a post reaching here without a credit count would ship
     claiming CE credit and showing none. gen.mjs rejects the omission first;
     this is the backstop for a layout that forgot to pass it on. */
  if (!num && !label) throw new Error("ceStamp: no credit count — every IU event post carries one");
  /* The stamp grows (around the caller's centre) until the label fits on ONE
     line inside the inner ring at `minSize` — legibility sets the size, the
     caller's r is a minimum. */
  r = stampRadius({ r, credits, minSize });
  const dark = theme.mode !== "light";
  const seal = dark ? "#C8DDF5" : "#2A3A71";
  const ink = dark ? "#12182B" : "#FFFFFF";
  const hair = dark ? "rgba(18,24,43,0.35)" : "rgba(255,255,255,0.45)";
  const teeth = 40;
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI * i) / teeth;
    const rr = i % 2 === 0 ? r : r * 0.93;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  s.group("CE stamp", () => {
    s.path({ d: `M${pts.join(" L")} Z`, fill: seal, name: "Stamp seal" });
    s.circle({ cx, cy, r: r * 0.86, stroke: hair, sw: Math.max(1.5, r * 0.012), name: "Stamp outer ring" });
    s.circle({ cx, cy, r: r * 0.6, stroke: hair, sw: Math.max(1.5, r * 0.012), name: "Stamp inner ring" });
    /* ring text: glyph by glyph around the band between 0.6r and 0.86r */
    /* Ring glyphs are stamp texture (like the fine print on a rubber stamp):
       the message never depends on them, so the legibility guard exempts
       "Stamp ring glyph". Everything in the centre meets `minSize`. */
    const rf = withSize({ ...FONT.label, tracking: 0.08 }, r * 0.118);
    const rt = r * 0.73; // text centreline radius
    const text = ring.toUpperCase();
    const widths = [...text].map((ch) => measure(ch, { ...rf, tracking: 0 }) + rf.tracking * rf.size);
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = (2 * Math.PI * rt) / total; // stretch spacing so the ring closes exactly
    let ang = -Math.PI / 2;
    [...text].forEach((ch, i) => {
      const step = (widths[i] * scale) / rt;
      const mid = ang + step / 2;
      if (ch.trim()) {
        const gx = cx + rt * Math.cos(mid), gy = cy + rt * Math.sin(mid);
        const deg = (mid * 180) / Math.PI + 90;
        s.raw(`<g transform="rotate(${deg.toFixed(2)} ${gx.toFixed(2)} ${gy.toFixed(2)})">`);
        s.text({ x: gx, top: gy - rf.size * 0.6, lines: [ch], font: { ...rf, tracking: 0 }, lh: rf.size * 1.2, fill: ink, anchor: "middle", name: "Stamp ring glyph" });
        s.raw("</g>");
      }
      ang += step;
    });
    /* centre: the count, then the label — the label never drops below
       `minSize` (the format's caption floor); it stacks one word per line when
       it won't fit across the inner disc, and the count shrinks to make room. */
    const lf = withSize({ ...FONT.label, tracking: 0.06 }, Math.max(r * 0.13, minSize));
    const inner = r * 1.08; // usable width/height inside the inner ring
    const words = label.split(/\s+/);
    const labelLines = measure(label, lf) <= inner ? [label] : words;
    const llh = lf.size * 1.12;
    const labelH = labelLines.length * llh;
    const nf = withSize(FONT.claim, Math.min(r * (num.length > 1 ? 0.62 : 0.78), (inner - labelH) / 0.95));
    const nlh = nf.size * 0.95;
    const top = cy - (nlh + labelH) / 2;
    if (num) s.text({ x: cx, top, lines: [num], font: nf, lh: nlh, fill: ink, anchor: "middle", name: "Stamp count" });
    s.text({ x: cx, top: top + nlh, lines: labelLines, font: lf, lh: llh, fill: ink, anchor: "middle", name: "Stamp label" });
  }, { transform: `rotate(${rotate} ${cx.toFixed(2)} ${cy.toFixed(2)})` });
  return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
}

export { SPACE };
