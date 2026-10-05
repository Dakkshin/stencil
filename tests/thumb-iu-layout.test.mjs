/**
 * Cards thumbnail layout (ported from iu-podcast-thumbnails/tests/layout.test.mjs): compose()
 * places cards, labels and the petal as the plan says, for every guest count. Only the import
 * paths changed, and the cut-out sidecars are read from the headshot pool
 * (assets/headshots/cutouts, imported content), so that one test skips without content.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { G, LABEL, CARD, PAD, CANVAS } from "../formats/thumb/layouts/cards/geometry.mjs";
import { compose, plain, frameImage, wrapTitle, SHARED } from "../formats/thumb/layouts/cards/layout.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIDECARS = path.join(ROOT, "assets", "headshots", "cutouts");

const sample = (n, extra = {}) => ({
  mode: "dark",
  eyebrow: "Insurance Untangled · Ep 1",
  hook: "Where the money goes",
  title: [
    { text: "You negotiated your fees.", br: true },
    { text: "Did the money reach the bottom line?", br: true, dim: true },
  ],
  guests: Array.from({ length: n }, (_, i) => ({
    name: `Speaker Number${i + 1}`,
    role: "Practice Owner",
    company: "Smith Dental Group",
  })),
  ...extra,
});

const rowTitle = [{ text: "Map what it actually contributes.", br: true }];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("band geometry matches the plan", () => {
  const solo = compose(G, sample(1));
  assert.deepEqual(solo.people[0].card, { x: 832, y: 168, w: 384, h: 480 });
  close(solo.faceH, 192);
  close(solo.lead.w, 720);

  const duo = compose(G, sample(2));
  assert.deepEqual(duo.people.map((p) => p.card.x), [704, 968]);
  assert.deepEqual(duo.people[0].card, { x: 704, y: 253, w: 248, h: 310 });
  close(duo.faceH, 124);
  close(duo.lead.w, 592);
});

test("every card stays in the safe area and clear of the lead", () => {
  for (let n = 1; n <= 8; n++) {
    const cfg = n <= 2 ? sample(n) : sample(n, { title: rowTitle });
    const L = compose(G, cfg);
    for (const { card } of L.people) {
      assert.ok(card.x >= PAD.x - 1e-6 && card.x + card.w <= CANVAS.w - PAD.x + 1e-6, `n=${n} x`);
      assert.ok(card.y + card.h <= CANVAS.h - PAD.y + 1e-6, `n=${n} floor`);
      close(card.h / card.w, CARD.ratio);
      if (L.band) assert.ok(L.lead.x + L.lead.w + G.midGap <= card.x + 1e-6, `n=${n} lead overlaps card`);
      else assert.ok(card.y >= L.lead.y + L.lead.h + G.row.gapAbove - 1e-6, `n=${n} row overlaps lead`);
    }
  }
});

test("labels sit bottom-left inside the card and never reach the chin", () => {
  for (let n = 1; n <= 8; n++) {
    const L = compose(G, n <= 2 ? sample(n) : sample(n, { title: rowTitle }));
    for (const { card, label } of L.people) {
      const T = LABEL[label.tier];
      close(label.x, card.x + T.inset);
      close(label.y + label.h, card.y + card.h - T.inset);
      assert.ok(label.w <= card.w - 2 * T.inset + 1e-6, `n=${n} label wider than card`);
      assert.ok(label.h + T.inset <= 0.8 * L.faceH + 1e-6, `n=${n} label reaches the chin`);
    }
  }
});

test("label carries name and designation · company, ellipsised to fit", () => {
  const L = compose(G, sample(1));
  assert.equal(L.people[0].label.name, "Speaker Number1");
  assert.equal(L.people[0].label.meta, "Practice Owner · Smith Dental Group");
  const crowd = compose(G, sample(8, { title: rowTitle }));
  assert.equal(crowd.people[0].label.tier, "S");
  assert.equal(crowd.people[0].label.meta, "");
  const long = compose(G, { ...sample(2), guests: [{ name: "A", role: "Chief Executive Officer · A Very Long Dental Group Name" }, { name: "B" }] });
  assert.ok(long.people[0].label.meta.endsWith("…"));
});

test("placeholders get a monogram and no label", () => {
  const L = compose(G, { ...sample(1), guests: [] });
  assert.equal(L.people[0].label, null);
  assert.equal(L.people[0].mono.text, "?");
});

test("em dashes never render", () => {
  assert.equal(plain("Fees — not volume — drive profit"), "Fees, not volume, drive profit");
  assert.equal(plain("— lead dash"), "lead dash");
  assert.equal(plain("trailing —"), "trailing");
  assert.equal(plain("8–9 PM stays"), "8–9 PM stays");
  assert.equal(plain("spaced – en dash"), "spaced, en dash");
  assert.equal(plain("Before you drop a plan,"), "Before you drop a plan,");
  const L = compose(G, { ...sample(1), hook: "Money — where it goes", title: [{ text: "One — two", br: true }] });
  assert.equal(L.kicker, "MONEY, WHERE IT GOES");
  assert.equal(L.lines[0].text, "One, two");
});

test("corpus headlines keep their authored line count", () => {
  const corpus = [
    [1, ["You negotiated your fees.", "~Did the money reach the bottom line?"]],
    [1, ["The write-off is visible.", "~The opportunity cost usually isn't."]],
    [2, ["The revenue equation every", "~dental practice owner should know."]],
    [2, ["More production does not", "mean more control."]],
    [4, ["Map what it actually contributes."]],
  ];
  for (const [n, lines] of corpus) {
    const title = lines.map((s) => ({ text: s.replace(/^~/, ""), br: true, dim: s.startsWith("~") }));
    const L = compose(G, sample(n, { title }));
    assert.equal(L.lines.length, lines.length, `"${lines[0]}" wrapped`);
    assert.ok(L.mark.x + L.mark.w <= L.lead.x + L.lead.w + 1e-6, `"${lines[0]}" petal leaves the column`);
  }
});

test("real cut-outs frame inside their source image", { skip: !fs.existsSync(SIDECARS) && "no cut-out sidecars imported (assets/headshots/cutouts)" }, () => {
  for (const f of fs.readdirSync(SIDECARS).filter((x) => x.endsWith("-cutout.json"))) {
    const side = JSON.parse(fs.readFileSync(path.join(SIDECARS, f), "utf8"));
    for (const n of [1, 2, 4]) {
      const L = compose(G, n <= 2 ? sample(n) : sample(n, { title: rowTitle }));
      const card = L.people[0].card;
      const img = frameImage(G, { img: "x.png", cutout: true, face: side.face, size: side.size }, card, L.faceH);
      assert.equal(img.kind, "framed");
      assert.ok(img.x <= card.x + 1e-6 && img.x + img.w >= card.x + card.w - 1e-6, `${f} n=${n} side edge inside card`);
      assert.ok(img.y + img.h >= card.y + card.h - 1e-6, `${f} n=${n} bottom edge inside card`);
    }
  }
});

test("shared functions are self-contained (the template rebuilds them from source)", () => {
  const src = SHARED.map((fn) => fn.toString()).join("\n");
  const rebuilt = new Function(`${src}\nreturn { compose, wrapTitle };`)();
  for (let n = 1; n <= 8; n++) {
    const cfg = n <= 2 ? sample(n) : sample(n, { title: rowTitle });
    const json = (o) => JSON.parse(JSON.stringify(o));
    assert.deepEqual(json(rebuilt.compose(json(G), cfg)), json(compose(G, cfg)));
  }
  assert.deepEqual(rebuilt.wrapTitle(G, rowTitle, 300, 46, 37.7, -1), wrapTitle(G, rowTitle, 300, 46, 37.7, -1));
});
