/**
 * Banner format: the 640x200 Zoom banner (from zoom-banner/gen.mjs and iu-zoom-banner/gen.mjs).
 *
 * Reads panels/<name>.toml, normalizes and validates it into .gen/<name>.json, then
 * renders the layered canva/<stem>.svg (the Canva-editable sibling) and out/<stem>.png
 * at exactly 640x200, plus the out/<stem>@3x.png capture it is downscaled from.
 *
 *   node stencil.mjs banner                      build every panels/*.toml
 *   node stencil.mjs banner <name>               build one panel
 *   node stencil.mjs banner <name> --count N     force N tiles (extras render as "?")
 *   node stencil.mjs banner <name> --svg-only    skip the PNG render, keep the SVG
 *   node stencil.mjs banner <name> --brand <id>  render with another brand pack
 *   node stencil.mjs banner --list [--json]      list panels, panelists, photo status
 *   node stencil.mjs banner <name> --emit-json   normalize to .gen/<name>.json only
 *   node stencil.mjs banner --watch              rebuild on change
 *
 * The two forks differed only in brand defaults and IU's required CE line. Both are pack
 * data now (`formats.banner.options` in brands/iu*.mjs), so no code here tests a brand id.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseToml } from "../../core/toml.mjs";
import { MAX_PANELISTS, ROLE_MAX_CHARS } from "./geometry.mjs";
import { render } from "./render-png.mjs";
import { ROOT, GEN, OUT, WORKSPACE, inputDir } from "../../core/paths.mjs";
import { resolveAsset } from "../../core/assets.mjs";
import { brandIds, hasBrand, normalizeBrandId, layoutFor, resolveBrand, formatOptions, pick, logoDataUri } from "../../core/brands.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PANELS_DIR = inputDir("banner");
const DEFAULT_BRAND = "IU";

/* The brand keys each design's template and twin read (plan AD-2): the keys of the
   registry its fork shipped, plus `strip`, the banner's own values. */
const CENTRE_KEYS = ["id", "label", "wordmark", "logo", "gradient", "glow", "ink", "inkOnAccent", "accent", "inkSoft", "dim", "textMuted", "textFaint", "pillBg", "tileFill", "line", "qrGold", "strip"];
const CORNER_KEYS = ["id", "label", "wordmark", "logo", "logoH", "gradient", "glow", "dots", "ink", "inkOnAccent", "accent", "inkSoft", "dim", "textMuted", "textFaint", "pillBg", "tileFill", "tileFrame", "monoText", "line", "qrGold", "titleText", "wordmarkColor", "wave", "qrCaption", "qrFrame", "qrStroke", "scrim", "cePlate", "ceSeal", "ceInk", "arc", "arcOpacity", "strip"];

/* Two banner designs (from the two forks), each brand-neutral: a brand picks one by
   name in formats.banner.layout and supplies its colours in formats.banner.tokens.
     strip-centre  top-centre lobe, dots, bottom-up scrim (the OBA design)
     strip-corner  corner glow lobes, arc field, brand scrim, PACE plate and CE stamp
                   for panels with a CE line (the IU design) */
export const LAYOUTS = {
  "strip-centre": { dir: path.join(HERE, "layouts", "strip-centre"), brandKeys: CENTRE_KEYS, ce: false },
  "strip-corner": { dir: path.join(HERE, "layouts", "strip-corner"), brandKeys: CORNER_KEYS, ce: true },
};
const templateOf = (layout) => path.join(LAYOUTS[layout].dir, "template.html");
const twinOf = (layout) => path.join(LAYOUTS[layout].dir, "render-svg.mjs");

/* --- photo resolution ----------------------------------------------------
   data: URI passthrough -> absolute path -> the workspace and repo headshot pools ->
   a path relative to the workspace. Missing photos warn and fall back to a
   monogram; they never fail the build. */
function resolvePhoto(photo, warnings) {
  if (!photo) return "";
  const p = String(photo).trim();
  if (!p) return "";
  if (p.startsWith("data:")) return p;
  const hit = resolveAsset(p, "headshots");
  if (hit) return `file://${hit}`;
  warnings.push(`photo not found: "${p}" (looked in headshots/ and the workspace pool)`);
  return "";
}

/* --- normalize + validate ------------------------------------------------ */

/* Keys the first version rendered, and where their content went. The banner
   renders 1:1 at 640x200, so everything it used to show below ~11px was
   decoration; these were removed to buy legible room for names and roles.
   Warn rather than silently drop, so migrating a panel file says what moved. */
const REMOVED_KEYS = {
  series: 'replaced by the OBA logo + "eyebrow" (put the series name there)',
  subtitle: 'fold the essential part into "title", or drop it',
  incentive: "a 9-word line does not fit above the 11px legibility floor",
  cta: "a painted-on button is not clickable; the real one lives on the page",
  live: "the LIVE pill rendered at 7px, which nobody could read",
};

/**
 * Structured core of validation: returns { cfg, problems, warnings } and never
 * prints. normalize() below keeps the CLI's console behaviour on top of it;
 * --list --json and --emit-json consume this directly.
 */
function normalizeResult(raw, base, opts = {}) {
  const problems = [];
  const warnings = [];

  const title = String(raw.title || "").trim();
  if (!title) problems.push('missing "title"');

  for (const [key, note] of Object.entries(REMOVED_KEYS)) {
    if (raw[key] !== undefined) warnings.push(`"${key}" is no longer used — ${note}`);
  }

  const brandId = normalizeBrandId(opts.brand || raw.brand || DEFAULT_BRAND);
  let layout = "";
  let options = {};
  if (!hasBrand(brandId)) {
    problems.push(`unknown brand "${opts.brand || raw.brand}" (have: ${brandIds().join(", ")})`);
  } else {
    try {
      layout = layoutFor(brandId, "banner");
      options = formatOptions(brandId, "banner");
    } catch (e) {
      problems.push(e.message);
    }
  }

  const ce = raw.ce || raw["event.ce"] || (raw.event && raw.event.ce) || "";
  if (options.requireCe && !String(ce).trim()) {
    problems.push(`"ce" is required for ${brandId} (e.g. ce = "1 CE credit") — every IU panel carries the PACE mark and CE stamp`);
  }

  const list = Array.isArray(raw.panelists) ? raw.panelists : [];
  if (list.length > MAX_PANELISTS) {
    problems.push(
      `${list.length} panelists, but a banner holds at most ${MAX_PANELISTS} — ` +
        `drop ${list.length - MAX_PANELISTS} or split the panel`
    );
  }
  if (!list.length) problems.push("no [[panelists]] blocks — a banner needs at least 1");

  const panelists = list.map((p, i) => {
    const name = String(p.name || "").trim();
    const role = String(p.role || "").trim();
    if (!name) problems.push(`panelist #${i + 1} has no "name"`);
    if (role.length > ROLE_MAX_CHARS) {
      warnings.push(
        `role for ${name || `#${i + 1}`} is ${role.length} chars — over ${ROLE_MAX_CHARS} ` +
          `it stops fitting two lines and will clip; shorten it`
      );
    }
    return { name, role, img: resolvePhoto(p.photo, warnings) };
  });

  /* --count N pads the row with placeholders so you can preview the full
     panel before every seat is filled. */
  const forced = Number(opts.count) || 0;
  if (forced) {
    if (forced < 1 || forced > MAX_PANELISTS) {
      problems.push(`--count must be 1..${MAX_PANELISTS} (got ${forced})`);
    } else {
      while (panelists.length < forced) panelists.push({ name: "", role: "", img: "", placeholder: true });
      panelists.length = forced;
    }
  }

  if (problems.length) return { cfg: null, problems, warnings };

  const cfg = {
    output: String(raw.output || base).replace(/\.png$/i, ""),
    brand: pick(resolveBrand(brandId, "banner"), LAYOUTS[layout].brandKeys),
    brandId,
    logo: logoDataUri(brandId, "banner"),
    eyebrow: String(raw.eyebrow ?? (options.eyebrow || "Expert Panel Webinar Series")).trim(),
    date: String(raw.date || "").trim(),
    title,
    panelists,
  };
  if (LAYOUTS[layout].ce) cfg.ce = String(ce).trim();
  return { cfg, layout, problems, warnings };
}

/** CLI wrapper: prints problems/warnings and returns { cfg, layout } or null. */
function normalize(raw, base, opts = {}) {
  const { cfg, layout, problems, warnings } = normalizeResult(raw, base, opts);
  if (problems.length) {
    console.error(`\n${base}.toml — cannot build:`);
    for (const p of problems) console.error(`  • ${p}`);
    return null;
  }
  for (const w of warnings) console.warn(`  ! ${base}: ${w}`);
  return { cfg, layout };
}

/* --- io helpers ---------------------------------------------------------- */
function panelFiles() {
  if (!fs.existsSync(PANELS_DIR)) return [];
  return fs
    .readdirSync(PANELS_DIR)
    .filter((f) => f.endsWith(".toml") && !f.startsWith("_"))
    .sort();
}

function loadPanel(base) {
  const file = path.join(PANELS_DIR, `${base}.toml`);
  if (!fs.existsSync(file)) throw new Error(`no such panel: panels/${base}.toml`);
  return parseToml(fs.readFileSync(file, "utf8"));
}

/* Run a renderer script synchronously, inheriting stdout so its warnings
   (shortened roles, monogram fallbacks) stay visible in the build log. */
function runRenderer(cmd, args, name, { required }) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (res.status !== 0) {
    if (required) {
      console.error(`  fail ${name}: "${cmd} ${args.join(" ")}" failed (status ${res.status})`);
    } else {
      console.warn(`  [${name}] ${path.basename(cmd)} failed — SVG was still produced (status ${res.status})`);
    }
  }
  return res.status === 0;
}

async function build(base, opts) {
  const norm = normalize(loadPanel(base), base, opts);
  if (!norm) return false;
  const { cfg, layout } = norm;

  fs.mkdirSync(GEN, { recursive: true });
  const genPath = path.join(GEN, `${base}.json`);
  fs.writeFileSync(genPath, JSON.stringify(cfg, null, 2));

  /* The layered SVG is the Canva-editable artifact — always produced. */
  const svgOk = runRenderer(process.execPath, [twinOf(layout), "-c", genPath], base, { required: true });
  if (!svgOk) return false;

  if (opts.svgOnly) {
    console.log(`  ok   ${base}  (${cfg.panelists.length} panelist${cfg.panelists.length === 1 ? "" : "s"}) — SVG only`);
    return true;
  }

  try {
    const { finalPath } = await render(cfg, OUT, templateOf(layout));
    console.log(`  ok   ${path.relative(WORKSPACE, finalPath)}  (${cfg.panelists.length} panelist${cfg.panelists.length === 1 ? "" : "s"})`);
    return true;
  } catch (err) {
    console.error(`  fail ${base}: ${err.message || err} (SVG was still produced in canva/)`);
    return false;
  }
}

function list() {
  const files = panelFiles();
  if (!files.length) {
    console.log("no panels yet — copy panels/_template.toml to panels/<name>.toml");
    return;
  }
  for (const f of files) {
    const base = f.replace(/\.toml$/, "");
    let raw;
    try {
      raw = parseToml(fs.readFileSync(path.join(PANELS_DIR, f), "utf8"));
    } catch (e) {
      console.log(`${base}\n  ! ${e.message}`);
      continue;
    }
    const ps = Array.isArray(raw.panelists) ? raw.panelists : [];
    console.log(`${base}  (${ps.length}/${MAX_PANELISTS} panelists, ${normalizeBrandId(raw.brand || DEFAULT_BRAND)})`);
    for (const p of ps) {
      const found = p.photo && resolvePhoto(p.photo, []) ? "photo" : "monogram";
      console.log(`    - ${p.name || "(unnamed)"}  [${found}]`);
    }
  }
}

/* --- machine-readable inventory (--list --json) --------------------------
   The data the GUI/agents need, never scraped from the human --list text.
   Stable shape — see panel-kit/docs/CONTRACT.md §2. */
function outputStem(raw, base) {
  return String(raw.output || base).replace(/\.png$/i, "");
}

function listOutputs(base, stem) {
  const out = [];
  for (const rel of [`out/${stem}.png`, `out/${stem}@3x.png`, `canva/${stem}.svg`, `.gen/${base}.json`]) {
    if (fs.existsSync(path.join(WORKSPACE, rel))) out.push(rel);
  }
  return out;
}

function inventory(base) {
  let raw;
  try {
    raw = loadPanel(base);
  } catch (e) {
    return { name: base, title: null, ok: false, problems: [{ line: null, message: e.message }], warnings: [], assets: { headshots: [], qrs: [], logos: [] }, outputs: [] };
  }
  const { problems, warnings } = normalizeResult(raw, base, {});
  const ps = Array.isArray(raw.panelists) ? raw.panelists : [];
  return {
    name: base,
    title: String(raw.title || "").trim() || null,
    ok: problems.length === 0,
    problems: problems.map((p) => ({ line: null, message: p })),
    warnings,
    assets: {
      headshots: ps
        .filter((p) => p.photo)
        .map((p) => ({ ref: String(p.photo), resolved: !!resolvePhoto(p.photo, []) })),
      qrs: [],
      logos: [],
    },
    outputs: listOutputs(base, outputStem(raw, base)),
  };
}

function listJson() {
  const items = panelFiles().map((f) => inventory(f.replace(/\.toml$/, "")));
  process.stdout.write(JSON.stringify({ tool: "banner", configDir: "panels", items }, null, 2) + "\n");
}

/** Normalize + write .gen/<name>.json, no rendering. Exit code = validation. */
async function emitJson(targets, opts) {
  const names = targets.length ? targets : panelFiles().map((f) => f.replace(/\.toml$/, ""));
  const results = [];
  let ok = true;
  for (const base of names) {
    let raw;
    try {
      raw = loadPanel(base);
    } catch (e) {
      results.push({ name: base, ok: false, problems: [{ line: null, message: e.message }] });
      ok = false;
      continue;
    }
    const { cfg, problems, warnings } = normalizeResult(raw, base, opts);
    if (problems.length) {
      results.push({ name: base, ok: false, problems: problems.map((p) => ({ line: null, message: p })), warnings });
      ok = false;
      continue;
    }
    fs.mkdirSync(GEN, { recursive: true });
    const genPath = path.join(GEN, `${base}.json`);
    fs.writeFileSync(genPath, JSON.stringify(cfg, null, 2));
    results.push({ name: base, ok: true, genPath: path.relative(WORKSPACE, genPath), warnings });
  }
  process.stdout.write(JSON.stringify({ tool: "banner", results }, null, 2) + "\n");
  return ok;
}

const HELP = `usage: node stencil.mjs banner [<name>...] [--count N] [--svg-only] [--brand <id>]
       node stencil.mjs banner --list [--json] | <name> --emit-json | --watch

Inputs: panels/<name>.toml (copy panels/_template.toml). Brands: ${brandIds().join(", ")}.`;

/* --- main ---------------------------------------------------------------- */
export async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  if (flags.has("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  const positional = [];
  const opts = { count: 0, svgOnly: flags.has("--svg-only"), brand: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count") opts.count = Number(argv[++i]);
    else if (argv[i] === "--brand") opts.brand = String(argv[++i]);
    else if (!argv[i].startsWith("--")) positional.push(argv[i]);
  }

  async function buildAll() {
    const targets = positional.length ? positional : panelFiles().map((f) => f.replace(/\.toml$/, ""));
    if (!targets.length) {
      console.log("no panels yet — copy panels/_template.toml to panels/<name>.toml");
      return true;
    }
    let ok = true;
    for (const t of targets) {
      try {
        if (!(await build(t, opts))) ok = false;
      } catch (e) {
        console.error(`  fail ${t}: ${e.message || e}`);
        ok = false;
      }
    }
    return ok;
  }

  if (flags.has("--emit-json")) return (await emitJson(positional, opts)) ? 0 : 1;
  if (flags.has("--list")) {
    if (flags.has("--json")) listJson();
    else list();
    return 0;
  }
  if (flags.has("--watch")) {
    console.log("watching panels/ and the banner templates — ctrl-c to stop");
    await buildAll();
    let timer = null;
    const rebuild = () => {
      clearTimeout(timer);
      timer = setTimeout(() => buildAll().catch((e) => console.error(e)), 300);
    };
    fs.watch(PANELS_DIR, rebuild);
    for (const l of Object.keys(LAYOUTS)) fs.watch(templateOf(l), rebuild);
    return new Promise(() => {});
  }
  return (await buildAll()) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
