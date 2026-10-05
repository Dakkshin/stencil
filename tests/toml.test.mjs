/**
 * core/toml.mjs is the one TOML parser for every format. It replaces seven copies: four
 * identical, one with plain tables rejected (the thumbnail repos) and two doc-only drifts.
 * The published starter templates of every fork are the fixtures, checked against
 * smol-toml (a full parser) so the subset parser cannot silently misread a real file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as smolParse } from "smol-toml";
import { parseToml } from "../core/toml.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures", "toml");

/* smol-toml returns TOML integers as numbers here (no bigint for small values) and
   dates as objects; the subset parser has no dates, so plain JSON equality is fair. */
const plain = (v) => JSON.parse(JSON.stringify(v));

for (const file of fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".toml")).sort()) {
  test(`parses the ${file} starter template like a full TOML parser`, () => {
    const text = fs.readFileSync(path.join(FIXTURES, file), "utf8");
    assert.deepEqual(plain(parseToml(text)), plain(smolParse(text)));
  });
}

test("plain [table] parses (the thumbnail copy used to reject it)", () => {
  const cfg = parseToml('title = "x"\n[event]\nqr = "a.png"\ndate = "Oct 22"\n');
  assert.deepEqual(cfg, { title: "x", event: { qr: "a.png", date: "Oct 22" } });
});

test("array-of-tables blocks collect in order", () => {
  const cfg = parseToml('[[guests]]\nname = "A"\n[[guests]]\nname = "B"\n');
  assert.deepEqual(cfg.guests.map((g) => g.name), ["A", "B"]);
});

test("errors carry the offending line number", () => {
  assert.throws(() => parseToml('title = "ok"\nbad line here\n'), (err) => err.name === "TomlError" && err.line === 2);
});
