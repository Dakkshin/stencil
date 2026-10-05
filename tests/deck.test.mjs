/**
 * Deck format CLI (ported from g-slides/tests/cli-json.test.mjs) and the frozen deck
 * outputs, run against a scratch workspace with a self-contained fixture: two made-up
 * speakers (deck-local profiles, no photos, so the monogram fallback renders) and no QR
 * file (so the empty QR frame renders). Rendering parity with g-slides is the parity
 * gate's job: node parity/run.mjs deck.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONTRACT } from "../core/contract.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-deck-"));
fs.mkdirSync(path.join(WS, "decks"));
fs.mkdirSync(path.join(WS, "speakers"));

const speaker = (name, role) => `name = "${name}"
role = "${role}"
company = "Fixture Practice Group"
short = "${name.split(" ")[0]}"
photo = ""
bio = ["First credibility point.", "Second credibility point.", "Third credibility point."]
tags = ["Referrals", "Growth"]
`;
fs.writeFileSync(path.join(WS, "speakers", "_fixture-ada.toml"), speaker("Ada Fixture", "Practice Owner"));
fs.writeFileSync(path.join(WS, "speakers", "_fixture-ben.toml"), speaker("Ben Fixture", "Billing Lead"));
fs.writeFileSync(path.join(WS, "decks", "fixture.toml"), `deck = "fixture"
brand = "OBA"
order = ["cover", "agenda", "spotlights", "qa", "closing"]
speakers = ["_fixture-ada", "_fixture-ben"]

[event]
name = "Fixture Panel"
category = "Tests"
date = "October 22, 2026"
time = "8:00 PM – 9:00 PM ET"
format = "Live Zoom Panel · 60 min"
cost = "Complimentary"
website = "example.org"

[cover]
title = ["A fixture deck", "~for the tests"]
subtitle = "Two made-up speakers, no photos, no QR file."

[agenda]
heading = "Four topics"
[[topic]]
title = "First topic"
note = "One line."
[[topic]]
title = "Second topic"
note = "One line."
[[topic]]
title = "Third topic"
note = "One line."
[[topic]]
title = "Fourth topic"
note = "One line."

[qa]
heading = "Questions"
speaking = "Raise your hand."
chat = "Or use the chat."
recap = true

[closing]
message = "Thanks."
next = "See you next time."
website = "example.org"
`);

const run = (args) =>
  spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "deck", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180000,
    env: { ...process.env, STENCIL_WORKSPACE: WS },
  });

test("--list --json emits the stable inventory shape", () => {
  const r = run(["--list", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.tool, "deck");
  assert.equal(j.configDir, "decks");
  assert.ok(Array.isArray(j.items) && j.items.length > 0);
  for (const item of j.items) {
    assert.equal(typeof item.name, "string");
    assert.equal(typeof item.ok, "boolean");
    assert.ok(Array.isArray(item.problems));
    assert.ok(Array.isArray(item.warnings));
    assert.ok(item.assets && Array.isArray(item.assets.headshots));
    assert.ok(Array.isArray(item.outputs));
  }
});

test("--emit-json writes a sidecar for a valid deck and skips rendering", () => {
  const r = run(["fixture", "--emit-json"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.results[0].ok, true);
  assert.ok(fs.existsSync(path.join(WS, j.results[0].genPath)));
  assert.equal(fs.existsSync(path.join(WS, "out", "fixture.pdf")), false);
});

test("a full build writes exactly the frozen deck outputs", () => {
  const r = run(["fixture"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const cfg = JSON.parse(fs.readFileSync(path.join(WS, ".gen", "fixture.json"), "utf8"));
  const expected = CONTRACT.deck("fixture", { slides: cfg.slides.map((s) => s.type) });
  for (const rel of expected) assert.ok(fs.existsSync(path.join(WS, rel)), `${rel} missing`);
  const svgs = fs.readdirSync(path.join(WS, "canva", "fixture"));
  assert.equal(svgs.length, cfg.slides.length, "one SVG per slide, nothing stale");
});
