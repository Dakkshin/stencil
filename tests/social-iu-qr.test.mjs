/**
 * Registration QR selection and placement (ported from iu-panel-social-posts/tests/qr.test.mjs).
 *
 * resolvePostQr keeps the fork's `root` argument (one folder holding qrs/) for the fixture
 * tests; the CLI test runs `node stencil.mjs social` in a scratch workspace, whose
 * assets/qrs/ pool takes the place of the fork's qrs/ folder. The workspace is set before
 * the engine loads, so the scene's grain cache lands there and never in the repo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-social-qr-"));
process.env.STENCIL_WORKSPACE = WS;
const { resolvePostQr } = await import("../formats/social/qr.mjs");
const { buildSvg } = await import("../formats/social/layouts/scene/build.mjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "iu-qrs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, "qrs", "Bradley Barnett");
  fs.mkdirSync(folder, { recursive: true });
  for (let i = 1; i <= 5; i++) fs.writeFileSync(path.join(folder, `${i}.png`), "fixture");
  const warnings = [];
  const resolve = (opts = {}) => resolvePostQr({ root, person: "bradley-barnett", postType: "speaker_promo", name: "test", warnings, ...opts });
  return { root, folder, warnings, resolve };
}

test("five promos select their own numbered supplied QR, independent of output names", (t) => {
  const { folder, resolve } = fixture(t);
  for (const [postType, brand, number] of [
    ["speaker_promo", "IU", 1], ["the_intro", "IU", 2], ["panel", "IU_LIGHT", 3],
    ["one_more_day", "IU", 4], ["happening_today", "IU", 5],
  ]) assert.equal(resolve({ postType, brand, name: "custom-promo-name" }), path.join(folder, `${number}.png`));
});

test("single profiles infer identity; groups require an explicit tracked person", (t) => {
  const { folder, resolve } = fixture(t);
  assert.equal(resolve({ person: "", profile: "bradley-barnett", panelists: [{ name: "Dr. Bradley Barnett" }] }), path.join(folder, "1.png"));
  assert.equal(resolve({ person: "", panelists: [{ name: "Bradley Barnett" }] }), path.join(folder, "1.png"));
  assert.equal(resolve({ person: "", panelists: [{ name: "Bradley Barnett" }, { name: "Other Speaker" }] }), "");
});

test("explicit nested, legacy, absolute and data paths override automatic matching", (t) => {
  const { root, folder, resolve } = fixture(t);
  const file = path.join(folder, "5.png");
  assert.equal(resolve({ event: { qr: "Bradley Barnett/5.png" } }), file);
  assert.equal(resolve({ event: { qr: "qrs/Bradley Barnett/5.png" } }), file);
  assert.equal(resolve({ event: { qr: file } }), file);
  assert.equal(resolve({ event: { qr: "data:image/png;base64,abc" } }), "data:image/png;base64,abc");
  assert.equal(resolve({ event: { qr: "" } }), "");
  assert.equal(resolve({ event: { qr: root } }), "", "directories are not images");
});

test("missing and duplicate images hide safely; zero-padded JPEGs work", (t) => {
  const { folder, warnings, resolve } = fixture(t);
  fs.unlinkSync(path.join(folder, "1.png"));
  assert.equal(resolve(), "");
  assert.match(warnings.pop(), /qr image not found/);
  fs.writeFileSync(path.join(folder, "01.JPG"), "fixture");
  assert.equal(resolve(), path.join(folder, "01.JPG"));
  fs.writeFileSync(path.join(folder, "1.jpeg"), "fixture");
  assert.equal(resolve(), "");
  assert.match(warnings.pop(), /multiple QR images/);
  assert.equal(resolve({ event: { qr: "/missing/qr.png" } }), "");
  assert.match(warnings.pop(), /qr image not found/);
});

test("unknown post types and people without QR folders stay QR-free", (t) => {
  const { resolve, warnings } = fixture(t);
  assert.equal(resolve({ postType: "intro_panel_one" }), "");
  assert.equal(resolve({ person: "someone-else" }), "");
  assert.deepEqual(warnings, []);
});

test("changing the gradient never changes a post's tracking stage", (t) => {
  const { folder, resolve } = fixture(t);
  assert.equal(resolve({ postType: "the_intro", brand: "IU_LIGHT" }), path.join(folder, "2.png"));
  assert.equal(resolve({ postType: "panel", brand: "IU" }), path.join(folder, "3.png"));
});

test("downloaded QR filenames ending in 1–5 match without renaming", (t) => {
  const { folder, resolve } = fixture(t);
  fs.unlinkSync(path.join(folder, "1.png"));
  fs.writeFileSync(path.join(folder, "QR_https___example.com_PanelBB1.png"), "fixture");
  fs.writeFileSync(path.join(folder, "11.png"), "not variant 1");
  assert.equal(resolve(), path.join(folder, "QR_https___example.com_PanelBB1.png"));
});

test("supplied QR is embedded once with accreditation retained in every promo", async () => {
  const data = await sharp({ create: { width: 300, height: 330, channels: 3, background: "white" } }).png().toBuffer();
  const qr = `data:image/png;base64,${data.toString("base64")}`;
  const base = {
    name: "qr-render-test", title: [{ text: "Bring your fee schedules.", br: true }, { text: "Know what to negotiate.", br: true, dim: true }],
    eyebrow: "Insurance Untangled · Live", category: "PPO fee schedules", cutout: false,
    event: { date: "Thu, Oct 22", time: "8:00 PM EST", cta: "Register now", ce: "1 CE credit", qr },
    panelists: [{ name: "Ben Tuinei", role: "Founder", company: "Veritas Dental Resources" }],
  };
  const combos = [["speaker_promo", "IU"], ["the_intro", "IU"], ["the_intro", "IU_LIGHT"],
    ["one_more_day", "IU"], ["happening_today", "IU"], ["panel", "IU"], ["intro_panel_one", "IU"]];
  for (const [postType, brand] of combos) for (const format of ["square", "portrait"]) {
    const label = `${postType} ${brand} ${format}`;
    const svg = await buildSvg({ ...base, postType, brand }, format);
    assert.equal((svg.match(/data-name="QR image"/g) || []).length, 1, label);
    assert.ok(svg.includes('data-name="PACE plate"') && svg.includes('data-name="Stamp seal"'), label);
    const image = /<image[^>]*data-name="QR image"[^>]*width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    assert.ok(Math.abs(Number(image[1]) / Number(image[2]) - 300 / 330) < 0.001, `${label}: aspect ratio preserved`);
  }
  const noQr = await buildSvg({ ...base, postType: "the_intro", event: { ...base.event, qr: "" } }, "square");
  assert.ok(!noQr.includes('data-name="QR image"'));
});

test("CLI normalization and inventory expose the automatically matched image", (t) => {
  const name = `_qr_fixture_${process.pid}`;
  const folder = path.join(WS, "assets", "qrs", name);
  const post = path.join(WS, "posts", `${name}.toml`);
  const sidecar = path.join(WS, ".gen", `${name}.json`);
  t.after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(post, { force: true });
    fs.rmSync(sidecar, { force: true });
  });
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.dirname(post), { recursive: true });
  fs.writeFileSync(path.join(folder, "1.png"), "normalization fixture");
  fs.writeFileSync(post, `post_type = "speaker_promo"\nperson = "${name}"\neyebrow = "IU Live"\ntitle = ["Know your fees."]\n[[panelists]]\nname = "QR Fixture"\n[event]\nce = "1 CE credit"\n`);
  const run = (args) => spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "social", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, STENCIL_WORKSPACE: WS } });
  const emitted = run([name, "--emit-json"]);
  assert.equal(emitted.status, 0, emitted.stderr);
  assert.equal(JSON.parse(fs.readFileSync(sidecar, "utf8")).event.qr, path.join(folder, "1.png"));
  // Give the fixture a normal inventory name only for this check.
  const visible = post.replace(`/${name}.toml`, `/${name.slice(1)}.toml`);
  fs.renameSync(post, visible);
  t.after(() => fs.rmSync(visible, { force: true }));
  const inventory = run(["--list", "--json"]);
  assert.equal(inventory.status, 0, inventory.stderr);
  const item = JSON.parse(inventory.stdout).items.find((entry) => entry.name === name.slice(1));
  assert.equal(item.assets.qrs[0].resolved, true);
  assert.equal(item.assets.qrs[0].ref, `${name}/1.png`);
});

test("the group QR footer retains the CE seal with a multiline claim and three panelists", async () => {
  const data = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white" } }).png().toBuffer();
  const cfg = {
    name: "group-qr-budget", postType: "the_intro", brand: "IU",
    eyebrow: "Insurance Untangled · Live", category: "PPO fee schedules · 2027 renewals",
    title: [{ text: "Your fee schedule is negotiable.", br: true }, { text: "Most practices just never ask.", br: true, dim: true }],
    panelists: ["Tessina Bullock", "Ben Tuinei", "Laura Johnston"].map((name) => ({ name })),
    event: { date: "Thu, Oct 22", time: "8:00 PM EST", cta: "Register now", ce: "1 CE credit", qr: `data:image/png;base64,${data.toString("base64")}` },
  };
  for (const format of ["square", "portrait"]) {
    const svg = await buildSvg(cfg, format);
    assert.ok(svg.includes('data-name="Stamp seal"'), format);
    assert.ok(svg.includes('data-name="QR image"'), format);
  }
  for (const postType of ["one_more_day", "happening_today"]) for (const format of ["square", "portrait"]) {
    const svg = await buildSvg({ ...cfg, postType }, format);
    assert.ok(svg.includes('data-name="Stamp seal"'), `${postType} ${format}`);
    if (postType === "happening_today") {
      const clock = /<text[^>]*data-name="Live time"[^>]*font-size="([\d.]+)"/.exec(svg);
      assert.ok(clock && Number(clock[1]) >= (format === "square" ? 80 : 90), `${format}: event time stays prominent`);
    }
  }
});
