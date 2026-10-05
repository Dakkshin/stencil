#!/usr/bin/env node
/**
 * Golden outputs: what each fork itself renders today, for the parity gate (plan AD-5).
 *
 * The forks are read-only (AD-7), so a golden run never executes inside them. It copies
 * every fork into a scratch tree that mirrors the real layout, so the forks' own relative
 * reaches still resolve:
 *
 *   $TMPDIR/stencil-parity/Automation/<fork>/   copy (no node_modules, outputs, .git)
 *   $TMPDIR/stencil-parity/Automation/<fork>/node_modules -> the real one (read-only use)
 *   $TMPDIR/stencil-parity/OBA                  -> the real OBA folder (oba-website deps)
 *
 * then runs the fork's own CLI per case and collects everything it wrote under .gen/,
 * out/, canva/ and preview/ into .parity/golden/<format>/. Goldens are reused until a
 * fork's code changes (a hash of its code files is kept next to them).
 *
 *   node parity/golden.mjs <format> [--refresh]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* Where the forks live. A lane worktree outside Automation/ sets STENCIL_SOURCES. */
export const AUTOMATION = path.resolve(process.env.STENCIL_SOURCES || path.dirname(ROOT));
export const EKWA = path.dirname(AUTOMATION);
export const SCRATCH = path.join(process.env.STENCIL_PARITY_TMP || os.tmpdir(), "stencil-parity");
export const PARITY = path.join(ROOT, ".parity");
export const OUTPUT_DIRS = [".gen", "out", "canva", "preview"];

export const FORKS = ["podcast-thumbnails", "iu-podcast-thumbnails", "panel-social-posts", "iu-panel-social-posts", "zoom-banner", "iu-zoom-banner", "g-slides"];
/* Siblings a fork reaches into at run time: g-slides/host-background imports
   ../../panel-kit/lib/brands.mjs, the canonical panel-kit repo. */
export const SIBLINGS = ["panel-kit"];
const SKIP = new Set(["node_modules", ".git", ".venv", ".gen", "out", "canva", "preview", "legacy", ".d", "tasks"]);
/* Caches that are content, not output: carried into the scratch copy, never compared.
   The social cutout cache keys on each photo's size and mtime, so copies keep mtimes. */
export const CACHE_DIRS = [path.join(".gen", "cutouts"), path.join(".gen", "_img"), path.join(".gen", "_metrics.json")];

/* Copy one file and keep its timestamps (cache keys depend on mtime). */
function copyKeep(src, dest) {
  fs.copyFileSync(src, dest);
  const st = fs.statSync(src);
  fs.utimesSync(dest, st.atimeMs / 1000, st.mtimeMs / 1000); // fractional: keys round mtimeMs
}

export async function loadCases(format) {
  const file = path.join(ROOT, "parity", "cases", `${format}.mjs`);
  if (!fs.existsSync(file)) throw new Error(`no parity cases for "${format}" (expected parity/cases/${format}.mjs)`);
  return (await import(pathToFileURL(file).href)).default;
}

/* Never write outside the scratch tree or stencil/.parity (AD-7). */
function assertWritable(p) {
  const abs = path.resolve(p);
  if (abs.startsWith(SCRATCH + path.sep) || abs === SCRATCH) return;
  if (abs.startsWith(PARITY + path.sep) || abs === PARITY) return;
  throw new Error(`refusing to write outside the scratch tree and .parity/: ${abs}`);
}

function copyTree(src, dest) {
  assertWritable(dest);
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isFile()) copyKeep(s, d);
  }
}

/**
 * Give a scratch fork the shared-pool files it lacks (top-level files only, by name).
 *
 * Stencil resolves photos from one merged pool; a fork resolves from its own folder and a
 * sibling or two. When a fork's folder is missing a photo another fork has (the banner
 * fork's Sep 17 headshots were deleted from its working tree, say), the fork renders a
 * monogram where Stencil renders the photo. That is content, not engine behaviour, so the
 * golden run sees the same pool. No two pools hold different bytes under one name (checked
 * on import), so supplying can only fill a gap, never swap a file. Every supplied file is
 * listed in the report.
 */
export function supplyPools(forkDir, supply = {}) {
  const supplied = [];
  for (const [kind, rel] of Object.entries(supply)) {
    const pool = path.join(ROOT, "assets", kind);
    const dest = path.join(forkDir, rel);
    if (!fs.existsSync(pool)) continue;
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(pool, { withFileTypes: true })) {
      if (!e.isFile() || e.name.startsWith(".")) continue;
      const target = path.join(dest, e.name);
      if (fs.existsSync(target)) continue;
      assertWritable(target);
      copyKeep(path.join(pool, e.name), target);
      supplied.push(`${rel}/${e.name}`);
    }
  }
  return supplied;
}

/** Fresh scratch copies of every fork, laid out like the real Automation folder. */
export function prepareScratch() {
  if (fs.existsSync(SCRATCH)) fs.rmSync(SCRATCH, { recursive: true, force: true });
  const auto = path.join(SCRATCH, "Automation");
  for (const fork of [...FORKS, ...SIBLINGS]) {
    const src = path.join(AUTOMATION, fork);
    if (!fs.existsSync(src)) continue;
    copyTree(src, path.join(auto, fork));
    for (const cache of CACHE_DIRS) {
      const from = path.join(src, cache);
      if (!fs.existsSync(from)) continue;
      const to = path.join(auto, fork, cache);
      if (fs.statSync(from).isDirectory()) copyTree(from, to);
      else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        copyKeep(from, to);
      }
    }
    for (const nm of ["node_modules", "panel-kit/node_modules", ".venv"]) {
      const real = path.join(src, nm);
      if (fs.existsSync(real)) fs.symlinkSync(real, path.join(auto, fork, nm), "dir");
    }
  }
  if (fs.existsSync(path.join(EKWA, "OBA"))) fs.symlinkSync(path.join(EKWA, "OBA"), path.join(SCRATCH, "OBA"), "dir");
  return auto;
}

/** Hash of a fork's code (not its content), so goldens refresh when the fork changes. */
export function forkHash(fork) {
  const h = crypto.createHash("sha1");
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(e.name) || e.name === "headshots" || e.name === "panelists" || e.name === "qrs") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|js|html|json|toml)$/.test(e.name)) h.update(e.name).update(fs.readFileSync(p));
    }
  };
  const root = path.join(AUTOMATION, fork);
  if (fs.existsSync(root)) walk(root);
  return h.digest("hex");
}

/** Every file under the output dirs of `root`, relative, sorted. Caches are skipped. */
export function collect(root, dirs = OUTPUT_DIRS) {
  const out = [];
  const caches = new Set(CACHE_DIRS.map((c) => path.join(root, c)));
  const walk = (dir) => {
    if (!fs.existsSync(dir) || caches.has(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (caches.has(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push(path.relative(root, p));
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  return out.sort();
}

export function copyOutputs(fromRoot, toRoot, files) {
  for (const rel of files) {
    const dest = path.join(toRoot, rel);
    assertWritable(dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(fromRoot, rel), dest);
  }
}

/** Run a command, capture output, resolve { code, out }. */
export function exec(cmd, args, { cwd, env = {}, timeout = 180000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

/** Run `jobs` (async thunks) with at most `n` in flight. */
export async function pool(jobs, n = 4) {
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        results[i] = await jobs[i]();
      }
    })
  );
  return results;
}

/* Write synthetic case inputs (a real input with keys changed) into an input folder. */
export function writeSynthetic(dir, c, sourceText) {
  assertWritable(path.join(dir, `${c.name}.toml`));
  fs.mkdirSync(dir, { recursive: true });
  let text = sourceText;
  for (const [k, v] of Object.entries(c.set || {})) {
    const line = `${k} = ${JSON.stringify(v)}`;
    const re = new RegExp(`^${k}\\s*=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${line}\n${text}`;
  }
  fs.writeFileSync(path.join(dir, `${c.name}.toml`), text);
}

/**
 * Build goldens for a format: every fork case through the fork's own CLI.
 * Returns { dir, failures: [{ fork, name, out }] }.
 */
export async function buildGolden(format, { refresh = false, mode = "full", log = console.log } = {}) {
  const cases = await loadCases(format);
  const goldenDir = path.join(PARITY, "golden", format, mode);
  const stampFile = path.join(goldenDir, "stamp.json");
  const hashes = Object.fromEntries(Object.keys(cases.forks).map((f) => [f, forkHash(f.split("/")[0])]));
  if (!refresh && fs.existsSync(stampFile)) {
    const stamp = JSON.parse(fs.readFileSync(stampFile, "utf8"));
    if (JSON.stringify(stamp.hashes) === JSON.stringify(hashes)) return { dir: goldenDir, failures: stamp.failures || [], supplied: stamp.supplied || {}, cached: true };
    log(`  golden ${format}: a fork changed since the last golden run, rebuilding`);
  }

  const auto = prepareScratch();
  fs.rmSync(goldenDir, { recursive: true, force: true });
  const failures = [];
  const supplied = {};
  for (const [fork, spec] of Object.entries(cases.forks)) {
    const cwd = path.join(auto, spec.cwd || fork);
    supplied[fork] = supplyPools(cwd, spec.supply);
    for (const c of spec.synthetic || []) {
      const src = fs.readFileSync(path.join(cwd, spec.inputDir, `${c.from}.toml`), "utf8");
      writeSynthetic(path.join(cwd, spec.inputDir), c, src);
    }
    const names = [...spec.cases, ...(spec.synthetic || []).map((c) => c.name)];
    log(`  golden ${format}: ${names.length} case(s) through ${fork}`);
    const runs = await pool(
      names.map((name) => async () => {
        const args = mode === "gen" ? spec.emitJson(name) : spec.build(name);
        const r = await exec(process.execPath, args, { cwd, timeout: spec.timeout || 180000 });
        if (r.code !== 0) failures.push({ fork, name, out: r.out.slice(-2000) });
        return r;
      }),
      spec.concurrency || 4
    );
    void runs;
    const outRoot = path.join(cwd, spec.outRoot || ".");
    copyOutputs(outRoot, path.join(goldenDir, fork), collect(outRoot));
  }
  fs.mkdirSync(goldenDir, { recursive: true });
  fs.writeFileSync(stampFile, JSON.stringify({ format, mode, hashes, failures, supplied, at: new Date().toISOString() }, null, 2));
  return { dir: goldenDir, failures, supplied, cached: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const format = process.argv[2];
  if (!format) {
    console.error("usage: node parity/golden.mjs <format> [--refresh] [--gen-only]");
    process.exit(2);
  }
  const mode = process.argv.includes("--gen-only") ? "gen" : "full";
  const { dir, failures, cached } = await buildGolden(format, { refresh: process.argv.includes("--refresh"), mode });
  const files = collect(dir, Object.keys((await loadCases(format)).forks));
  console.log(`${cached ? "cached" : "built"} golden for ${format}: ${files.length} files in ${path.relative(ROOT, dir)}`);
  for (const f of failures) console.error(`  ✖ ${f.fork} ${f.name} failed:\n${f.out}`);
  process.exit(failures.length ? 1 : 0);
}
