/**
 * Real glyph advance widths, measured once in Chrome and cached.
 *
 * This is what makes SVG-first viable. The sibling tools estimate text width as
 * `length * fontSize * 0.52`, which is off by up to ~8% and forces every layout to
 * carry slack. Slack is why a deck looks under-filled, and an 8% error is far too
 * coarse to assert on — so panel-social-posts can only catch overflow by eye.
 *
 * Here, one Chrome pass measures the advance of every character we might set, per
 * family and weight, at font-size 100 (advances scale linearly, so one table serves
 * every size). Error drops to kerning-pair residue, roughly ±0.5%, which is tight
 * enough for the overflow assertion in lib/slides.mjs to be a hard build gate.
 *
 * The cache lives at .gen/_metrics.json, keyed by the size+mtime of the six woff2
 * files. Delete it or change a font and the next build re-measures.
 *
 * If Chrome is unavailable the module falls back to the siblings' heuristic and says
 * so loudly — the SVG path must keep working with zero packages installed.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { GEN, FONT_DIR, FONT_FACES, fontPath } from "./paths.mjs";

export const CACHE = path.join(GEN, "_metrics.json");
export const REF_SIZE = 100;

/* Everything a deck can set: ASCII plus the punctuation the brand actually uses
   (en/em dashes, the · separator in "Role · Company", curly quotes, ellipsis). */
const ASCII = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i));
const EXTRA = ["–", "—", "·", "•", "’", "‘", "“", "”", "…", "×", "→", "&", "é", "ü", "ö", "ñ", "™", "®", "°"];
export const CHARSET = [...new Set([...ASCII, ...EXTRA])];

/** Heuristic fallback, matching what the siblings use today. Deliberately pessimistic. */
export const FALLBACK_FACTOR = { Inter: 0.52, "IBM Plex Mono": 0.6 };

export const faceKey = (family, weight) => `${family}|${weight}`;

/** Cache identity: if any woff2 changes size or mtime, the table is stale. */
export function fontFingerprint() {
  const h = crypto.createHash("sha256");
  for (const f of FONT_FACES) {
    const p = fontPath(f.file);
    const st = fs.existsSync(p) ? fs.statSync(p) : null;
    h.update(`${f.file}:${st ? `${st.size}:${Math.round(st.mtimeMs)}` : "missing"}\n`);
  }
  return h.digest("hex").slice(0, 16);
}

function fontFaceCss() {
  return FONT_FACES.map((f) => {
    const b64 = fs.readFileSync(fontPath(f.file)).toString("base64");
    return `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};` +
      `font-display:block;src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }).join("\n");
}

/**
 * Measure every face against every character — and every character PAIR — in one page load.
 *
 * The pair pass exists because summing per-glyph advances ignores kerning, and Chrome
 * kerns by default. Measured on real deck copy that error reached 1.5% ("September 17,
 * 2026" came out 8.5px wider than Chrome renders it at 64px), which is three times the
 * budget the overflow gate needs. Storing the per-pair delta closes it to rounding.
 *
 * Only non-zero deltas are stored. Most pairs do not kern, so the table stays small.
 *
 * font-display:block plus an explicit document.fonts.load per face matters: without it
 * measureText silently reports fallback-font advances, which look plausible and are
 * wrong — the worst possible failure for a table everything downstream trusts.
 */
async function measureInChrome() {
  const { launch } = await import("./chromium.mjs");
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${fontFaceCss()}</style><body></body>`);
    return await page.evaluate(
      async ({ faces, chars, size }) => {
        await Promise.all(faces.map((f) => document.fonts.load(`${f.weight} ${size}px "${f.family}"`)));
        await document.fonts.ready;
        const ctx = document.createElement("canvas").getContext("2d");
        const out = {};
        for (const f of faces) {
          ctx.font = `${f.weight} ${size}px "${f.family}"`;
          const adv = {};
          for (const ch of chars) adv[ch] = ctx.measureText(ch).width;

          const kern = {};
          for (const a of chars) {
            for (const b of chars) {
              const d = ctx.measureText(a + b).width - (adv[a] + adv[b]);
              if (Math.abs(d) > 0.01) kern[a + b] = d;
            }
          }
          out[`${f.family}|${f.weight}`] = { adv, kern };
        }
        return out;
      },
      { faces: FONT_FACES.map(({ family, weight }) => ({ family, weight })), chars: CHARSET, size: REF_SIZE }
    );
  } finally {
    await browser.close();
  }
}

function readCache() {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    return c && c.fingerprint && c.faces ? c : null;
  } catch {
    return null;
  }
}

/**
 * Ensure a fresh table exists on disk. Async, so gen.mjs calls it once before spawning
 * the renderers; the renderers then read the cache synchronously.
 *
 * Returns { source, faces, warnings } — never throws. A measurement failure degrades to
 * the heuristic rather than blocking a build that only wants SVGs.
 */
export async function ensureMetrics({ force = false } = {}) {
  const warnings = [];
  const fingerprint = fontFingerprint();

  if (!force) {
    const cached = readCache();
    if (cached && cached.fingerprint === fingerprint) {
      return { source: "cache", faces: cached.faces, warnings };
    }
  }

  if (!fs.existsSync(FONT_DIR)) {
    warnings.push(`font pool missing at ${FONT_DIR} — falling back to estimated text widths`);
    return { source: "fallback", faces: null, warnings };
  }

  try {
    const faces = await measureInChrome();
    fs.mkdirSync(GEN, { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify({ fingerprint, refSize: REF_SIZE, faces }, null, 0));
    return { source: "measured", faces, warnings };
  } catch (err) {
    warnings.push(
      `could not measure fonts in Chrome (${err.message.split("\n")[0]}) — ` +
        "falling back to estimated text widths; layout assertions will be approximate"
    );
    return { source: "fallback", faces: null, warnings };
  }
}

/** Synchronous read for the renderers. Returns null when no usable cache exists. */
export function loadMetricsSync() {
  const c = readCache();
  return c && c.fingerprint === fontFingerprint() ? c.faces : null;
}
