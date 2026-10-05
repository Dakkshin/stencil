/**
 * Social format: panel social posts (from panel-social-posts/gen.mjs and
 * iu-panel-social-posts/gen.mjs).
 *
 * Reads posts/<name>.toml and the panelist profiles in assets/panelists/, normalizes them
 * into .gen/*.json, and renders every requested format as a layered, Canva-ready SVG and
 * a retina PNG drawn by real Chrome:
 *
 *   canva/<stem>-<format>.svg and out/<stem>-<format>@2x.png, or with a campaign
 *   canva|out/<campaign>/<person or "shared">/<format>/<stem>.svg|@2x.png
 *
 *   node stencil.mjs social                         build every posts/*.toml
 *   node stencil.mjs social <name>                  build one post
 *   node stencil.mjs social --list [--json]         list posts, panelists, photo status
 *   node stencil.mjs social <name> --emit-json      normalize to .gen/*.json only, no render
 *   node stencil.mjs social --watch                 rebuild on change
 *   node stencil.mjs social --svg-only              skip the PNG render
 *   node stencil.mjs social --no-cutout             skip background removal on speaker cards
 *   node stencil.mjs social --force-cutout          regenerate cutouts even if cached
 *   node stencil.mjs social --formats square,story  only these formats
 *   node stencil.mjs social --brand <id>            render with another brand pack
 *
 * The two forks shared this file almost line for line. What differed is now a rule of the
 * layout a brand picks (formats.social.layout in brands/*.mjs), never a test of a brand id:
 * which formats a post gets by default, which the design can draw, whether the CE line is
 * required, how the sidecar is named, and who makes the speaker cutouts (LAYOUTS below).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseToml } from "../../core/toml.mjs";
import { ROOT, GEN, WORKSPACE, inputDir, poolDirs } from "../../core/paths.mjs";
import { resolveAsset } from "../../core/assets.mjs";
import { brandsFor, layoutFor, normalizeBrandId } from "../../core/brands.mjs";
import { CONTRACT } from "../../core/contract.mjs";
import { FORMAT_ORDER, POST_TYPES } from "./geometry.mjs";
import { ensureCutout, isCutout } from "./cutout.mjs";
import { resolvePostQr, qrRef } from "./qr.mjs";
import { lintCopy } from "./layouts/scene/copy-lint.mjs";
import { SUPPORTED_FORMATS as SCENE_FORMATS } from "./layouts/scene/tokens.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = inputDir("social");
const DEFAULT_BRAND = "IU";

/* The two social designs (one per fork), each brand-neutral: a brand names one in
   formats.social.layout. Each keeps the normalize rules its fork shipped.
     classic  HTML templates screenshotted for the PNG, a hand-mirrored SVG twin (the OBA design)
     scene    one scene graph writes the SVG and Chrome rasterises that SVG (the IU design)
   drawn          the canvases the design can draw (others are skipped with a warning)
   defaultFormats what a post gets when it names none
   ce             the CE line is required and carried in the sidecar; the scene's own
                  accreditation check refuses a card without its PACE plate and CE seal
   sidecar        "stem": .gen/<output stem>.json, so posts sharing an output_name share a
                  sidecar (the classic fork's naming, kept for its goldens); "post":
                  .gen/<post name>.json (the scene fork's fix for that overwrite)
   cutouts        "frame": gen frames a cutout for each speaker_promo photo before
                  rendering; "renderer": the scene cuts every photo out itself and gen only
                  records whether it may (cfg.cutout)
   lint           warn on the copy the IU copy prompt forbids */
export const LAYOUTS = {
  classic: {
    dir: path.join(HERE, "layouts", "classic"),
    drawn: FORMAT_ORDER,
    defaultFormats: (postType) => (postType === "speaker_promo" ? ["square"] : FORMAT_ORDER),
    ce: false,
    sidecar: "stem",
    cutouts: "frame",
    lint: false,
    eyebrowExample: "OBA · Expert Panel",
  },
  scene: {
    dir: path.join(HERE, "layouts", "scene"),
    drawn: SCENE_FORMATS,
    defaultFormats: () => ["square", "portrait"],
    ce: true,
    sidecar: "post",
    cutouts: "renderer",
    lint: true,
    eyebrowExample: "Insurance Untangled · Live",
  },
};
const twinOf = (layout) => path.join(LAYOUTS[layout].dir, "render-svg.mjs");
const pngRendererOf = (layout) => import(pathToFileURL(path.join(LAYOUTS[layout].dir, "render-png.mjs")).href);

const HELP = `Panel social post generator

Usage:
  node stencil.mjs social                      build every posts/*.toml
  node stencil.mjs social <name>               build one post (e.g. the_intro)
  node stencil.mjs social --list               list posts, panelists, photo status
  node stencil.mjs social --list --json        same data as machine-readable JSON (GUI/agents)
  node stencil.mjs social <name> --emit-json   normalize to .gen/<name>.json only, no render
  node stencil.mjs social --watch              rebuild on file changes
  node stencil.mjs social --svg-only           skip the PNG render
  node stencil.mjs social --no-cutout          skip auto background removal on speaker cards
  node stencil.mjs social --force-cutout       regenerate cutouts even if cached
  node stencil.mjs social --formats square,story   only these formats
  node stencil.mjs social --brand <id>         force a brand on every post (${brandsFor("social").join(", ")})

Outputs:
  canva/<name>-<format>.svg     layered SVG for Canva (editable)
  out/<name>-<format>@2x.png    retina PNG (rendered with real Chrome)
`;

class UsageError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const args = {
    names: [],
    list: false,
    json: false,
    emitJson: false,
    watch: false,
    svgOnly: false,
    help: false,
    formats: null,
    brand: null,
    noCutout: false,
    forceCutout: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--list") args.list = true;
    else if (a === "--json") args.json = true;
    else if (a === "--emit-json") args.emitJson = true;
    else if (a === "--watch") args.watch = true;
    else if (a === "--svg-only") args.svgOnly = true;
    else if (a === "--no-cutout") args.noCutout = true;
    else if (a === "--force-cutout") args.forceCutout = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--formats") {
      args.formats = String(argv[++i]).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--brand") {
      args.brand = normalizeBrandId(argv[++i]);
    } else if (a.startsWith("-")) {
      throw new UsageError(`Unknown flag: ${a}\n\n${HELP}`, 2);
    } else args.names.push(a);
  }
  if (args.formats && args.formats.some((f) => !FORMAT_ORDER.includes(f)))
    throw new UsageError(`gen: --formats must be a comma list of ${FORMAT_ORDER.join("|")}`, 1);
  if (args.brand && !brandsFor("social").includes(args.brand))
    throw new UsageError(`gen: --brand must be one of ${brandsFor("social").join("|")}`, 1);
  return args;
}

function postFiles() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith(".toml") && !f.startsWith("_"))
    .sort();
}

function loadPost(name) {
  const file = path.join(POSTS_DIR, `${name}.toml`);
  if (!fs.existsSync(file)) throw new Error(`no post file at ${file}`);
  return parseToml(fs.readFileSync(file, "utf8"));
}

/* Panelist profiles from the panelist pools (the workspace's, then the repo's), by stem. */
function loadPanelists() {
  const map = new Map();
  for (const dir of poolDirs("panelists")) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith(".toml")) continue;
      const stem = f.replace(/\.toml$/, "");
      if (!map.has(stem)) map.set(stem, parseToml(fs.readFileSync(path.join(dir, f), "utf8")));
    }
  }
  return map;
}

/* Resolve a photo reference to an absolute path (or ""). Search order, as in the forks:
   absolute/data URI -> the cutouts folder of each headshot pool (the fixed large portrait
   on speaker_promo wants a transparent PNG) -> the headshot pools -> relative. */
function resolvePhoto(photo, name, warnings = null) {
  if (!photo) return "";
  if (photo.startsWith("data:") || path.isAbsolute(photo)) return photo;
  const hit = resolveAsset(photo, "headshots", { local: poolDirs("headshots").map((d) => path.join(d, "cutouts")) });
  if (hit) return hit;
  const msg = `  [${name}] photo not found: ${photo} (monogram placeholder will render)`;
  if (warnings) warnings.push(msg);
  else console.warn(msg);
  return "";
}

/* Turn a parsed [[panelists]] block / profile into a normalized panelist. */
function normalizePanelist(raw, idx, problems, name, warnings) {
  if (!raw) return null;
  const key = `panelist #${idx + 1}`;
  if (!raw.name) problems.push(`${key} is missing "name"`);
  return {
    name: String(raw.name ?? ""),
    credentials: raw.credentials ? String(raw.credentials) : "",
    role: raw.role ? String(raw.role) : "",
    company: raw.company ? String(raw.company) : "",
    short: raw.short ? String(raw.short) : "",
    photo: raw.photo ? resolvePhoto(String(raw.photo), name, warnings) : "",
    quote: raw.quote ? String(raw.quote) : "",
  };
}

/* The brand a post renders with: --brand, else the file's brand, else the default. */
function brandOf(raw, opts) {
  return normalizeBrandId(opts.brand || raw.brand || DEFAULT_BRAND);
}

/**
 * Structured core: returns { cfg, layout, problems, warnings, brandError } and never prints.
 * normalize() below keeps the CLI's console behaviour; --list --json and --emit-json use this.
 */
function normalizeResult(raw, name, opts) {
  const problems = [];
  const warnings = [];
  const profiles = loadPanelists();
  const postType = raw.post_type ? String(raw.post_type).trim() : "";

  /* The brand picks the design, and the design carries the fork's rules, so it comes first. */
  const brand = brandOf(raw, opts);
  const known = brandsFor("social");
  const brandError = known.includes(brand) ? null : `gen: ${name}.toml uses unknown brand "${brand}" (known: ${known.join(", ")})`;
  const layout = layoutFor(brandError ? DEFAULT_BRAND : brand, "social");
  const rules = LAYOUTS[layout];
  if (!rules) throw new Error(`brand ${brand} picks the social layout "${layout}", which does not exist (have: ${Object.keys(LAYOUTS).join(", ")})`);

  if (postType && !POST_TYPES.includes(postType)) {
    warnings.push(`  [${name}] unknown post_type "${postType}" (known: ${POST_TYPES.join(" | ")}) — continuing`);
  }

  if (!raw.eyebrow) problems.push(`"eyebrow" is required (e.g. "${rules.eyebrowExample}")`);
  /* Copy lint (the IU copy prompt): warn on phrasing it forbids or that reads as
     machine-written. Warnings, not errors: a human decides. */
  if (rules.lint) {
    for (const h of lintCopy({
      title: raw.title, eyebrow: raw.eyebrow, category: raw.category, urgency: raw.urgency,
      cta: raw.event && raw.event.cta,
    })) warnings.push(`  [${name}] copy: ${h.field} "${h.text}" — ${h.why} (see the IU copy prompt)`);
  }
  /* The CE credit line is mandatory where the design carries the accreditation marks. An
     error, not a warning: every card carries the PACE mark and the CE stamp, and the stamp
     needs the count. A warning scrolled past and the post shipped with neither mark. */
  if (rules.ce && !(raw.event && raw.event.ce))
    problems.push(`"[event] ce" is required (e.g. ce = "1 CE credit") — every ${brand} event post carries the PACE mark and the CE stamp`);
  /* speaker_promo has no category footer row — the eyebrow carries the topic. */
  if (!raw.category && postType !== "speaker_promo")
    problems.push(`"category" is required (e.g. "Practice Growth · Leadership")`);
  if (!Array.isArray(raw.title) || raw.title.length === 0)
    problems.push(`"title" must be an array with at least one line`);

  /* Title lines -> fragments. A leading "~" marks the dim (second-tone) line. */
  const title = Array.isArray(raw.title)
    ? raw.title.map((line) => {
        const s = String(line);
        return { text: s.startsWith("~") ? s.slice(1) : s, br: true, dim: s.startsWith("~") };
      })
    : [];

  /* Panelists: string references (-> profiles) or inline blocks. TOML gotcha: keys after a
     table header belong to that table, so a panelists list written after [event] is
     hoisted back to the top level. */
  const rawRefs = Array.isArray(raw.panelists)
    ? raw.panelists
    : raw.event && Array.isArray(raw.event.panelists)
      ? raw.event.panelists
      : [];
  if (rawRefs.length === 0)
    problems.push(`no "panelists" entries — list profile names or inline [[panelists]] blocks`);
  const panelists = [];
  rawRefs.forEach((ref, i) => {
    if (typeof ref === "string") {
      const p = profiles.get(ref) || profiles.get(ref.toLowerCase().replace(/\s+/g, "-"));
      if (!p) {
        problems.push(`panelist "${ref}" has no assets/panelists/${ref}.toml profile`);
        return;
      }
      panelists.push(normalizePanelist(p, i, problems, name, warnings));
    } else if (ref && typeof ref === "object") {
      panelists.push(normalizePanelist(ref, i, problems, name, warnings));
    }
  });
  const real = panelists.filter(Boolean);
  if (real.length === 0)
    problems.push(`no valid panelists could be resolved — add profiles or inline blocks`);
  if (postType === "speaker_promo" && real.length !== 1)
    problems.push(`speaker_promo needs exactly one panelist (got ${real.length})`);

  if (problems.length) return { cfg: null, layout, rules, problems, warnings, brandError: null };
  if (brandError) return { cfg: null, layout, rules, problems, warnings, brandError };

  const formats = opts.formats || (Array.isArray(raw.formats) && raw.formats.length ? raw.formats : rules.defaultFormats(postType));

  /* campaign nests outputs (out/<campaign>/...), output_name sets the file stem
     (output_name = "The_Intro" with one panelist gives "The_Intro_<Name>"), and person
     nests one level deeper so a panelist's whole set lands together:
     out/<campaign>/<person>/<format>/<stem>@2x.png */
  const campaign = raw.campaign ? String(raw.campaign).trim() : "";
  const person = raw.person ? String(raw.person).trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") : "";
  let fileStem = name;
  if (raw.output_name) {
    const on = String(raw.output_name).trim();
    fileStem = on;
    if (real.length === 1 && (on === "The_Intro" || on.toLowerCase() === "the_intro")) {
      const p = real[0];
      const safe = p.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
      fileStem = `The_Intro_${safe}`;
    }
  }

  const countdown = raw.countdown || {};
  const event = raw.event || {};
  const ev = {
    name: event.name ? String(event.name) : "",
    date: event.date ? String(event.date) : "",
    time: event.time ? String(event.time) : "",
    website: event.website ? String(event.website) : "",
    cta: event.cta ? String(event.cta) : "",
  };
  if (rules.ce) ev.ce = String(event.ce); // required; rejected above when missing
  /* Supplied QR images only: an explicit event.qr wins (empty disables it); otherwise the
     post's promo stage picks the numbered image in the tracked person's QR folder. */
  ev.qr = resolvePostQr({
    event, person: raw.person, profile: typeof rawRefs[0] === "string" ? rawRefs[0] : "",
    panelists: real, postType, name, warnings,
  });

  return {
    cfg: {
      name: fileStem,
      fileStem,
      _sourceName: name,
      postType,
      brand,
      campaign,
      person,
      outputName: raw.output_name ? String(raw.output_name).trim() : "",
      formats: [...new Set(formats)].filter((f) => FORMAT_ORDER.includes(f)),
      eyebrow: String(raw.eyebrow).trim(),
      title,
      category: raw.category ? String(raw.category).trim() : "",
      portraitTone: raw.portrait_tone === "bw" ? "bw" : "color",
      urgency: raw.urgency ? String(raw.urgency) : "",
      countdown: {
        number: countdown.number != null ? String(countdown.number) : "",
        label: countdown.label ? String(countdown.label) : "",
      },
      event: ev,
      panelists: real,
    },
    layout,
    rules,
    problems,
    warnings,
    brandError: null,
  };
}

/** CLI wrapper: prints warnings and problems; returns { cfg, layout, rules } or null. */
function normalize(raw, name, opts) {
  const res = normalizeResult(raw, name, opts);
  for (const w of res.warnings) console.warn(w);
  if (res.problems.length) {
    console.error(`gen: ${name}.toml is not valid:`);
    for (const p of res.problems) console.error(`  - ${p}`);
    return null;
  }
  if (res.brandError) {
    console.error(res.brandError);
    return null;
  }
  return res;
}

/* The sidecar's name: the output stem (classic) or the post (scene). */
const sidecarStem = (rules, cfg, outName) => (rules.sidecar === "stem" ? cfg.name || outName : outName);

/* A --brand override that differs from the post's own brand gets its own name, so it never
   overwrites the post's usual artwork. */
function outNameFor(raw, name, opts) {
  const configured = normalizeBrandId(raw.brand || DEFAULT_BRAND);
  return opts.brand && opts.brand !== configured ? `${name}-${opts.brand}` : name;
}

/* speaker_promo in the classic design wants a transparent silhouette, not a rectangular
   photo. Any panelist still pointing at a plain JPG gets one framed and cached, so a new
   panelist needs nothing but a photo in assets/headshots/. Photos that already carry alpha
   are left untouched. The scene design cuts every photo out itself (layouts/scene/photo.mjs),
   so gen only records whether that is allowed for this run. */
async function applyCutouts(cfg, rules, opts) {
  if (rules.cutouts === "renderer") {
    cfg.cutout = !opts.noCutout;
    return;
  }
  if (cfg.postType !== "speaker_promo" || opts.noCutout) return;
  for (const p of cfg.panelists) {
    if (!p.photo || (await isCutout(p.photo))) continue;
    const stem = path.basename(p.photo).replace(/\.[^.]+$/, "");
    try {
      const cut = await ensureCutout(p.photo, stem, { force: opts.forceCutout });
      if (cut) p.photo = cut;
      else console.warn(`  [${p.name}] no cutout available — rendering the photo as a rectangle`);
    } catch (e) {
      console.warn(`  [${p.name}] cutout failed (${e.message}) — rendering the photo as a rectangle`);
    }
  }
}

function writeNormalized(stem, cfg) {
  fs.mkdirSync(GEN, { recursive: true });
  const file = path.join(GEN, `${stem}.json`);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
  return file;
}

/* The formats this design will draw for a post, warning on the rest. */
function drawnFormats(cfg, rules) {
  const skipped = cfg.formats.filter((f) => !rules.drawn.includes(f));
  if (skipped.length) console.warn(`  [${cfg.name}] ${skipped.join(", ")} not in this design yet — skipped`);
  return cfg.formats.filter((f) => rules.drawn.includes(f));
}

/* The frozen output paths of one post (plan AD-3), absolute, per format. */
function outputsFor(cfg, rules, jsonStem, formats) {
  return formats.map((format) => {
    const [svg, png] = CONTRACT.social(jsonStem, { stem: cfg.fileStem, formats: [format], campaign: cfg.campaign, person: cfg.person });
    return { format, svg: path.join(WORKSPACE, svg), png: path.join(WORKSPACE, png) };
  });
}

/* Run a renderer script synchronously, inheriting stdout so its warnings stay visible. */
function runRenderer(cmd, args, name) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (res.status !== 0) console.error(`gen: ${name}: "${cmd} ${args.join(" ")}" failed (status ${res.status})`);
  return res.status === 0;
}

async function buildPost(name, opts) {
  const raw = loadPost(name);
  const outName = outNameFor(raw, name, opts);
  const norm = normalize(raw, outName, opts);
  if (!norm) return false;
  const { cfg, layout, rules } = norm;
  await applyCutouts(cfg, rules, opts);
  const jsonStem = sidecarStem(rules, cfg, outName);
  const jsonFile = writeNormalized(jsonStem, cfg);

  const photoCount = cfg.panelists.filter((g) => g.photo).length;
  const displayName = cfg.name || outName;
  console.log(`→ ${displayName}: ${cfg.panelists.length} panelist(s), ${photoCount} photo(s)` +
    `, formats: ${cfg.formats.join(",")}, brand: ${cfg.brand}`);

  const jobs = outputsFor(cfg, rules, jsonStem, drawnFormats(cfg, rules));
  /* The layered SVG is the Canva-editable artifact: always produced, by the design's own
     SVG writer, one format at a time into the frozen folder. */
  for (const job of jobs) {
    if (!runRenderer(process.execPath, [twinOf(layout), "-c", jsonFile, "--format", job.format, "-o", path.dirname(job.svg)], name)) return false;
  }
  if (!opts.svgOnly) {
    try {
      const { render } = await pngRendererOf(layout);
      await render(cfg, jobs.map(({ format, png }) => ({ format, out: png })));
    } catch (e) {
      console.error(`  [${name}] PNG render failed (${e.message || e}) — SVG was still produced`);
      return false;
    }
  }
  console.log(`✓ ${displayName} → canva/*.svg${opts.svgOnly ? "" : " + out/*@2x.png"}${cfg.campaign ? ` (campaign ${cfg.campaign})` : ""}`);
  return true;
}

function listPosts() {
  const files = postFiles();
  const profiles = loadPanelists();
  if (files.length === 0) {
    console.log("No posts yet. Copy posts/_template.toml and fill it in.");
    return;
  }
  console.log(`Panelist profiles in assets/panelists/ (${profiles.size}):\n`);
  for (const [stem, p] of profiles) {
    console.log(`  ${stem.padEnd(20)} ${p.name || "?"}${p.photo ? "" : "  (no photo)"}`);
  }
  console.log("\nPosts in posts/:\n");
  for (const f of files) {
    const name = f.replace(/\.toml$/, "");
    let parsed;
    try {
      parsed = parseToml(fs.readFileSync(path.join(POSTS_DIR, f), "utf8"));
    } catch (e) {
      console.log(`  ${name.padEnd(16)} ✗ invalid TOML — ${e.message}`);
      continue;
    }
    const refs = Array.isArray(parsed.panelists) ? parsed.panelists : [];
    const named = refs.filter((r) => typeof r === "string");
    const inline = refs.filter((r) => r && typeof r === "object");
    const withPhotos = refs.filter((r) => {
      const p = typeof r === "string" ? profiles.get(r) : r;
      return p && p.photo;
    }).length;
    console.log(
      `  ${name.padEnd(16)} ${refs.length} panelist(s)` +
        (named.length ? `, ${named.length} from profiles` : "") +
        (inline.length ? `, ${inline.length} inline` : "") +
        `, photos: ${withPhotos}/${refs.length}`,
    );
  }
  console.log("\nGenerate with: node stencil.mjs social");
}

/* --- machine-readable inventory (--list --json / --emit-json) ------------------------
   Stable shape — see panel-kit/docs/CONTRACT.md §2. Outputs are the post's own frozen
   paths (the scene fork's rule), so posts sharing an output_name never list each other's
   files. */
function listOutputs(cfg, rules, name) {
  if (!cfg) return fs.existsSync(path.join(GEN, `${name}.json`)) ? [`.gen/${name}.json`] : [];
  const jsonStem = sidecarStem(rules, cfg, name);
  const formats = cfg.formats.filter((f) => rules.drawn.includes(f));
  const rels = CONTRACT.social(jsonStem, { stem: cfg.fileStem, formats, campaign: cfg.campaign, person: cfg.person });
  return rels.filter((rel) => fs.existsSync(path.join(WORKSPACE, rel)));
}

function inventory(name) {
  let parsed;
  try {
    parsed = loadPost(name);
  } catch (e) {
    return { name, title: null, ok: false, problems: [{ line: null, message: e.message }], warnings: [], assets: { headshots: [], qrs: [], logos: [] }, outputs: [] };
  }
  const { cfg, rules, problems, warnings, brandError } = normalizeResult(parsed, name, {});
  const refs = Array.isArray(parsed.panelists) ? parsed.panelists : [];
  const profiles = loadPanelists();
  const headshots = refs
    .map((r) => (typeof r === "string" ? profiles.get(r) : r))
    .filter((p) => p && p.photo)
    .map((p) => ({ ref: String(p.photo), resolved: !!resolvePhoto(String(p.photo), name, []) }));
  const resolvedQr = cfg
    ? cfg.event.qr
    : resolvePostQr({ event: parsed.event || {}, person: parsed.person, profile: typeof refs[0] === "string" ? refs[0] : "", panelists: [], postType: String(parsed.post_type || ""), name, warnings: [] });
  const ref = parsed.event?.qr || qrRef(resolvedQr);
  const qrs = ref ? [{ ref: String(ref), resolved: !!resolvedQr }] : [];
  const all = brandError ? [...problems, brandError] : problems;
  return {
    name,
    title: parsed.eyebrow ? String(parsed.eyebrow).trim() : null,
    ok: all.length === 0,
    problems: all.map((p) => ({ line: null, message: p })),
    warnings,
    assets: { headshots, qrs, logos: [] },
    outputs: listOutputs(cfg, rules, name),
  };
}

function listJson() {
  const items = postFiles().map((f) => inventory(f.replace(/\.toml$/, "")));
  process.stdout.write(JSON.stringify({ tool: "social", configDir: "posts", items }, null, 2) + "\n");
}

/** Normalize + write the sidecar, no rendering and no cutouts. Exit code = validation.
    (A real build also frames classic speaker cutouts, so a preview from --emit-json may
    show the pre-cutout photo.) */
function emitJson(names, opts) {
  const targets = names.length ? names : postFiles().map((f) => f.replace(/\.toml$/, ""));
  const results = [];
  let ok = true;
  for (const name of targets) {
    let parsed;
    try {
      parsed = loadPost(name);
    } catch (e) {
      results.push({ name, ok: false, problems: [{ line: null, message: e.message }] });
      ok = false;
      continue;
    }
    const outName = outNameFor(parsed, name, opts);
    const { cfg, rules, problems, warnings, brandError } = normalizeResult(parsed, outName, opts);
    if (problems.length || brandError) {
      const list = problems.map((p) => ({ line: null, message: p }));
      if (brandError) list.push({ line: null, message: brandError });
      results.push({ name, ok: false, problems: list, warnings });
      ok = false;
      continue;
    }
    const jsonFile = writeNormalized(sidecarStem(rules, cfg, outName), cfg);
    results.push({ name, ok: true, genPath: path.relative(WORKSPACE, jsonFile), warnings });
  }
  process.stdout.write(JSON.stringify({ tool: "social", results }, null, 2) + "\n");
  return ok;
}

async function buildAll(names, opts) {
  let ok = true;
  for (const name of names) {
    try {
      if (!(await buildPost(name, opts))) ok = false;
    } catch (e) {
      console.error(`gen: ${name}: ${e.message || e}`);
      ok = false;
    }
  }
  return ok;
}

function watchLoop(opts) {
  console.log("Watching posts/, assets/panelists/, assets/headshots/, assets/qrs/ … (Ctrl+C to stop)");
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      console.log("\nChange detected — rebuilding all posts…");
      await buildAll(postFiles().map((f) => f.replace(/\.toml$/, "")), opts);
    }, 300);
  };
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.watch(POSTS_DIR, { persistent: true }, rebuild);
  for (const dir of [...poolDirs("panelists"), ...poolDirs("headshots")]) {
    if (fs.existsSync(dir)) fs.watch(dir, { persistent: true }, rebuild);
  }
  for (const dir of poolDirs("qrs")) {
    if (fs.existsSync(dir)) fs.watch(dir, { persistent: true, recursive: true }, rebuild);
  }
  return new Promise(() => {});
}

/* --- main ----------------------------------------------------------------------------- */
export async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(e.message);
    return e.code;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args.emitJson) return emitJson(args.names, args) ? 0 : 1;
  if (args.list) {
    if (args.json) listJson();
    else listPosts();
    return 0;
  }
  if (args.watch) return watchLoop(args);

  const names = args.names.length ? args.names : postFiles().map((f) => f.replace(/\.toml$/, ""));
  if (names.length === 0) {
    console.log(HELP);
    return 0;
  }
  return (await buildAll(names, args)) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
