/**
 * The frozen output contract (plan AD-3) and the CLI that fronts it.
 *
 * Each expected list below is copied from the fork that owned the format, so a change to
 * core/contract.mjs that renames an output fails here first. Each format's own test then
 * builds a real input and asserts the files on disk match these lists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-contract-"));
process.env.STENCIL_WORKSPACE = WS;
const { CONTRACT, nameClash } = await import("../core/contract.mjs");

test("banner: out/<stem>.png, out/<stem>@3x.png, canva/<stem>.svg (zoom-banner/gen.mjs listOutputs)", () => {
  assert.deepEqual(CONTRACT.banner("referral-growth-panel"), [
    "out/referral-growth-panel.png",
    "out/referral-growth-panel@3x.png",
    "canva/referral-growth-panel.svg",
    ".gen/referral-growth-panel.json",
  ]);
  assert.deepEqual(CONTRACT.banner("p", { stem: "custom" }).slice(0, 3), ["out/custom.png", "out/custom@3x.png", "canva/custom.svg"]);
});

test("thumb: canva/<PREFIX>-<name>.svg and preview/<name>.png (podcast-thumbnails/gen.mjs listOutputs)", () => {
  assert.deepEqual(CONTRACT.thumb("ep081", { prefix: "OBA" }), ["canva/OBA-ep081.svg", "preview/ep081.png", ".gen/ep081.json"]);
  assert.deepEqual(CONTRACT.thumb("ep148", { prefix: "IU" }), ["canva/IU-ep148.svg", "preview/ep148.png", ".gen/ep148.json"]);
  assert.throws(() => CONTRACT.thumb("ep1", {}), /prefix/);
});

test("social: <stem>-<format> flat, or <campaign>/<person|shared>/<format>/<stem> (both social forks)", () => {
  assert.deepEqual(CONTRACT.social("the_intro", { formats: ["square", "story"] }), [
    "canva/the_intro-square.svg",
    "out/the_intro-square@2x.png",
    "canva/the_intro-story.svg",
    "out/the_intro-story@2x.png",
    ".gen/the_intro.json",
  ]);
  assert.deepEqual(CONTRACT.social("fsr_speaker_ben", { stem: "Speaker_Ben", formats: ["square"], campaign: "fsr", person: "ben-tuinei" }), [
    "canva/fsr/ben-tuinei/square/Speaker_Ben.svg",
    "out/fsr/ben-tuinei/square/Speaker_Ben@2x.png",
    ".gen/fsr_speaker_ben.json",
  ]);
  assert.equal(CONTRACT.social("x", { formats: ["square"], campaign: "fsr" })[0], "canva/fsr/shared/square/x.svg");
});

test("deck: canva/<deck>/NN-<type>.svg, out/<deck>/NN-<type>@2x.png, out/<deck>.pdf (g-slides SPEC)", () => {
  assert.deepEqual(CONTRACT.deck("sep17", { slides: ["cover", "agenda"] }), [
    "canva/sep17/01-cover.svg",
    "canva/sep17/02-agenda.svg",
    "out/sep17/01-cover@2x.png",
    "out/sep17/02-agenda@2x.png",
    "out/sep17.pdf",
    ".gen/sep17.json",
  ]);
});

test("background: the fixed host-background set (g-slides/host-background/gen.mjs)", () => {
  assert.deepEqual(CONTRACT.background(), ["canva/host-background.svg", "out/host-background.png", "out/host-background.jpg"]);
});

test("one name belongs to one format, because .gen/ is shared", () => {
  fs.mkdirSync(path.join(WS, "panels"), { recursive: true });
  fs.mkdirSync(path.join(WS, "posts"), { recursive: true });
  fs.writeFileSync(path.join(WS, "panels", "launch.toml"), 'title = "x"\n');
  fs.writeFileSync(path.join(WS, "posts", "launch.toml"), 'title = "x"\n');
  assert.match(nameClash("social", "launch"), /exists as a banner input .* rename one/);
  assert.equal(nameClash("social", "only-here"), "");
  assert.match(nameClash("banner", "host-background"), /reserved by the background format/);
});

test("the CLI lists five formats and five brands, and rejects an unknown format", () => {
  const help = spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  for (const f of ["banner", "thumb", "social", "deck", "background"]) assert.match(help.stdout, new RegExp(`^  ${f} `, "m"));
  for (const b of ["IU", "IU_LIGHT", "OBA", "OBA_LIGHT", "VET"]) assert.match(help.stdout, new RegExp(`^  ${b} `, "m"));
  const bad = spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "nope"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});
