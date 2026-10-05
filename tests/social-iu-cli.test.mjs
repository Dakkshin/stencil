/**
 * IU social CLI (ported from iu-panel-social-posts/tests/cli-json.test.mjs). The fork ran
 * these against its own folder; here they run against a scratch workspace through
 * `node stencil.mjs social`, with IU posts (the scene design).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "stencil-social-iu-"));
for (const dir of ["posts", "out"]) fs.mkdirSync(path.join(WS, dir));
fs.writeFileSync(
  path.join(WS, "posts", "fee_intro.toml"),
  `post_type = "the_intro"\nbrand = "IU"\neyebrow = "Insurance Untangled · Live"\ncategory = "PPO fees"\ntitle = ["Know your fees.", "~Then ask."]\n[[panelists]]\nname = "Ben Tuinei"\n[event]\nce = "1 CE credit"\n`,
);

const run = (args) =>
  spawnSync(process.execPath, [path.join(ROOT, "stencil.mjs"), "social", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, STENCIL_WORKSPACE: WS },
  });

test("--list --json emits the stable inventory shape", () => {
  const r = run(["--list", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.tool, "social");
  assert.equal(j.configDir, "posts");
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

test("--emit-json writes a sidecar for a valid post and skips rendering", () => {
  assert.equal(run(["fee_intro", "--emit-json"]).status, 0, "seed a sidecar, as the fork's real workspace had");
  const inv = JSON.parse(run(["--list", "--json"]).stdout);
  const target = inv.items.find((i) => i.ok && i.outputs.some((o) => o.endsWith(".json")));
  assert.ok(target, "a valid post with a sidecar");
  const before = fs.statSync(path.join(WS, "out")).mtimeMs;
  const r = run([target.name, "--emit-json"]);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.results[0].ok, true);
  assert.ok(fs.existsSync(path.join(WS, j.results[0].genPath)));
  assert.equal(fs.statSync(path.join(WS, "out")).mtimeMs, before, "emit-json must not touch out/");
});

test("people sharing a promo filename have isolated sidecars and inventory artifacts", (t) => {
  const prefix = `qa_pack_${process.pid}`;
  const campaign = prefix;
  const names = [`${prefix}_alice`, `${prefix}_bob`];
  const output = "Promo_03_02_Panel";
  t.after(() => {
    for (const name of names) {
      fs.rmSync(path.join(WS, "posts", `${name}.toml`), { force: true });
      fs.rmSync(path.join(WS, ".gen", `${name}.json`), { force: true });
    }
    for (const dir of ["out", "canva"]) fs.rmSync(path.join(WS, dir, campaign), { recursive: true, force: true });
  });
  for (const [i, person] of ["alice", "bob"].entries()) {
    fs.writeFileSync(path.join(WS, "posts", `${names[i]}.toml`), `post_type = "panel"\nbrand = "IU_LIGHT"\ncampaign = "${campaign}"\nperson = "${person}"\noutput_name = "${output}"\nformats = ["square"]\neyebrow = "IU Live"\ncategory = "PPO fees"\ntitle = ["Know your fees."]\n[[panelists]]\nname = "${person}"\n[event]\nce = "1 CE credit"\n`);
    for (const [dir, ext] of [["out", "@2x.png"], ["canva", ".svg"]]) {
      const folder = path.join(WS, dir, campaign, person, "square");
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, `${output}${ext}`), "inventory fixture");
    }
  }
  const emitted = run([...names, "--emit-json"]);
  assert.equal(emitted.status, 0, emitted.stderr);
  const results = JSON.parse(emitted.stdout).results;
  assert.notEqual(results[0].genPath, results[1].genPath, "shared output names must not overwrite saved data");
  for (const [i, person] of ["alice", "bob"].entries()) {
    const cfg = JSON.parse(fs.readFileSync(path.join(WS, results[i].genPath), "utf8"));
    assert.equal(cfg.person, person);
    assert.equal(cfg.panelists[0].name, person);
  }
  const listed = run(["--list", "--json"]);
  assert.equal(listed.status, 0, listed.stderr);
  const items = JSON.parse(listed.stdout).items;
  for (const [i, person] of ["alice", "bob"].entries()) {
    const item = items.find((entry) => entry.name === names[i]);
    assert.deepEqual(item.outputs.sort(), [
      `.gen/${names[i]}.json`, `canva/${campaign}/${person}/square/${output}.svg`, `out/${campaign}/${person}/square/${output}@2x.png`,
    ].sort());
  }
});
