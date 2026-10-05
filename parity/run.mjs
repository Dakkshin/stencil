#!/usr/bin/env node
/**
 * The parity gate (plan AD-5): same input through the fork and through Stencil, then a
 * file-by-file verdict.
 *
 *   node parity/run.mjs <format> [<format>...] [--refresh] [--gen-only] [--brand <id>]
 *                       [--only <name,name>] [--no-look]
 *
 * Stencil runs in a scratch workspace holding copies of its inputs (and any synthetic
 * cases), so a parity run never touches the real out/, canva/ or .gen/. Results:
 *
 *   .parity/report.md                       one section per format, newest run
 *   .parity/look/<format>/<file>.png        golden | Stencil | difference
 *   .parity/stencil/<format>/               what Stencil wrote
 *
 * Exit 0 only when every compared file is exact or within its declared tolerance, and
 * no file is missing or extra.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, PARITY, loadCases, buildGolden, collect, copyOutputs, exec, pool, writeSynthetic } from "./golden.mjs";
import { compareFile, sideBySide, normalizePaths } from "./compare.mjs";
import { parseToml } from "../core/toml.mjs";

const WS_ROOT = path.join(process.env.STENCIL_PARITY_TMP || os.tmpdir(), "stencil-parity-ws");

function parseArgs(argv) {
  const a = { formats: [], refresh: false, gen: false, brand: "", only: null, look: true };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--refresh") a.refresh = true;
    else if (v === "--gen-only") a.gen = true;
    else if (v === "--brand") a.brand = String(argv[++i]).toUpperCase();
    else if (v === "--only") a.only = new Set(argv[++i].split(","));
    else if (v === "--no-look") a.look = false;
    else a.formats.push(v);
  }
  return a;
}

function brandOf(file) {
  try {
    return String(parseToml(fs.readFileSync(file, "utf8")).brand || "").toUpperCase();
  } catch {
    return "";
  }
}

async function runFormat(format, args) {
  const cases = await loadCases(format);
  const mode = args.gen ? "gen" : "full";
  const started = Date.now();

  const golden = await buildGolden(format, { refresh: args.refresh, mode, log: (m) => console.log(m) });

  /* A fresh Stencil workspace with copies of the inputs these cases need. */
  const ws = path.join(WS_ROOT, format);
  fs.rmSync(ws, { recursive: true, force: true });
  const names = [];
  for (const spec of Object.values(cases.forks)) {
    /* A format with no input files (the host background) has no input folder. */
    const src = cases.stencilInputDir ? path.join(ROOT, cases.stencilInputDir) : null;
    const dest = cases.stencilInputDir ? path.join(ws, cases.stencilInputDir) : ws;
    fs.mkdirSync(dest, { recursive: true });
    for (const n of spec.cases) {
      if (src) fs.copyFileSync(path.join(src, `${n}.toml`), path.join(dest, `${n}.toml`));
      names.push(n);
    }
    for (const c of spec.synthetic || []) {
      writeSynthetic(dest, c, fs.readFileSync(path.join(src, `${c.from}.toml`), "utf8"));
      names.push(c.name);
    }
  }
  for (const extra of cases.stencilExtraDirs || []) {
    const from = path.join(ROOT, extra);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(ws, extra), { recursive: true, preserveTimestamps: true });
  }

  let selected = names;
  if (args.only) selected = selected.filter((n) => args.only.has(n));
  if (args.brand && cases.stencilInputDir) selected = selected.filter((n) => brandOf(path.join(ws, cases.stencilInputDir, `${n}.toml`)) === args.brand);

  console.log(`  stencil ${format}: ${selected.length} case(s)`);
  const failures = [];
  await pool(
    selected.map((name) => async () => {
      const argv = mode === "gen" ? cases.stencil.emitJson(name) : cases.stencil.build(name);
      const r = await exec(process.execPath, argv, { cwd: ROOT, env: { STENCIL_WORKSPACE: ws }, timeout: cases.timeout || 180000 });
      if (r.code !== 0) failures.push({ name, out: r.out.slice(-2000) });
    }),
    cases.concurrency || 4
  );

  const stencilDir = path.join(PARITY, "stencil", format);
  fs.rmSync(stencilDir, { recursive: true, force: true });
  const stencilFiles = collect(ws, cases.outputDirs);
  copyOutputs(ws, stencilDir, stencilFiles);

  /* Golden files from every fork, keyed by workspace-relative path. */
  const goldenFiles = new Map();
  for (const fork of Object.keys(cases.forks)) {
    const root = path.join(golden.dir, fork);
    for (const rel of collect(root, cases.outputDirs)) goldenFiles.set(rel, path.join(root, rel));
  }

  const inScope = (rel) => !args.only && !args.brand ? true : selected.some((n) => cases.belongsTo(rel, n));
  const rows = [];
  for (const [rel, gFile] of goldenFiles) {
    if (!inScope(rel)) continue;
    const sFile = path.join(stencilDir, rel);
    if (!fs.existsSync(sFile)) {
      rows.push({ rel, verdict: "FAIL", detail: "missing in Stencil" });
      continue;
    }
    const res = compareFile(rel, gFile, sFile, cases.tolerance);
    rows.push({ rel, ...res });
    if (args.look && /\.(png|jpe?g)$/i.test(rel)) sideBySide(gFile, sFile, path.join(PARITY, "look", format, `${rel.replace(/\//g, "__")}.png`));
  }
  for (const rel of stencilFiles) if (!goldenFiles.has(rel) && inScope(rel)) rows.push({ rel, verdict: "FAIL", detail: "extra in Stencil (the fork did not write it)" });

  /* A case that fails in the fork and in Stencil with the same message (an overflow check,
     a validation error) is matching behaviour, not an engine difference: it is reported
     as a warning, and its outputs are still compared file by file above. */
  const said = (out) => normalizePaths(out).replace(/[\d.]+ MB/g, "N MB").trim();
  const matched = [];
  const goldenOnly = [];
  for (const g of golden.failures) {
    if (!selected.includes(g.name)) continue;
    const st = failures.find((f) => f.name === g.name);
    if (st && said(st.out) === said(g.out)) matched.push(g);
    else goldenOnly.push(g);
  }
  const stencilOnly = failures.filter((f) => !matched.some((m) => m.name === f.name));

  const counts = { exact: 0, close: 0, FAIL: 0 };
  for (const r of rows) counts[r.verdict]++;
  const pass = counts.FAIL === 0 && stencilOnly.length === 0 && goldenOnly.length === 0 && rows.length > 0;
  const secs = ((Date.now() - started) / 1000).toFixed(0);

  const lines = [
    `## ${format}${mode === "gen" ? " (sidecars only)" : ""}${args.brand ? ` — ${args.brand} only` : ""}`,
    "",
    `**${pass ? "PASS" : "FAIL"}** · ${rows.length} files: ${counts.exact} exact, ${counts.close} within tolerance, ${counts.FAIL} failed · ` +
      `${selected.length} cases · ${secs}s · ${new Date().toLocaleString("sv-SE").slice(0, 16)}`,
    "",
  ];
  /* Only the supplied files that fork's own golden sidecars name are worth reporting. */
  let anySupplied = false;
  for (const [fork, files] of Object.entries(golden.supplied || {})) {
    const root = path.join(golden.dir, fork);
    const sidecars = collect(root, [".gen"]).map((rel) => fs.readFileSync(path.join(root, rel), "utf8")).join("\n");
    const used = files.map((f) => path.basename(f)).filter((b) => sidecars.includes(b));
    if (!used.length) continue;
    anySupplied = true;
    lines.push(`- ${fork} lacked ${used.length} photo${used.length === 1 ? "" : "s"} its cases use, supplied from the shared pool: ${used.map((b) => `\`${b}\``).join(", ")}`);
  }
  if (anySupplied) lines.push("");
  for (const f of matched) lines.push(`- ${f.name} fails in the fork and in Stencil with the same message (matching behaviour; fix the input, not the engine):`, "", "```", f.out.trim().split("\n").slice(-6).join("\n"), "```", "");
  for (const f of goldenOnly) lines.push(`- fork run failed: ${f.fork} ${f.name}`, "", "```", f.out.trim(), "```", "");
  for (const f of stencilOnly) lines.push(`- Stencil run failed: ${f.name}`, "", "```", f.out.trim(), "```", "");
  const bad = rows.filter((r) => r.verdict === "FAIL");
  const close = rows.filter((r) => r.verdict === "close");
  if (bad.length) lines.push("| failed file | why |", "|---|---|", ...bad.map((r) => `| \`${r.rel}\` | ${r.detail.replace(/\|/g, "\\|")} |`), "");
  if (close.length) lines.push("| within tolerance | measure |", "|---|---|", ...close.map((r) => `| \`${r.rel}\` | ${r.detail} |`), "");
  const section = lines.join("\n");

  return { format, pass, section, counts, rows, failures: stencilOnly, matched };
}

function writeReport(sections) {
  const file = path.join(PARITY, "report.md");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const keep = new Map();
  for (const block of existing.split(/\n(?=## )/).slice(1)) keep.set(block.split("\n")[0], block.trimEnd());
  for (const s of sections) keep.set(s.split("\n")[0], s.trimEnd());
  const body = [...keep.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v).join("\n\n");
  fs.mkdirSync(PARITY, { recursive: true });
  fs.writeFileSync(file, `# Stencil parity report\n\nFork output (golden) vs Stencil output for the same input. Rules: plan AD-5. Side-by-sides: .parity/look/<format>/.\n\n${body}\n`);
  return file;
}

const args = parseArgs(process.argv.slice(2));
if (!args.formats.length) {
  console.error("usage: node parity/run.mjs <format> [<format>...] [--refresh] [--gen-only] [--brand <id>] [--only <names>] [--no-look]");
  process.exit(2);
}
const results = [];
for (const f of args.formats) results.push(await runFormat(f, args));
const report = writeReport(results.map((r) => r.section));
for (const r of results) {
  console.log(`${r.pass ? "✔" : "✖"} ${r.format}: ${r.counts.exact} exact, ${r.counts.close} within tolerance, ${r.counts.FAIL} failed${r.failures.length ? `, ${r.failures.length} Stencil run(s) failed` : ""}${r.matched.length ? `, ${r.matched.length} case(s) fail identically in fork and Stencil` : ""}`);
  for (const row of r.rows.filter((x) => x.verdict === "FAIL").slice(0, 12)) console.log(`    ✖ ${row.rel}: ${row.detail}`);
}
console.log(`report: ${path.relative(process.cwd(), report)}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
