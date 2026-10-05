/**
 * Text measurement + wrapping from real glyph advances (lib/iu/widths.json,
 * measured in Chrome by scripts/build-widths.mjs).
 *
 * A font spec is { role, weight, style, size, tracking(em), upper }.
 * Because the PNG is Chrome rasterising the SVG this layout emits, the line
 * breaks chosen here are exactly the ones in both outputs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { variantKey } from "./fonts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDTHS = JSON.parse(fs.readFileSync(path.join(__dirname, "widths.json"), "utf8"));

/* Vertical metrics (fraction of font size), used to place baselines. */
export const METRICS = {
  display: { asc: 0.969, desc: 0.242, cap: 0.727 },
  sans: { asc: 0.969, desc: 0.242, cap: 0.727 },
  serif: { asc: 0.94, desc: 0.29, cap: 0.65 },
};

export function shown(text, font) {
  const s = String(text ?? "");
  return font.upper ? s.toUpperCase() : s;
}

/** Width in px of `text` set in `font` (tracking included between glyphs). */
export function measure(text, font) {
  const s = shown(text, font);
  const table = WIDTHS[variantKey(font)] || WIDTHS["sans-500"];
  let em = 0;
  for (const ch of s) em += table[ch] ?? table["n"] ?? 0.55;
  const track = (font.tracking || 0) * font.size * Math.max(0, [...s].length - 1);
  return em * font.size + track;
}

/** Greedy word wrap. Returns an array of lines (strings, original case). */
export function wrap(text, maxW, font) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (!line || measure(test, font) <= maxW) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Baseline offset from the top of a line box of height `lh` px. */
export function baseline(font, lh) {
  const m = METRICS[font.role] || METRICS.sans;
  return (lh - (m.asc + m.desc) * font.size) / 2 + m.asc * font.size;
}

/** Largest size in [min,max] (step 2) at which `text` fits `maxLines` lines of `maxW`. */
export function fitSize(text, maxW, font, { min, max, maxLines = 2 }) {
  for (let size = max; size >= min; size -= 2) {
    const f = { ...font, size };
    if (wrap(text, maxW, f).length <= maxLines) return size;
  }
  return min;
}

export function withSize(font, size) {
  return { ...font, size };
}
