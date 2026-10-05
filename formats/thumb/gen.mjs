/**
 * Thumb format: the 2560x1440 podcast thumbnail (from podcast-thumbnails/gen.mjs and
 * iu-podcast-thumbnails/gen.mjs).
 *
 * Reads episodes/<name>.toml, normalizes it with its brand's design into .gen/<name>.json,
 * then renders the layered canva/<PREFIX>-<name>.svg (the Canva-editable copy) and
 * preview/<name>.png (a Chrome capture of the design's template at 2x).
 *
 *   node stencil.mjs thumb                        build every episodes/*.toml
 *   node stencil.mjs thumb <name>                 build one episode (e.g. ep148)
 *   node stencil.mjs thumb <name> --speakers N    force N tiles or cards ("?" fills the gaps)
 *   node stencil.mjs thumb <name> --svg-only      skip the PNG render, keep the SVG
 *   node stencil.mjs thumb <name> --brand <id>    render with another brand pack
 *   node stencil.mjs thumb --list [--json]        list episodes, guests, photo status
 *   node stencil.mjs thumb <name> --emit-json     normalize to .gen/<name>.json only
 *   node stencil.mjs thumb --watch                rebuild on change
 *
 * The two forks were two designs, not one design with two sets of values. A brand picks
 * one by name in formats.thumb.layout (classic: the OBA design; cards: the IU v3 design)
 * and gives, in formats.thumb.options, the SVG name prefix and, for cards, the ground
 * (`mode`: dark or light). No code here tests a brand id; neither fork's sidecar carried a
 * brand object, so none is passed to the designs either.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseToml } from "../../core/toml.mjs";
import { CONTRACT } from "../../core/contract.mjs";
import { GEN, PREVIEW, WORKSPACE, inputDir, poolDirs } from "../../core/paths.mjs";
import { resolvePhoto as resolvePoolPhoto } from "../../core/assets.mjs";
import { brandIds, brandsFor, hasBrand, normalizeBrandId, layoutFor, formatOptions } from "../../core/brands.mjs";
import { render } from "./render-png.mjs";
import * as classic from "./layouts/classic/index.mjs";
import * as cards from "./layouts/cards/index.mjs";

const EPISODES_DIR = inputDir("thumb");
const DEFAULT_BRAND = "IU";

/* The two designs (from the two forks); a brand names one in formats.thumb.layout.
     classic  title column, headshot rail, waveform footer (podcast-thumbnails)
     cards    portrait cards with labels, arc field, petal mark, dark or light ground
              (iu-podcast-thumbnails v3) */
export const LAYOUTS = { classic, cards };

const thumbBrands = () => brandsFor("thumb").filter((id) => LAYOUTS[layoutFor(id, "thumb")]);

const HELP = () => `Podcast thumbnail generator (2560x1440)

Usage:
  node stencil.mjs thumb                      build every episodes/*.toml
  node stencil.mjs thumb <name>               build one episode (e.g. ep148)
  node stencil.mjs thumb <name> --speakers N  force N tiles or cards ("?" placeholders fill the gaps)
  node stencil.mjs thumb <name> --brand <id>  render with another brand pack (beats the file's brand)
  node stencil.mjs thumb --list               list episodes, guests, photo status
  node stencil.mjs thumb --list --json        same data as machine-readable JSON (GUI/agents)
  node stencil.mjs thumb <name> --emit-json   normalize to .gen/<name>.json only, no render
  node stencil.mjs thumb --watch              rebuild on file changes
  node stencil.mjs thumb --svg-only           skip the PNG render

Brands: ${thumbBrands().map((id) => `${id} (${layoutFor(id, "thumb")}${formatOptions(id, "thumb").mode ? `, ${formatOptions(id, "thumb").mode}` : ""})`).join(", ")}; default ${DEFAULT_BRAND}.
A cards episode may still set mode = "dark" | "light"; --brand overrides it.

Outputs:
  canva/<PREFIX>-<name>.svg   layered SVG for Canva (editable; OBA- or IU-)
  preview/<name>.png          2560x1440 final PNG (rendered with real Chrome)
  .gen/<name>.json            the normalized config both renderers read
`;

function parseArgs(argv) {
  const args = {
    names: [],
    speakers: null,
    list: false,
    json: false,
    emitJson: false,
    watch: false,
    svgOnly: false,
    help: false,
    brand: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = true;
    else if (a === "--json") args.json = true;
    else if (a === "--emit-json") args.emitJson = true;
    else if (a === "--watch") args.watch = true;
    else if (a === "--svg-only") args.svgOnly = true;
    else if (a === "--speakers") args.speakers = parseInt(argv[++i], 10);
    else if (a === "--brand") args.brand = argv[++i] ?? "";
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("-")) return { usage: `Unknown flag: ${a}` };
    else args.names.push(a);
  }
  if (argv.includes("--brand") && !args.brand) return { usage: "--brand needs a brand id" };
  if (args.speakers !== null && (Number.isNaN(args.speakers) || args.speakers < 1))
    return { error: "--speakers must be a positive integer" };
  return args;
}

function episodeFiles() {
  if (!fs.existsSync(EPISODES_DIR)) return [];
  return fs
    .readdirSync(EPISODES_DIR)
    .filter((f) => f.endsWith(".toml") && !f.startsWith("_"))
    .sort();
}

const stem = (f) => f.replace(/\.toml$/, "");

/**
 * The design an episode renders with: --brand, else the file's brand, else IU. Returns
 * { brandId, layout, design, options } or { problem }.
 */
function designFor(raw, opts) {
  const asked = opts.brand || raw.brand || DEFAULT_BRAND;
  const brandId = normalizeBrandId(asked);
  if (!hasBrand(brandId)) return { problem: `unknown brand "${asked}" (have: ${brandIds().join(", ")})` };
  let layout;
  let options;
  try {
    layout = layoutFor(brandId, "thumb");
    options = formatOptions(brandId, "thumb");
  } catch (e) {
    return { problem: e.message };
  }
  const design = LAYOUTS[layout];
  if (!design) return { problem: `brand ${brandId} names the thumb design "${layout}", which does not exist (have: ${Object.keys(LAYOUTS).join(", ")})` };
  /* The prefix is pack data and the frozen SVG name; the moved twin writes its own, so the
     two must agree rather than silently produce a file the contract does not name. */
  if (options.prefix !== design.svgPrefix) {
    return { problem: `brand ${brandId}: formats.thumb.options.prefix is ${JSON.stringify(options.prefix)}, but the ${layout} design writes canva/${design.svgPrefix}-<name>.svg` };
  }
  return { brandId, layout, design, options };
}

/* What a design's normalize receives: the fork's --speakers, plus the pack's options and
   whether --brand forced the brand (the cards ground rule reads both). */
const designOpts = (d, opts) => ({ speakers: opts.speakers ?? undefined, options: d.options, brandForced: Boolean(opts.brand) });

/** Structured normalize for --list --json and --emit-json: { cfg, problems, warnings, ...design }. */
function normalizeEpisode(raw, name, opts) {
  const d = designFor(raw, opts);
  if (d.problem) return { cfg: null, problems: [d.problem], warnings: [] };
  return { ...d, ...d.design.normalizeResult(raw, name, designOpts(d, opts)) };
}

function loadEpisode(name) {
  const file = path.join(EPISODES_DIR, `${name}.toml`);
  if (!fs.existsSync(file)) throw Object.assign(new Error(`no episode file at ${file}`), { missing: true });
  return parseToml(fs.readFileSync(file, "utf8"));
}

function writeNormalized(name, cfg) {
  fs.mkdirSync(GEN, { recursive: true });
  const file = path.join(GEN, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  return file;
}

async function buildEpisode(name, opts) {
  const parsed = loadEpisode(name);
  const d = designFor(parsed, opts);
  if (d.problem) {
    console.error(`gen: ${name}.toml is not valid:`);
    console.error(`  - ${d.problem}`);
    return false;
  }
  const cfg = d.design.normalize(parsed, name, designOpts(d, opts));
  if (!cfg) return false;
  const jsonFile = writeNormalized(name, cfg);

  const photoCount = cfg.guests.filter((g) => g.img).length;
  const placeholderCount = cfg.guests.filter((g) => g.placeholder).length;
  console.log(`→ ${name}${cfg.mode ? ` [${cfg.mode}]` : ""}: ${cfg.guests.length} ${d.design.unit}(s), ${photoCount} photo(s)` +
    (placeholderCount ? `, ${placeholderCount} placeholder(s)` : ""));

  /* The layered SVG is the Canva-editable artifact — always produced. */
  if (!d.design.buildSvg(jsonFile)) {
    console.error(`gen: ${name}: the ${d.layout} SVG renderer failed`);
    return false;
  }
  const [svgRel, pngRel] = CONTRACT.thumb(name, { prefix: d.options.prefix });
  if (!opts.svgOnly) {
    try {
      await render(cfg, PREVIEW, await d.design.pngTemplate(), { agree: d.design.pngAgreement ?? 1 });
    } catch (e) {
      console.error(`gen: ${name}: PNG render failed (${e.message || e}); ${svgRel} was still produced`);
      return false;
    }
  }
  console.log(`✓ ${name} → ${svgRel}` + (opts.svgOnly ? "" : ` + ${pngRel}`));
  return true;
}

function listEpisodes() {
  const files = episodeFiles();
  if (files.length === 0) {
    console.log("No episodes yet. Copy episodes/_template.toml (IU) or _template-oba.toml and fill it in.");
    return;
  }
  console.log("Episodes in episodes/ (drop photos into assets/headshots/):\n");
  for (const f of files) {
    const name = stem(f);
    let parsed;
    try {
      parsed = parseToml(fs.readFileSync(path.join(EPISODES_DIR, f), "utf8"));
    } catch (e) {
      console.log(`  ${name.padEnd(14)} ✗ invalid TOML — ${e.message}`);
      continue;
    }
    const d = designFor(parsed, {});
    const guests = Array.isArray(parsed.guests) ? parsed.guests : [];
    const target = parsed.speakers ?? guests.length;
    const withPhotos = guests.filter((g) => g.photo).length;
    const brand = d.problem ? "?" : d.brandId;
    const layout = d.problem ? d.problem : d.design.listLabel(target);
    console.log(
      `  ${name.padEnd(14)} ${brand.padEnd(9)} ${String(guests.length).padStart(2)} guest(s)  layout: ${layout.padEnd(16)} photos: ${withPhotos}/${guests.length}`,
    );
  }
  console.log("\nGenerate with: node stencil.mjs thumb");
}

/* --- machine-readable inventory (--list --json / --emit-json) ------------
   Stable shape — see panel-kit/docs/CONTRACT.md §2. Never scraped from human text.
   `mode` is the cards ground (the IU fork's key); null for the classic design. */
function listOutputs(name, prefixes) {
  const out = [];
  for (const prefix of prefixes) {
    for (const rel of CONTRACT.thumb(name, { prefix })) {
      if (fs.existsSync(path.join(WORKSPACE, rel)) && !out.includes(rel)) out.push(rel);
    }
  }
  return out;
}

const allPrefixes = () => [...new Set(thumbBrands().map((id) => formatOptions(id, "thumb").prefix))];

function inventory(name) {
  let parsed;
  try {
    parsed = loadEpisode(name);
  } catch (e) {
    return { name, title: null, mode: null, ok: false, problems: [{ line: e.line ?? null, message: e.message }], warnings: [], assets: { headshots: [], qrs: [], logos: [] }, outputs: listOutputs(name, allPrefixes()) };
  }
  const n = normalizeEpisode(parsed, name, {});
  const guests = Array.isArray(parsed.guests) ? parsed.guests : [];
  const resolve = n.design ? n.design.resolvePhoto : (photo) => resolvePoolPhoto(photo);
  return {
    name,
    title: parsed.eyebrow ? String(parsed.eyebrow).trim() : null,
    mode: n.design && n.design.themeOf ? n.design.themeOf(parsed, designOpts(n, {})) : null,
    ok: n.problems.length === 0,
    problems: n.problems.map((p) => ({ line: null, message: p })),
    warnings: n.warnings,
    assets: {
      headshots: guests.filter((g) => g.photo).map((g) => ({ ref: String(g.photo), resolved: !!resolve(g.photo, name, true) })),
      qrs: [],
      logos: [],
    },
    outputs: listOutputs(name, n.options ? [n.options.prefix] : allPrefixes()),
  };
}

function listJson() {
  const items = episodeFiles().map((f) => inventory(stem(f)));
  process.stdout.write(JSON.stringify({ tool: "thumb", configDir: "episodes", items }, null, 2) + "\n");
}

/** Normalize + write .gen/<name>.json, no rendering. Exit code = validation. */
function emitJson(names, opts) {
  const targets = names.length ? names : episodeFiles().map(stem);
  const results = [];
  let ok = true;
  for (const name of targets) {
    let parsed;
    try {
      parsed = loadEpisode(name);
    } catch (e) {
      results.push({ name, ok: false, problems: [{ line: e.line ?? null, message: e.message }] });
      ok = false;
      continue;
    }
    const { cfg, problems, warnings } = normalizeEpisode(parsed, name, opts);
    if (problems.length) {
      results.push({ name, ok: false, problems: problems.map((p) => ({ line: null, message: p })), warnings });
      ok = false;
      continue;
    }
    const jsonFile = writeNormalized(name, cfg);
    results.push({ name, ok: true, genPath: path.relative(WORKSPACE, jsonFile), warnings });
  }
  process.stdout.write(JSON.stringify({ tool: "thumb", results }, null, 2) + "\n");
  return ok;
}

async function buildAll(names, opts) {
  let ok = true;
  for (const name of names) {
    try {
      if (!(await buildEpisode(name, opts))) ok = false;
    } catch (e) {
      console.error(`gen: ${name}: ${e.message || e}`);
      ok = false;
    }
  }
  return ok;
}

function watchLoop(opts) {
  console.log("Watching episodes/ and the headshot pools … (Ctrl+C to stop)");
  let timer = null;
  let running = Promise.resolve();
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      running = running.then(() => {
        console.log("\nChange detected — rebuilding all episodes…");
        return buildAll(episodeFiles().map(stem), opts);
      });
    }, 300);
  };
  for (const dir of [EPISODES_DIR, ...poolDirs("headshots")]) {
    if (fs.existsSync(dir)) fs.watch(dir, { persistent: true }, rebuild);
  }
  return new Promise(() => {});
}

/* --- main ---------------------------------------------------------------- */
export async function main(argv) {
  const args = parseArgs(argv);
  if (args.usage) {
    console.error(`${args.usage}\n\n${HELP()}`);
    return 2;
  }
  if (args.error) {
    console.error(`gen: ${args.error}`);
    return 1;
  }
  if (args.help) {
    console.log(HELP());
    return 0;
  }
  if (args.emitJson) return emitJson(args.names, args) ? 0 : 1;
  if (args.list) {
    if (args.json) listJson();
    else listEpisodes();
    return 0;
  }
  if (args.watch) return watchLoop(args);

  const names = args.names.length ? args.names : episodeFiles().map(stem);
  if (names.length === 0) {
    console.log(HELP());
    return 0;
  }
  return (await buildAll(names, args)) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
