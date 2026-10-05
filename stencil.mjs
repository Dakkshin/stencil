#!/usr/bin/env node
/**
 * Stencil: one asset engine with brand packs.
 *
 *   node stencil.mjs <format> [<name>...] [--brand <id>] [format flags]
 *   node stencil.mjs <format> --list [--json]
 *   node stencil.mjs <format> <name> --emit-json
 *   node stencil.mjs --help
 *
 * Each format keeps the flags of the generator it replaces; `node stencil.mjs <format>
 * --help` prints them. Inputs live in the workspace (panels/, episodes/, posts/, decks/);
 * outputs keep their frozen names under .gen/, out/, canva/ and preview/.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORMATS, formatIds, isPorted, loadFormat } from "./formats/index.mjs";
import { brandIds, getPack } from "./core/brands.mjs";
import { nameClash } from "./core/contract.mjs";
import { WORKSPACE } from "./core/paths.mjs";

function usage() {
  const formats = formatIds()
    .map((id) => `  ${id.padEnd(11)} ${FORMATS[id].title}${isPorted(id) ? "" : "  (not ported yet)"}`)
    .join("\n");
  const brands = brandIds()
    .map((id) => {
      const p = getPack(id);
      return `  ${id.padEnd(11)} ${p.label}${p.status === "legacy" ? "  (legacy)" : ""}  — ${Object.keys(p.formats || {}).join(", ")}`;
    })
    .join("\n");
  return `Stencil — one asset engine with brand packs.

usage: node stencil.mjs <format> [<name>...] [--brand <id>] [format flags]
       node stencil.mjs <format> --help

formats:
${formats}

brands:
${brands}

workspace: ${WORKSPACE}`;
}

/* Values that follow a flag, so they are not mistaken for input names. */
const VALUE_FLAGS = new Set(["--brand", "--count", "--speakers", "--formats", "--format", "--slides", "-o", "-c"]);

function inputNames(args) {
  const names = [];
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i])) i++;
    else if (!args[i].startsWith("-")) names.push(args[i]);
  }
  return names;
}

export async function run(argv) {
  const [format, ...args] = argv;
  if (!format || format === "--help" || format === "-h") {
    console.log(usage());
    return 0;
  }
  if (!FORMATS[format]) {
    console.error(`unknown format "${format}"\n\n${usage()}`);
    return 2;
  }
  const mod = await loadFormat(format);
  if (!mod) {
    console.error(`the ${format} format is not ported yet — use ${FORMATS[format].forks.join(" or ")} for now`);
    return 2;
  }
  const clashes = inputNames(args).map((n) => nameClash(format, n)).filter(Boolean);
  if (clashes.length) {
    for (const c of clashes) console.error(`  ✖ ${c}`);
    return 2;
  }
  const code = await mod.main(args);
  return typeof code === "number" ? code : process.exitCode || 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2));
}
