/**
 * Cards thumbnail geometry (ported from iu-podcast-thumbnails/tests/geometry.test.mjs): the
 * template source's CSS and geometry.mjs agree, and the layout tokens sit on their grids.
 * Only the import paths changed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyTemplate,
  PAD, TOP_GAP, MID_GAP, LOGO, CHIP, KICKER, CARD, BAND, ROW, LABEL,
} from "../formats/thumb/layouts/cards/geometry.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "formats", "thumb", "layouts", "cards", "template.src.html");

test("template CSS matches lib/geometry.mjs (no drift)", () => {
  const src = fs.readFileSync(SRC, "utf8");
  assert.deepEqual(verifyTemplate(src), []);
});

test("every layout token sits on the 8pt grid", () => {
  const tokens = [
    PAD.x, PAD.y, TOP_GAP, MID_GAP, LOGO.w,
    CHIP.h, CHIP.padX, CHIP.padY,
    KICKER.h, KICKER.gap,
    CARD.gap, CARD.radius, CARD.radiusS,
    BAND.stageTop, BAND.stageBottom, BAND.w[1], BAND.w[2],
    ROW.leadW, ROW.gapAbove,
  ];
  for (const v of tokens) {
    assert.equal(v % 8, 0, `${v} is not a multiple of 8`);
  }
});

test("label insets and paddings sit on the 2px half-step", () => {
  for (const tier of ["L", "M", "S"]) {
    const T = LABEL[tier];
    for (const v of [T.inset, T.padX, T.padY, T.radius, T.gap]) {
      assert.equal(v % 2, 0, `${tier}: ${v} is odd`);
    }
  }
});
