/**
 * Text measurement, wrapping, balancing and baseline math.
 *
 * Everything here is pure and synchronous: it reads the advance table that
 * lib/metrics.mjs cached, so layout code can measure without awaiting anything.
 *
 * Two things are worth knowing before changing this file:
 *
 * 1. SVG positions text by BASELINE; CSS positions it by line box. baseOffset()
 *    converts between them. Get it wrong and every block sits a few px high or low
 *    in a way that looks like a spacing bug rather than a baseline bug.
 *
 * 2. wrap() is greedy, which is what browsers do by default — but greedy wrapping
 *    strands short last lines ("orphans"), and an orphan under a 64px headline is
 *    the single most obvious "this was generated" tell. balance() fixes that the way
 *    Chrome's text-wrap:balance does, by narrowing the measure until just before the
 *    line count would increase.
 */

import { loadMetricsSync, FALLBACK_FACTOR, REF_SIZE, faceKey } from "./metrics.mjs";

export const SANS = "Inter";
export const MONO = "IBM Plex Mono";

/* Ascent/descent as a fraction of font-size, carried over from the siblings. Used
   only to place a baseline inside a line box — not for wrapping. */
export const FONT_METRICS = {
  // cap = capHeight / unitsPerEm from the font files (Inter 1490/2048, Plex Mono 698/1000).
  [SANS]: { asc: 0.97, desc: 0.24, cap: 0.7275 },
  [MONO]: { asc: 1.03, desc: 0.28, cap: 0.698 },
};

let TABLE = null;
let TABLE_LOADED = false;

function table() {
  if (!TABLE_LOADED) {
    TABLE = loadMetricsSync();
    TABLE_LOADED = true;
  }
  return TABLE;
}

/** Test seam and cache reset — also lets gen.mjs re-read after a fresh measurement. */
export function resetMetrics(faces = undefined) {
  TABLE = faces === undefined ? null : faces;
  TABLE_LOADED = faces !== undefined;
}

export const hasRealMetrics = () => table() !== null;

/** The weights actually available in the pool; anything else snaps to the nearest. */
const AVAILABLE = { [SANS]: [300, 400, 500, 600], [MONO]: [500, 600] };

function nearestWeight(font, weight) {
  const ws = AVAILABLE[font] || [400];
  return ws.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), ws[0]);
}

/**
 * Advance width of a string, in px.
 *
 * `track` is letter-spacing in em, applied after every character exactly as CSS and
 * SVG do — so a 0.14em mono label measures ~14% wider than its glyphs alone, which is
 * a big enough effect that ignoring it overflows every eyebrow on the deck.
 */
export function measure(text, { font = SANS, fs = 16, weight = 400, track = 0 } = {}) {
  const s = String(text ?? "");
  if (!s) return 0;
  const spacing = track * fs * s.length;

  const faces = table();
  if (!faces) {
    const factor = FALLBACK_FACTOR[font] ?? 0.52;
    return s.length * fs * factor + spacing;
  }

  const face = faces[faceKey(font, nearestWeight(font, weight))];
  if (!face) return s.length * fs * (FALLBACK_FACTOR[font] ?? 0.52) + spacing;

  const { adv, kern } = face;
  const scale = fs / REF_SIZE;
  const chars = [...s];
  let w = 0;
  for (let i = 0; i < chars.length; i++) {
    w += adv[chars[i]] ?? adv["n"] ?? REF_SIZE * 0.5;
    // Kerning is applied by the renderer, so ignoring it overstates every string.
    if (i > 0) w += kern[chars[i - 1] + chars[i]] ?? 0;
  }
  return w * scale + spacing;
}

/** Baseline y for line `i` of a block whose box starts at `top`. */
export function baseOffset(font, fs, lineH) {
  const m = FONT_METRICS[font] || FONT_METRICS[SANS];
  return (lineH - (m.asc + m.desc) * fs) / 2 + m.asc * fs;
}

export const lineY = (top, i, lineH, font, fs) => top + i * lineH + baseOffset(font, fs, lineH);

/**
 * Distance from a line box's top to the cap line of its glyphs.
 *
 * A line box carries half-leading above the letters, so aligning a headline to a photo
 * edge by its box top leaves the caps visibly lower than the edge. Subtract this from
 * the target y to put the caps on it. Uses the unrounded line-height, like draw.text().
 */
export function capTop(spec, lineH = spec.fs * spec.lh) {
  const m = FONT_METRICS[spec.font] || FONT_METRICS[SANS];
  return baseOffset(spec.font, spec.fs, lineH) - m.cap * spec.fs;
}

/** Greedy wrap. A word longer than the measure gets its own line rather than looping. */
export function wrap(text, maxW, spec = {}) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (measure(test, spec) <= maxW || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Wrap, then even out the line lengths — Chrome's text-wrap:balance, reimplemented.
 *
 * Narrow the measure step by step; the last width that still produces the same number
 * of lines is the balanced one. Only applied to short blocks (headlines), because on
 * long body copy balancing is imperceptible and the search is wasted work.
 */
export function balance(text, maxW, spec = {}, { maxLines = 4, steps = 24 } = {}) {
  const base = wrap(text, maxW, spec);
  if (base.length < 2 || base.length > maxLines) return base;

  let best = base;
  for (let i = 1; i <= steps; i++) {
    const w = maxW * (1 - (i / steps) * 0.45);
    const candidate = wrap(text, w, spec);
    if (candidate.length !== base.length) break;
    best = candidate;
  }
  return best;
}

/** True when the last line is a stranded fragment of the measure. */
export function hasOrphan(lines, maxW, spec = {}, threshold = 0.35) {
  if (lines.length < 2) return false;
  return measure(lines[lines.length - 1], spec) < maxW * threshold;
}

/**
 * Wrap a two-tone headline.
 *
 * Fragments are `{ text, dim }`; a "~" prefix in the TOML sets dim. Each fragment is an
 * explicit line break (that is how the siblings' headlines are authored), but a
 * fragment too long for the measure still wraps, and every resulting line keeps its
 * fragment's `dim` flag so the second tone survives wrapping.
 */
export function wrapFragments(frags, maxW, spec = {}, { balanced = true } = {}) {
  const out = [];
  for (const frag of frags || []) {
    const text = typeof frag === "string" ? frag : frag.text;
    const dim = typeof frag === "string" ? false : !!frag.dim;
    const lines = balanced ? balance(text, maxW, spec) : wrap(text, maxW, spec);
    for (const line of lines.length ? lines : [""]) out.push({ text: line, dim });
  }
  return out;
}

/**
 * Step down through size tokens until the text fits in `maxLines`.
 *
 * Returns the chosen spec, its lines, and whether it still overflows — the caller
 * decides whether that is a warning or a build failure. Never silently clips.
 */
export function fitDown(text, maxW, specs, { maxLines = 2, balanced = false } = {}) {
  const list = Array.isArray(specs) ? specs : [specs];
  let last = null;
  for (const spec of list) {
    const lines = balanced ? balance(text, maxW, spec) : wrap(text, maxW, spec);
    last = { spec, lines, overflow: lines.length > maxLines };
    if (!last.overflow) return last;
  }
  return last;
}

/**
 * Clip a wrapped block to `maxLines`, ellipsising the last line.
 *
 * Used where the content is genuinely secondary and a hard failure would be worse than
 * a visible trim — a job title under a cover thumbnail, say, where the spotlight slide
 * carries the full version anyway. Everywhere else, overflow stays an error: silent
 * truncation of primary content is exactly the failure this tool exists to prevent.
 */
export function truncateLines(lines, maxLines, maxW, spec = {}) {
  if (lines.length <= maxLines) return { lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  const words = last.split(" ");
  while (words.length > 1 && measure(`${words.join(" ")}…`, spec) > maxW) words.pop();
  kept[maxLines - 1] = `${words.join(" ")}…`;
  return { lines: kept, truncated: true };
}

/** Height of a wrapped block, for band-fitting checks. */
export const blockHeight = (lineCount, lineH) => Math.max(0, lineCount) * lineH;
