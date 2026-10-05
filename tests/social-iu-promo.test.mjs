/**
 * The Fee Schedule Reset promo pack (ported from iu-panel-social-posts/tests/promo-pack.test.mjs).
 *
 * Reads the real campaign posts in posts/ and the QR pool, which are content: imported, never
 * committed (plan AD-8). A checkout without them skips this test instead of failing it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseToml } from "../core/toml.mjs";
import { resolvePostQr, qrPools } from "../formats/social/qr.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const campaign = "2026-10-22-fee-schedule-reset";
const postsDir = path.join(root, "posts");
const configs = fs.existsSync(postsDir)
  ? fs.readdirSync(postsDir)
      .filter((file) => file.endsWith(".toml") && !file.startsWith("_"))
      .map((file) => ({ name: file, cfg: parseToml(fs.readFileSync(path.join(postsDir, file), "utf8")) }))
      .filter(({ cfg }) => cfg.campaign === campaign)
  : [];

test("the campaign contains five promos per speaker with their own QR images (solo 01/04, trio 02/03/05)", { skip: !configs.length && "the campaign's posts are not imported (content stays local)" }, () => {
  assert.equal(configs.length, 15);
  const stages = [
    ["speaker_promo", "IU", null], ["the_intro", "IU", "01_The_Intro"],
    ["panel", "IU_LIGHT", "02_Panel"], ["one_more_day", "IU", "04_One_More_Day"],
    ["happening_today", "IU", "05_Live_Tonight"],
  ];
  for (const [person, initials] of [["ben-tuinei", "BT"], ["laura-johnston", "LJ"], ["tessina-bullock", "TB"]]) {
    const set = configs.filter(({ cfg }) => cfg.person === person);
    assert.equal(set.length, 5, person);
    for (const [index, [postType, brand, basename]] of stages.entries()) {
      const stage = index + 1;
      const entry = set.find(({ cfg }) => cfg.post_type === postType);
      assert.ok(entry, `${person} stage ${stage}`);
      const cfg = entry.cfg;
      /* 01 speaker + 04 countdown spotlight one panelist; 02 intro, 03 panel
         and 05 live carry the full trio row (deliberate multi-face direction) */
      const expectedPanelists = (postType === "speaker_promo" || postType === "one_more_day")
        ? [person]
        : ["tessina-bullock", "ben-tuinei", "laura-johnston"];
      assert.deepEqual(cfg.panelists, expectedPanelists, entry.name);
      assert.equal(cfg.brand, brand, entry.name);
      assert.deepEqual(cfg.formats, ["square", "portrait"], entry.name);
      assert.equal(cfg.output_name, `Promo_0${stage}_${basename || person}`, entry.name);
      const warnings = [];
      const qr = resolvePostQr({ event: cfg.event, person, postType, name: entry.name, warnings });
      /* The fork's qrs/<person>/ folder is a QR pool's <person>/ folder here. */
      const file = `QR_https___go.insurance-untangled.com_IUOct22${initials}${stage}.png`;
      assert.ok(qrPools().some((pool) => qr === path.join(pool, person, file)), `${entry.name}: ${qr}`);
      assert.deepEqual(warnings, []);
    }
  }
});
