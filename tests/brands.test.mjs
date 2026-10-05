/**
 * Brand packs must reproduce every fork registry exactly (plan AD-2): for each legacy
 * entry, the pack resolved for the format that registry served, picked to the legacy
 * keys, deep-equals it. The legacy registries are a read-only snapshot
 * (fixtures/legacy-brands.json), so these tests never reach into a fork.
 *
 * Logo paths are compared by file name: the forks stored "assets/<file>" relative to
 * their own registry, Stencil stores the file name inside assets/logos/.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  brandIds, getPack, resolveBrand, layoutFor, formatOptions, pick, normalizeBrandId, brandsFor,
} from "../core/brands.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { registries } = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "legacy-brands.json"), "utf8"));

/* Which Stencil format each fork registry served. */
const SERVES = {
  "panel-kit": ["banner", "deck"],
  "panel-social-posts": ["social"],
  "panel-social-posts/panel-kit": ["social"],
  "iu-panel-social-posts": ["social"],
  "iu-panel-social-posts/panel-kit": ["social"],
  "iu-zoom-banner/panel-kit": ["banner"],
};

/* A pack lists only the formats it has a real design for (VET was never a deck). */
const designed = (id, format) => brandIds().includes(id) && brandsFor(format).includes(id);

const byFileName = (b) => ({ ...b, ...(b.logo !== undefined ? { logo: path.basename(b.logo) } : {}) });

for (const [reg, brands] of Object.entries(registries)) {
  for (const [id, legacy] of Object.entries(brands)) {
    for (const format of SERVES[reg]) {
      test(`${id} for ${format} reproduces the ${reg} registry`, { skip: !designed(id, format) && `no ${format} design for ${id}` }, () => {
        const got = pick(resolveBrand(id, format), Object.keys(legacy));
        assert.deepEqual(byFileName(got), byFileName(legacy));
      });
    }
  }
}

test("ids normalise: iu-light, iu_light and IU_LIGHT name one pack", () => {
  assert.equal(normalizeBrandId("iu-light"), "IU_LIGHT");
  assert.equal(normalizeBrandId(" oba "), "OBA");
});

test("an unknown brand fails with the list of known ids", () => {
  assert.throws(() => getPack("DFY"), /unknown brand "DFY" \(have: .*IU.*\)/);
});

test("a pack without a design for a format says which formats it has", () => {
  assert.throws(() => layoutFor("IU", "background"), /brand IU has no background design \(has: banner, thumb, social/);
});

test("format overrides sit on top of the base tokens", () => {
  assert.equal(resolveBrand("IU", "social").logoH, 94);
  assert.equal(resolveBrand("IU", "banner").logoH, 22);
  assert.equal(formatOptions("IU", "banner").requireCe, true);
  assert.deepEqual(formatOptions("IU", "social"), {});
});

test("resolveBrand hands out copies, so a caller cannot edit a pack", () => {
  const a = resolveBrand("OBA", "social");
  a.gradient[0][0] = "#000000";
  assert.equal(resolveBrand("OBA", "social").gradient[0][0], "#5b7484");
});

test("every pack's fonts and logo exist in the asset pool", { skip: !fs.existsSync(path.join(ROOT, "assets", "fonts", "Inter-400.woff2")) && "fonts not imported yet (T7)" }, () => {
  for (const id of brandIds()) {
    const pack = getPack(id);
    for (const f of pack.fonts || []) assert.ok(fs.existsSync(path.join(ROOT, "assets", "fonts", f)), `${id}: font ${f} missing`);
    const logo = pack.tokens.logo;
    if (logo && id !== "VET") assert.ok(fs.existsSync(path.join(ROOT, "assets", "logos", logo)), `${id}: logo ${logo} missing`);
  }
});

test("brandsFor lists the packs with a design for a format", () => {
  assert.ok(brandsFor("thumb").includes("OBA"));
  assert.ok(brandsFor("thumb").includes("IU"));
});
