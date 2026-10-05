/**
 * Unit tests for the text engine.
 *
 * The headline test is the accuracy check: it measures ~20 real deck strings against
 * Chrome's own measureText and asserts the delta stays under 1%. That number is what
 * lets lib/slides.mjs treat overflow as a build failure instead of a warning, so if
 * this test ever loosens, the overflow gate has quietly become advisory.
 */

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

import { ensureMetrics } from "../formats/deck/lib/metrics.mjs";
import { launch } from "../formats/deck/lib/chromium.mjs";
import { FONT_FACES, fontPath } from "../formats/deck/lib/paths.mjs";
import fs from "node:fs";
import {
  measure, wrap, balance, wrapFragments, fitDown, hasOrphan,
  baseOffset, resetMetrics, hasRealMetrics, SANS, MONO,
} from "../formats/deck/lib/text.mjs";

/* Strings taken from real OBA panel copy, not lorem — kerning behaviour differs. */
const SAMPLES = [
  "Where Referral Growth", "Actually Comes From",
  "Vice President of Revenue Generation", "Navigate Patient Solutions",
  "Building OD Partnerships That Actually Drive Patient Volume",
  "Where referrals actually originate",
  "Mapping the five real sources before you spend on any of them.",
  "15 years building referral programs for specialty practices",
  "OBA · Expert Panel", "Practice Growth · Referrals",
  "September 17, 2026", "8:00 PM – 9:00 PM ET", "Live Zoom Panel · 60 min",
  "Every attendee leaves with the Referral Audit",
  "$450 value · free for attendees", "oba.academy/referral-audit",
  "Referral Systems", "Co-Management", "Questions", "SCAN TO GET IT",
];

const CASES = [
  { font: SANS, fs: 92, weight: 300, track: -0.02 },
  { font: SANS, fs: 64, weight: 300, track: -0.02 },
  { font: SANS, fs: 34, weight: 500, track: 0 },
  { font: SANS, fs: 22, weight: 400, track: 0 },
  { font: MONO, fs: 16, weight: 500, track: 0.14 },
];

describe("metrics accuracy", () => {
  before(async () => {
    await ensureMetrics();
    resetMetrics();
  });

  test("measure() agrees with Chrome measureText to within 1%", async (t) => {
    if (!hasRealMetrics()) return t.skip("no measured metrics available");

    const css = FONT_FACES.map((f) => {
      const b64 = fs.readFileSync(fontPath(f.file)).toString("base64");
      return `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-display:block;` +
        `src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
    }).join("\n");

    const browser = await launch();
    let truth;
    try {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}</style><body></body>`);
      truth = await page.evaluate(
        async ({ samples, cases, faces }) => {
          await Promise.all(faces.map((f) => document.fonts.load(`${f.weight} 100px "${f.family}"`)));
          await document.fonts.ready;
          const ctx = document.createElement("canvas").getContext("2d");
          const out = [];
          for (const c of cases) {
            ctx.font = `${c.weight} ${c.fs}px "${c.font}"`;
            for (const s of samples) {
              // Canvas ignores letter-spacing, so add it the same way CSS/SVG do.
              out.push({ s, c, w: ctx.measureText(s).width + c.track * c.fs * [...s].length });
            }
          }
          return out;
        },
        { samples: SAMPLES, cases: CASES, faces: FONT_FACES.map(({ family, weight }) => ({ family, weight })) }
      );
    } finally {
      await browser.close();
    }

    let worst = { delta: 0 };
    for (const { s, c, w } of truth) {
      const mine = measure(s, c);
      const delta = Math.abs(mine - w) / w;
      if (delta > worst.delta) worst = { delta, s, c, mine, w };
    }
    assert.ok(
      worst.delta < 0.01,
      `worst delta ${(worst.delta * 100).toFixed(2)}% on ${JSON.stringify(worst.s)} ` +
        `at ${worst.c?.fs}px — measured ${worst.mine?.toFixed(1)} vs Chrome ${worst.w?.toFixed(1)}`
    );
    console.log(`      max delta vs Chrome: ${(worst.delta * 100).toFixed(3)}%`);
  });

  test("falls back to the heuristic when no table is loaded", () => {
    resetMetrics(null);
    assert.equal(hasRealMetrics(), false);
    assert.ok(measure("hello", { font: SANS, fs: 100 }) > 0);
    resetMetrics();
  });
});

describe("wrapping", () => {
  const spec = { font: SANS, fs: 22, weight: 400 };

  test("short text stays on one line", () => {
    assert.equal(wrap("Questions", 800, spec).length, 1);
  });

  test("wraps to more lines as the measure narrows", () => {
    const long = SAMPLES[6];
    assert.ok(wrap(long, 900, spec).length < wrap(long, 300, spec).length);
  });

  test("every wrapped line fits the measure", () => {
    for (const line of wrap(SAMPLES[4], 420, spec)) {
      assert.ok(measure(line, spec) <= 420, `overflowing line: ${line}`);
    }
  });

  test("a word longer than the measure gets its own line, not an infinite loop", () => {
    const lines = wrap("supercalifragilistic short", 40, spec);
    assert.equal(lines.length, 2);
  });
});

describe("balance", () => {
  const spec = { font: SANS, fs: 64, weight: 300, track: -0.02 };

  test("keeps the line count and shortens the longest line", () => {
    const text = "Building OD Partnerships That Actually Drive Patient Volume";
    const greedy = wrap(text, 1100, spec);
    const even = balance(text, 1100, spec);
    assert.equal(even.length, greedy.length);
    const longest = (ls) => Math.max(...ls.map((l) => measure(l, spec)));
    assert.ok(longest(even) <= longest(greedy) + 0.5);
  });

  test("fixes a known orphan", () => {
    const text = "Where Referral Growth Actually Comes From Today";
    const w = measure(text, spec) * 0.56; // width tuned to strand the last word
    const greedy = wrap(text, w, spec);
    if (hasOrphan(greedy, w, spec)) {
      assert.equal(hasOrphan(balance(text, w, spec), w, spec), false);
    }
  });

  test("leaves a single-line block alone", () => {
    assert.deepEqual(balance("Questions", 1200, spec), ["Questions"]);
  });
});

describe("wrapFragments", () => {
  const spec = { font: SANS, fs: 92, weight: 300, track: -0.02 };

  test("preserves the dim flag across wrapped lines", () => {
    // Both fragments wrap at this measure, so the flag has to survive per fragment —
    // "everything after line 0 is dim" would be the wrong assertion.
    const frags = [
      { text: "Where Referral Growth", dim: false },
      { text: "Actually Comes From, and what to do about it in the next quarter", dim: true },
    ];
    const lines = wrapFragments(frags, 900, spec);
    assert.ok(lines.length > 2, "both fragments should wrap");

    const bright = lines.filter((l) => !l.dim).map((l) => l.text).join(" ");
    const dim = lines.filter((l) => l.dim).map((l) => l.text).join(" ");
    assert.equal(bright, frags[0].text);
    assert.equal(dim, frags[1].text);
    // and the two tones stay contiguous — no interleaving
    assert.equal(lines.findIndex((l) => l.dim), lines.filter((l) => !l.dim).length);
  });

  test("accepts bare strings as non-dim", () => {
    assert.equal(wrapFragments(["Plain"], 900, spec)[0].dim, false);
  });
});

describe("fitDown", () => {
  const big = { font: SANS, fs: 64, weight: 300 };
  const small = { font: SANS, fs: 56, weight: 300 };

  test("keeps the first size when it already fits", () => {
    const r = fitDown("Chris Bonsall", 1000, [big, small], { maxLines: 1 });
    assert.equal(r.spec.fs, 64);
    assert.equal(r.overflow, false);
  });

  test("steps down rather than overflowing", () => {
    const text = "Vice President of Revenue Generation";
    const r = fitDown(text, measure(text, small) + 2, [big, small], { maxLines: 1 });
    assert.equal(r.spec.fs, 56);
    assert.equal(r.overflow, false);
  });

  test("reports overflow instead of clipping when nothing fits", () => {
    const r = fitDown(SAMPLES[4], 120, [big, small], { maxLines: 1 });
    assert.equal(r.overflow, true);
    assert.ok(r.lines.length > 1);
  });
});

describe("baselines", () => {
  test("baseline sits inside the line box", () => {
    const off = baseOffset(SANS, 64, 64 * 1.08);
    assert.ok(off > 0 && off < 64 * 1.08);
  });

  test("a tighter line-height raises the baseline", () => {
    assert.ok(baseOffset(SANS, 64, 64 * 1.0) < baseOffset(SANS, 64, 64 * 1.4));
  });
});
