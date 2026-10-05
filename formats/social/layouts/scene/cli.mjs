/** Shared CLI plumbing for render-svg.mjs and render.mjs (same contract as before). */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_FORMATS } from "./tokens.mjs";

export const ALL_FORMATS = ["square", "portrait", "story", "landscape"];

export function parseArgs(argv) {
  const a = { configs: [], outDir: null, formats: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "-c") a.configs.push(argv[++i]);
    else if (v === "-o") a.outDir = argv[++i];
    else if (v === "--format") a.formats = [argv[++i]];
    else if (v === "--formats") a.formats = argv[++i].split(",").map((x) => x.trim());
    else if (v === "-h" || v === "--help") a.help = true;
  }
  return a;
}

export function expandConfigs(root, patterns) {
  const out = [];
  const list = patterns.length ? patterns : [".gen"];
  for (const pattern of list) {
    const abs = path.resolve(root, pattern);
    if (fs.existsSync(abs)) {
      if (fs.statSync(abs).isDirectory()) out.push(...fs.readdirSync(abs).filter((f) => f.endsWith(".json")).map((f) => path.join(abs, f)));
      else out.push(abs);
    }
  }
  return out;
}

/** Formats this renderer will actually build for a config (warns on the rest). */
export function formatsFor(cfg, only) {
  let fmts = Array.isArray(cfg.formats) && cfg.formats.length ? cfg.formats : SUPPORTED_FORMATS;
  if (only) fmts = fmts.filter((f) => only.includes(f));
  const skipped = fmts.filter((f) => !SUPPORTED_FORMATS.includes(f));
  if (skipped.length) console.warn(`  [${cfg.name}] ${skipped.join(", ")} not in the IU design yet — skipped`);
  return fmts.filter((f) => SUPPORTED_FORMATS.includes(f));
}

/** Output file name: clean `<stem>.ext` inside campaign/format dirs, else `<stem>-<format>.ext`. */
export function outName(cfg, format, outDir, ext) {
  const stem = cfg.fileStem || cfg.name;
  const clean = cfg.campaign || ALL_FORMATS.includes(path.basename(outDir));
  return path.join(outDir, clean ? `${stem}${ext}` : `${stem}-${format}${ext}`);
}
