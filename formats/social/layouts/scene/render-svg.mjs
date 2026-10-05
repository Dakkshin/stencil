#!/usr/bin/env node
/**
 * Build the IU post SVGs (the Canva-editable files) from normalized configs.
 *
 *   node render-svg.mjs                         # every .gen/*.json
 *   node render-svg.mjs -c .gen/<name>.json [--format square] [-o dir]
 *
 * The SVG is the single source of the design: render.mjs rasterises the same
 * string into the PNG. Layout lives in lib/iu/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSvg } from "./build.mjs";
import { parseArgs, expandConfigs, formatsFor, outName } from "./cli.mjs";
import { CANVA, WORKSPACE } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("node render-svg.mjs [-c config.json] [--format f] [-o dir]");
  process.exit(0);
}
const outDir = path.resolve(WORKSPACE, args.outDir || CANVA);
fs.mkdirSync(outDir, { recursive: true });
let fail = 0;
for (const file of expandConfigs(WORKSPACE, args.configs)) {
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const format of formatsFor(cfg, args.formats)) {
    try {
      const svg = await buildSvg(cfg, format);
      const dest = outName(cfg, format, outDir, ".svg");
      fs.writeFileSync(dest, svg);
      console.log(`  ✓ ${dest}`);
    } catch (e) {
      fail += 1;
      console.error(`  ✗ ${cfg.name} ${format}: ${e.stack || e.message}`);
    }
  }
}
process.exit(fail ? 1 : 0);
