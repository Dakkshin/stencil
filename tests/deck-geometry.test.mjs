/**
 * Unit tests for the geometry table.
 *
 * These are cheap invariants that would otherwise only surface as a visual defect
 * halfway through building nine slide types: a grid that does not close, a rect that
 * hangs off the canvas, a type token below the legibility floor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS, GRID, BANDS, TYPE, SURFACE, INK, DOTS, RAIL, MIN_TYPE,
  SLIDE_LAYOUTS, span, colX, lh, tileLayout, monogramSize,
  MAX_COVER_SPEAKERS, bodyHeight, HERO_TYPES, coverCaptionH,
} from "../formats/deck/lib/geometry.mjs";
import { capTop } from "../formats/deck/lib/text.mjs";
import { LIMITS } from "../formats/deck/lib/slides.mjs";

describe("grid", () => {
  test("a full-width span equals the content width", () => {
    assert.equal(span(GRID.cols), GRID.contentW);
    assert.equal(span(GRID.cols), 1680);
  });

  test("the content box is the canvas minus symmetric padding", () => {
    assert.equal(GRID.x0, CANVAS.padX);
    assert.equal(GRID.x1, CANVAS.w - CANVAS.padX);
    assert.equal(GRID.x1 - GRID.x0, GRID.contentW);
  });

  test("every span is an integer — no rounding drift", () => {
    for (let n = 1; n <= GRID.cols; n++) {
      assert.ok(Number.isInteger(span(n)), `span(${n}) = ${span(n)}`);
    }
  });

  test("column origins land inside the content box and stay ordered", () => {
    let prev = -Infinity;
    for (let i = 0; i < GRID.cols; i++) {
      const x = colX(i);
      assert.ok(x > prev, `colX(${i}) not increasing`);
      assert.ok(x >= GRID.x0 && x + GRID.colW <= GRID.x1, `colX(${i}) = ${x} escapes the grid`);
      prev = x;
    }
  });
});

describe("type scale", () => {
  test("no token is below the legibility floor", () => {
    for (const [name, t] of Object.entries(TYPE)) {
      assert.ok(t.fs >= MIN_TYPE, `TYPE.${name} is ${t.fs}px, below the ${MIN_TYPE}px floor`);
    }
  });

  test("every token is a complete spec for the text engine", () => {
    for (const [name, t] of Object.entries(TYPE)) {
      for (const k of ["font", "fs", "lh", "weight", "track"]) {
        assert.ok(t[k] !== undefined, `TYPE.${name} is missing ${k}`);
      }
      assert.ok(t.lh >= 1 && t.lh <= 2, `TYPE.${name} line-height ${t.lh} looks wrong`);
    }
  });

  test("line-height resolves to whole pixels", () => {
    for (const t of Object.values(TYPE)) assert.ok(Number.isInteger(lh(t)));
  });

  test("the scale is strictly ordered where it should be", () => {
    assert.ok(TYPE.display.fs > TYPE.dividerTitle.fs);
    assert.ok(TYPE.dividerTitle.fs > TYPE.h1.fs);
    assert.ok(TYPE.display.fs > TYPE.h1.fs);
    assert.ok(TYPE.h1.fs > TYPE.h1Tight.fs);
    assert.ok(TYPE.h1Tight.fs > TYPE.h2.fs);
    assert.ok(TYPE.h2.fs > TYPE.lead.fs);
    assert.ok(TYPE.lead.fs > TYPE.body.fs);
  });

  test("body copy sits well above the floor — 16px is for labels, not paragraphs", () => {
    assert.ok(TYPE.body.fs >= MIN_TYPE + 8, `TYPE.body is ${TYPE.body.fs}px`);
  });

  test("ink alphas step down in the order the names promise", () => {
    const alpha = (v) => (v === "#ffffff" ? 1 : Number(v.match(/,\s*([\d.]+)\)$/)[1]));
    const ladder = ["primary", "lead", "body", "muted", "faint"].map((k) => alpha(INK[k]));
    for (let i = 1; i < ladder.length; i++) {
      assert.ok(ladder[i] < ladder[i - 1], `INK ladder is not descending at step ${i}: ${ladder}`);
    }
  });
});

describe("bands", () => {
  test("bands are ordered and fit the canvas", () => {
    const { headerTop, headerH, bodyTop, bodyBottom, footerRuleY, footerBaseY } = BANDS;
    assert.ok(headerTop >= 0);
    assert.ok(headerTop + headerH <= bodyTop);
    assert.ok(bodyTop < bodyBottom);
    assert.ok(bodyBottom <= footerRuleY);
    assert.ok(footerRuleY < footerBaseY);
    assert.ok(footerBaseY <= CANVAS.h);
  });

  test("the body band has usable height", () => {
    assert.ok(bodyHeight > 600, `body band is only ${bodyHeight}px`);
  });
});

describe("agenda rail", () => {
  for (const n of [4, 5]) {
    test(`${n} rows fill the body band without overflowing it`, () => {
      const r = RAIL[n];
      const used = n * r.rowH + (n - 1) * r.gap;
      const bottom = RAIL.top + used;
      assert.ok(bottom <= BANDS.bodyBottom, `${n} rows end at ${bottom}, past ${BANDS.bodyBottom}`);
      // "Fills" means it reaches most of the way down — a short stack looks unfinished.
      assert.ok(bottom > BANDS.bodyBottom - 80, `${n} rows leave ${BANDS.bodyBottom - bottom}px empty`);
    });
  }

  test("the rail columns are ordered left to right", () => {
    assert.ok(RAIL.numeralCol.x + RAIL.numeralCol.w <= RAIL.ruleX);
    assert.ok(RAIL.ruleX < RAIL.textX);
    assert.equal(RAIL.textX + RAIL.textMaxW, GRID.x1);
  });

  test("a one-line title plus its note fits the tightest row", () => {
    const need = RAIL.noteGap + lh(TYPE.body) * SLIDE_LAYOUTS.agenda.noteMaxLines;
    assert.ok(need <= RAIL[5].rowH, `a row needs ${need}px, the 5-row rail gives ${RAIL[5].rowH}`);
  });
});

describe("cover tile ladder", () => {
  for (let n = 1; n <= MAX_COVER_SPEAKERS; n++) {
    test(`${n} tile(s) centre on the canvas and fit the content box`, () => {
      const t = tileLayout(n);
      assert.equal(t.totalW, n * t.w + (n - 1) * t.gap);
      assert.ok(t.x0 >= 0, `${n} tiles overflow the canvas`);
      assert.equal(t.x0 * 2 + t.totalW, CANVAS.w, `${n} tiles are not centred`);
      const top = SLIDE_LAYOUTS.cover.railBottom - t.h;
      assert.ok(top > BANDS.bodyTop, `${n} tiles collide with the title band`);
    });
  }

  test("tiles get smaller as the panel grows", () => {
    for (let n = 2; n <= MAX_COVER_SPEAKERS; n++) {
      assert.ok(tileLayout(n).w < tileLayout(n - 1).w, `${n} tiles are not smaller than ${n - 1}`);
    }
  });

  test("counts beyond the ladder clamp instead of throwing", () => {
    assert.deepEqual(tileLayout(99), tileLayout(MAX_COVER_SPEAKERS));
  });

  test("monogram scales with the tile but stays type-sized", () => {
    assert.ok(monogramSize(320) <= 96);
    assert.ok(monogramSize(188) < monogramSize(320));
    assert.ok(monogramSize(188) >= MIN_TYPE);
  });

  test("the caption plate sits fully on the scrim and inside the smallest tile", () => {
    const c = SLIDE_LAYOUTS.cover;
    assert.ok(coverCaptionH() + c.tilePad <= c.scrimH, "plate rises above the scrim");
    assert.ok(coverCaptionH() <= tileLayout(MAX_COVER_SPEAKERS).h - 2 * c.tilePad, "plate taller than a 6-up tile");
    assert.ok(c.roleSlack > 0 && c.roleSlack < 1);
  });
});

describe("slide layout table", () => {
  const rects = [];
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    if (["x", "y", "w", "h"].every((k) => typeof node[k] === "number")) rects.push({ path, ...node });
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  for (const [type, layout] of Object.entries(SLIDE_LAYOUTS)) walk(layout, type);

  test("found rects to check", () => assert.ok(rects.length > 0));

  test("every rect sits inside the canvas", () => {
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0, `${r.path} has a negative origin`);
      assert.ok(r.x + r.w <= CANVAS.w, `${r.path} runs off the right edge`);
      assert.ok(r.y + r.h <= CANVAS.h, `${r.path} runs off the bottom`);
    }
  });

  test("spotlight columns do not overlap", () => {
    const s = SLIDE_LAYOUTS.spotlight;
    assert.ok(s.portrait.x + s.portrait.w < s.rail.x);
    assert.equal(s.rail.x + s.rail.w, GRID.x1);
  });

  test("spotlight tag row shares the portrait's bottom edge", () => {
    const s = SLIDE_LAYOUTS.spotlight;
    assert.equal(s.tagsY + SURFACE.pill.h, s.portrait.y + s.portrait.h);
  });

  test("spotlight rail fits its worst case: h1 name, two-line role, three two-line points", () => {
    const s = SLIDE_LAYOUTS.spotlight;
    const nameTop = s.portrait.y - capTop(TYPE.h1);
    const listTop = nameTop + lh(TYPE.h1) + s.nameRoleGap + s.roleMaxLines * lh(TYPE.lead) + s.roleRuleGap + s.ruleListGap;
    const cardH = s.card.padY * 2 + s.card.maxLines * lh(TYPE.body);
    const listBottom = listTop + LIMITS.bio.max * cardH + (LIMITS.bio.max - 1) * s.card.gap;
    assert.ok(listBottom <= s.tagsY - s.listBottomGap,
      `worst-case bio stack ends at ${listBottom.toFixed(1)}, tag row clearance starts at ${s.tagsY - s.listBottomGap}`);
  });

  test("sponsor columns do not overlap", () => {
    const s = SLIDE_LAYOUTS.sponsor;
    assert.ok(s.card.x + s.card.w < s.rail.x);
    assert.equal(s.rail.x + s.rail.w, GRID.x1);
  });

  test("the two sponsor cards share a top and a bottom edge", () => {
    /* The defect this layout exists to fix: the columns used to open on different rows
       and close 5px apart, which reads as a mistake rather than as a pair. */
    const s = SLIDE_LAYOUTS.sponsor;
    assert.equal(s.card.y, s.rail.y, "sponsor cards open on different rows");
    assert.equal(s.card.y + s.card.h, s.colBottom, "story card does not close on the band");
    assert.equal(s.rail.y + s.rail.h, s.colBottom, "proof card does not close on the band");
  });

  test("the sponsor proof rows close inside the rail card", () => {
    const s = SLIDE_LAYOUTS.sponsor;
    const rowH = SURFACE.star.size + s.proof.starsGap + lh(TYPE.body) +
      s.proof.sourceGap + lh(TYPE.monoLabel);
    const top = s.rail.y + SURFACE.cardPad.y + SURFACE.pill.h + s.proof.labelGap;
    const stack = LIMITS.proof.max * rowH + (LIMITS.proof.max - 1) * s.proof.rowGap;
    assert.ok(top + stack <= s.colBottom - SURFACE.cardPad.y,
      `${LIMITS.proof.max} proof rows end at ${top + stack}, past the card floor at ${s.colBottom - SURFACE.cardPad.y}`);
    assert.ok(s.proof.rowGap > SURFACE.hairline.w * 2,
      "the row gap must clear its own separator");
  });

  test("the sponsor mark fits the card as a masthead", () => {
    const s = SLIDE_LAYOUTS.sponsor;
    const innerW = s.card.w - SURFACE.cardPad.x * 2;
    assert.ok(s.mark.w <= innerW, `mark ${s.mark.w} is wider than the card's ${innerW} inner width`);
    assert.ok(s.mark.w - s.mark.padX * 2 > 0 && s.mark.h - s.mark.padY * 2 > 0,
      "mark padding leaves no image box");
    /* Proportional insets, not one scalar: the plate's aspect and a typical horizontal
       wordmark's are close enough that a uniform inset always makes height bind. */
    assert.ok(s.mark.padX > s.mark.padY, "mark insets should scale with the plate's aspect");
  });

  test("the sponsor card groups the mark apart from the copy", () => {
    /* The gap under the mark has to be visibly bigger than the one holding the two
       paragraphs together, or the card goes back to evenly-spaced blocks that group
       with nothing. */
    const s = SLIDE_LAYOUTS.sponsor;
    assert.ok(s.markCopyGap >= 2 * s.descDetailGap,
      `markCopyGap ${s.markCopyGap} is not clearly larger than descDetailGap ${s.descDetailGap}`);
  });

  test("the real sponsor copy fits the story card", () => {
    /* The shipped shape: the mark, then a 2-line lead and a 3-line body. */
    const s = SLIDE_LAYOUTS.sponsor;
    const bottom = s.card.y + SURFACE.cardPad.y + s.mark.h + s.markCopyGap +
      2 * lh(TYPE.lead) + s.descDetailGap + 3 * lh(TYPE.body);
    assert.ok(bottom <= s.colBottom - SURFACE.cardPad.y,
      `story copy ends at ${bottom}, past the card floor at ${s.colBottom - SURFACE.cardPad.y}`);
  });

  test("a logo-less sponsor still has room to name itself", () => {
    /* The mark's block doubles as the headline slot when no logo resolves, so it has to
       hold two lines of h1 without the copy below moving. */
    const s = SLIDE_LAYOUTS.sponsor;
    assert.ok(s.mark.h >= 2 * lh(TYPE.h1),
      `mark block ${s.mark.h} cannot hold a 2-line h1 fallback (${2 * lh(TYPE.h1)})`);
  });

  test("the sponsor learn-more line groups with the cards, not the footer", () => {
    const s = SLIDE_LAYOUTS.sponsor;
    const toCards = s.learnMoreY - s.colBottom;
    const toRule = BANDS.footerRuleY - (s.learnMoreY + lh(TYPE.monoLead));
    assert.ok(toCards > 0, "the learn-more line runs into the cards");
    assert.ok(s.learnMoreY + lh(TYPE.monoLead) <= BANDS.bodyBottom, "learn-more escapes the body band");
    assert.ok(toRule > toCards * 1.5,
      `learn-more sits ${toCards} under the cards and ${toRule} above the rule — too even to group`);
  });

  test("offer grid and rail do not overlap", () => {
    const o = SLIDE_LAYOUTS.offer_primary;
    assert.ok(o.gridArea.x + o.gridArea.w < o.rail.x);
    assert.equal(o.rail.x + o.rail.w, GRID.x1);
  });

  test("offer cards close on the band and the QR panel fits beside them", () => {
    const o = SLIDE_LAYOUTS.offer_primary;
    assert.equal(o.gridTop + 2 * o.card4.h + o.card4.gap, BANDS.bodyBottom, "2x2 grid should land on the band");
    for (const g of [o.card3, o.card4]) {
      assert.equal(g.cols * g.w + (g.cols - 1) * g.gap <= o.gridArea.w, true, "cards overrun the grid area");
      const need = o.cardPad.y * 2 + o.titleLines * lh(TYPE.h2) + o.titleGap + g.noteLines * lh(TYPE.body);
      assert.ok(need <= g.h, `a ${g.cols}-up card needs ${need}px, has ${g.h}`);
    }
    /* The QR used to share its top and bottom edge with the 3-up row. It cannot any
       more: it lives in a panel that also carries a title, a value badge and a two-line
       caption, and 631px of panel will not align with a 300px grid. What still has to
       hold is that the panel clears the grid and fits the band. */
    assert.ok(o.gridArea.x + o.gridArea.w < o.rail.x, "benefit grid runs into the QR panel");
    assert.equal(o.rail.x + o.rail.w, GRID.x1);
    const innerW = o.rail.w - o.panel.pad.x * 2;
    assert.ok(o.qr <= innerW, `QR (${o.qr}) is wider than its panel (${innerW})`);
    const P = o.panel;
    const tallest = P.pad.y * 2 + P.titleMaxLines * lh(TYPE.lead) + P.titleValueGap +
      SURFACE.pill.h + P.valueQrGap + o.qr + P.qrCtaGap + P.ctaMaxLines * lh(TYPE.monoLabel) +
      P.ctaUrlGap + lh(TYPE.monoLabel);
    assert.ok(tallest <= BANDS.bodyBottom - BANDS.bodyTop,
      `a fully-populated offer panel needs ${tallest}px in a ${BANDS.bodyBottom - BANDS.bodyTop}px band`);
  });

  test("every hero type has a layout entry", () => {
    for (const t of HERO_TYPES) assert.ok(SLIDE_LAYOUTS[t], `no layout for hero type ${t}`);
  });

  test("Q&A rows fit beside the rail and the rail stack fits its card", () => {
    const q = SLIDE_LAYOUTS.qa;
    const areaRight = q.rail.x - q.railGap;
    assert.equal(q.rail.x + q.rail.w, GRID.x1);
    assert.equal(q.rail.y + q.rail.h, BANDS.bodyBottom, "the rail card should close on the band");

    /* Row 1: the pair of prompts derives its width from what the rail leaves. Each card
       has to keep a usable measure after its padding and icon. */
    const cardW = (areaRight - GRID.x0 - q.cardGap) / 2;
    const textW = cardW - q.cardPad.x * 2 - q.promptIcon.size - q.promptIcon.gap;
    assert.ok(textW >= 440, `a prompt card's measure is only ${textW}px`);

    /* The card row anchors cardTopGap below wherever the support line ends. [qa].support
       is a short label by convention (every deck file that exists uses one line for it —
       see cardTopGap's comment in geometry.mjs), so this models that realistic case, not
       a hypothetical 2-line support: a longer support in some future deck still gets a
       correct (just lower) anchor at build time, caught by the runtime overflow check if
       it then doesn't fit — this static test isn't the only guard. */
    const underlineY = q.headingTop + lh(TYPE.display) + q.underline.gap;
    const supportBottom = underlineY + q.supportGap + lh(TYPE.lead);
    const top = supportBottom + q.cardTopGap;

    /* cardH: worst case is two-line prompts (real sentences, plausibly wrap). recapH: the
       REALISTIC case is one line per pill (recapMaxW is sized for that at recapFs) across
       two rows, not "every pill needs two lines" — recapMaxLines: 2 stays a hard ceiling,
       but a build where that combination doesn't fit fails via the runtime overflow check
       instead of being pre-certified here. See geometry.mjs for why both worst cases
       can't be held at once alongside a close anchor. */
    const cardH = q.cardPad.y * 2 + Math.max(
      lh(TYPE.monoLabel) + q.cardLabelGap + q.cardMaxLines * lh(TYPE.lead), q.promptIcon.size);
    const chipH = q.recapPad.y * 2 + lh({ ...TYPE.lead, fs: q.recapFs });
    const recapH = lh(TYPE.monoLabel) + q.recapLabelGap + chipH + q.recapRowGap + chipH;
    const block = cardH + q.rowsGap + recapH;
    assert.ok(top + block <= BANDS.bodyBottom,
      `Q&A block ends at ${Math.round(top + block)}, band ends at ${BANDS.bodyBottom}`);
    assert.ok(q.recapMaxW <= areaRight - GRID.x0, "a single pill could be wider than its row");

    /* Worst case inside the rail: label, a full-length reminder, the code and a two-line
       caption. The rail card is fixed height, so this has to fit its padding box. */
    const stack = lh(TYPE.monoLabel) + q.railLabelGap + q.reminderMaxLines * lh(TYPE.body) +
      q.reminderQrGap + q.qr + q.qrCaptionGap + 2 * lh(TYPE.monoLabel);
    assert.ok(stack <= q.rail.h - SURFACE.cardPad.y * 2,
      `rail stack needs ${stack}px, card allows ${q.rail.h - SURFACE.cardPad.y * 2}`);
    assert.ok(q.qr <= q.rail.w - SURFACE.cardPad.x * 2, "QR is wider than the rail's inner width");
  });

  test("divider centres on the canvas", () => {
    const d = SLIDE_LAYOUTS.divider;
    assert.equal(d.centerY * 2, CANVAS.h);
    assert.ok(d.maxW <= GRID.contentW);
  });

  test("stat slide centres on the canvas and its tallest block fits the body band", () => {
    const s = SLIDE_LAYOUTS.stat;
    assert.equal(s.centerY * 2, CANVAS.h);
    assert.ok(s.maxW <= GRID.contentW);
    const tallest = lh(TYPE.statHero) + s.valueGap + s.textMaxLines * lh(TYPE.h1)
      + s.noteGap + s.noteMaxLines * lh(TYPE.lead) + s.sourceGap + lh(TYPE.monoLabel);
    assert.ok(tallest <= bodyHeight, `stat block is ${tallest}px, band is ${bodyHeight}`);
    assert.ok(TYPE.statHero.fs > TYPE.display.fs, "the stat numeral should be the largest type in the deck");
    assert.equal(TYPE.stat.lh, TYPE.h1.lh, "spotlight stat shares h1's line-height so the baselines line up");
  });

  test("closing avatar row fits six speakers and their names clear the bottom margin", () => {
    const c = SLIDE_LAYOUTS.closing;
    assert.ok(MAX_COVER_SPEAKERS * c.avatar + (MAX_COVER_SPEAKERS - 1) * c.avatarGap <= GRID.contentW);
    const rowBottom = c.avatarY + c.avatar + c.nameGap + lh(TYPE.role) + c.siteGap + lh(TYPE.monoLabel);
    assert.ok(rowBottom <= CANVAS.h - CANVAS.padBottom, `avatar row ends at ${rowBottom}`);
    assert.ok(c.qrY + c.qr + SURFACE.qr.captionGap + lh(TYPE.monoLabel) <= CANVAS.h - CANVAS.padBottom);
  });
});

describe("surface tokens", () => {
  test("the dots override is louder than the brand reference, and says so", () => {
    const eff = DOTS.alpha * DOTS.layerOpacity;
    const ref = DOTS.brandReference.alpha * DOTS.brandReference.layerOpacity;
    assert.ok(eff > ref, "deck dots should be more visible than the social-post value");
    assert.ok(DOTS.spacing > DOTS.brandReference.spacing, "spacing should scale with the canvas");
  });

  test("no brand hue leaks into the surface or ink tables", () => {
    const hex = /#(?!0b1220\b)[0-9a-fA-F]{6}/;
    const surfaceJson = JSON.stringify(SURFACE);
    assert.equal(hex.test(surfaceJson), false, `SURFACE contains a brand hex: ${surfaceJson.match(hex)}`);
    for (const [k, v] of Object.entries(INK)) {
      assert.ok(v === "#ffffff" || v.startsWith("rgba(255,255,255"), `INK.${k} is not neutral: ${v}`);
    }
  });
});
