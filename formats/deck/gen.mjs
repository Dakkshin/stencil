#!/usr/bin/env node
/**
 * g-slides — build an OBA panel slide deck from one TOML file.
 *
 *   node gen.mjs                     build every decks/*.toml
 *   node gen.mjs <deck>              build one deck
 *   node gen.mjs <deck> --svg-only   skip Chromium entirely (zero-dependency path)
 *   node gen.mjs <deck> --slides 3,5-7   re-render a subset while iterating
 *   node gen.mjs <deck> --no-pdf
 *   node gen.mjs <deck> --watch
 *   node gen.mjs --list              decks, slide counts, speaker/photo/QR status
 *
 * The pipeline is: TOML -> validate -> derive the slide sequence -> .gen/<deck>.json ->
 * spawn the renderers. The sidecar is the contract: renderers read nothing else, and an
 * external publishing step can consume it without parsing SVG.
 *
 * Validation collects EVERY problem and prints them together. Fixing one error only to
 * be shown the next one is a bad loop to put a person in.
 *
 * Never hand-edit anything in .gen/, canva/ or out/ — every run regenerates all of it.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseToml } from "../../core/toml.mjs";
import {
  ROOT, AUTOMATION, WORKSPACE, DECKS, GEN, CANVA, OUT, ensureDirs, checkEnvironment,
  resolveSpeakerProfile, resolveSpeakerPhoto, resolveQr, resolveDefaultQr, resolveLogoAsset, BRANDS_MODULE,
  PANELIST_DIR, SPEAKERS,
} from "./lib/paths.mjs";
import { ensureMetrics } from "./lib/metrics.mjs";
import { optimizePhotos } from "./lib/images.mjs";
import { MAX_COVER_SPEAKERS } from "./lib/geometry.mjs";
import {
  DEFAULT_ORDER, LIMITS, NO_FOOTER, SECTION_TABLE,
  checkCount, deriveSequence, validateOrder,
} from "./lib/slides.mjs";

const HELP = `g-slides — OBA panel slide-deck generator

  node gen.mjs                      build every decks/*.toml
  node gen.mjs <deck>               build one deck
  node gen.mjs <deck> --svg-only    skip the PNG/PDF render (needs no packages)
  node gen.mjs <deck> --slides 1,4-6   render only these slide numbers
  node gen.mjs <deck> --no-pdf      PNGs but no combined PDF
  node gen.mjs <deck> --watch       rebuild when the TOML changes
  node gen.mjs --list               decks, slide counts, asset status
  node gen.mjs --list --json        same data as machine-readable JSON (GUI/agents)
  node gen.mjs <deck> --emit-json   normalize to .gen/<deck>.json only, no render
  node gen.mjs --help

Edit decks/<deck>.toml. Everything in .gen/, canva/ and out/ is generated.`;

function parseArgs(argv) {
  const a = { names: [], svgOnly: false, noPdf: false, list: false, json: false, emitJson: false, watch: false, help: false, slides: null, force: false, noOptimize: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--svg-only") a.svgOnly = true;
    else if (v === "--no-pdf") a.noPdf = true;
    else if (v === "--list") a.list = true;
    else if (v === "--json") a.json = true;
    else if (v === "--emit-json") a.emitJson = true;
    else if (v === "--watch") a.watch = true;
    else if (v === "--force-metrics") a.force = true;
    else if (v === "--no-optimize") a.noOptimize = true;
    else if (v === "--slides") a.slides = parseSlideRange(argv[++i]);
    else if (v === "--help" || v === "-h") a.help = true;
    else if (v.startsWith("-")) {
      console.error(`Unknown flag: ${v}\n\n${HELP}`);
      process.exit(2);
    } else a.names.push(v.replace(/\.toml$/, ""));
  }
  return a;
}

/** "1,4-6" -> Set{1,4,5,6}. Slide NUMBERS as printed in the footer, not indexes. */
function parseSlideRange(spec) {
  const out = new Set();
  for (const part of String(spec || "").split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    for (let n = lo; n <= hi; n++) out.add(n);
  }
  return out.size ? out : null;
}

const deckFiles = () =>
  fs.existsSync(DECKS)
    ? fs.readdirSync(DECKS).filter((f) => f.endsWith(".toml") && !f.startsWith("_")).sort()
    : [];

const str = (v) => (v === undefined || v === null ? "" : String(v));
const arr = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/**
 * The parser folds any bare key after a [table] header into that table. That is correct
 * TOML, but it silently moves `speakers` into `[event]` if someone appends it at the
 * bottom — panel-social-posts hit exactly this and works around it by hoisting the key
 * back. Hoisting hides the mistake; naming the line teaches it.
 */
const TOP_LEVEL_KEYS = new Set(["deck", "brand", "order", "speakers"]);

function checkKeyPlacement(text, problems) {
  let seenTable = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    if (line.startsWith("[")) { seenTable = true; return; }
    const key = line.split("=")[0].trim();
    if (seenTable && TOP_LEVEL_KEYS.has(key)) {
      problems.push(
        `line ${i + 1}: "${key}" is a top-level key but appears after a [table] header, ` +
          `so TOML nests it inside that table. Move it above the first [table].`
      );
    }
  });
}

/** Read a speaker profile, merge any deck-local override, resolve the photo. */
function loadSpeaker(stem, overrides, problems, warnings) {
  const file = resolveSpeakerProfile(stem);
  if (!file) {
    problems.push(
      `unknown speaker "${stem}" — no ${stem}.toml in speakers/ or ${path.relative(ROOT, PANELIST_DIR)}/`
    );
    return null;
  }

  let profile;
  try {
    profile = parseToml(fs.readFileSync(file, "utf8"));
  } catch (err) {
    problems.push(`speaker "${stem}": ${err.message}`);
    return null;
  }

  const o = overrides.get(stem) || {};
  const merged = { ...profile, ...o };
  const name = str(merged.name);
  if (!name) problems.push(`speaker "${stem}" has no name`);

  const photo = resolveSpeakerPhoto(stem, str(merged.photo));
  if (!photo) warnings.push(`no headshot for ${name || stem} — rendering a monogram tile`);

  const bio = arr(merged.bio).map(str).filter(Boolean);
  const tags = arr(merged.tags).map(str).filter(Boolean);

  return {
    stem,
    name,
    credentials: str(merged.credentials),
    role: str(merged.role),
    company: str(merged.company),
    short: str(merged.short) || name,
    initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?",
    photo,
    quote: str(merged.quote),
    /* One number the audience should remember about this person, with what it counts.
       Optional; a speaker without one simply gets no stat. */
    stat: str(merged.stat),
    statLabel: str(merged.stat_label),
    website: str(merged.website),
    bio,
    tags,
  };
}

/** A "~" prefix marks the dimmed second tone of the two-tone headline. */
const toFragments = (lines) =>
  arr(lines).map(str).filter(Boolean).map((l) =>
    l.startsWith("~") ? { text: l.slice(1).trim(), dim: true } : { text: l, dim: false }
  );

function resolveQrRef(ref, label, warnings) {
  const raw = str(ref);
  if (!raw) return resolveDefaultQr();
  const p = resolveQr(raw);
  if (!p) warnings.push(`QR "${raw}" for ${label} not found in qrs/ — rendering an empty frame`);
  return p;
}

/**
 * TOML -> the sidecar. Returns { config, problems, warnings }; a non-empty `problems`
 * means nothing gets written.
 */
function normalize(cfg, deckName, rawText) {
  const problems = [];
  const warnings = [];
  checkKeyPlacement(rawText, problems);

  const brandId = (str(cfg.brand) || "OBA").toUpperCase();

  const order = arr(cfg.order).map(str).filter(Boolean);
  const useOrder = order.length ? order : DEFAULT_ORDER;
  if (order.length) validateOrder(order, problems);

  /* Speaker overrides are keyed by `ref`, so a deck can reframe someone without
     touching the shared profile. */
  const overrides = new Map();
  for (const o of arr(cfg.speaker_override)) {
    const ref = str(o?.ref);
    if (!ref) problems.push("[[speaker_override]] entry is missing `ref`");
    else overrides.set(ref, o);
  }
  const stems = arr(cfg.speakers).map(str).filter(Boolean);
  const speakers = stems.map((s) => loadSpeaker(s, overrides, problems, warnings)).filter(Boolean);
  for (const ref of overrides.keys()) {
    if (!stems.includes(ref)) problems.push(`[[speaker_override]] refs "${ref}", which is not in \`speakers\``);
  }

  const present = new Set(
    Object.entries(SECTION_TABLE)
      .filter(([, table]) => cfg[table] && typeof cfg[table] === "object")
      .map(([section]) => section)
  );

  const event = cfg.event || {};
  if (!str(event.name)) problems.push("[event] is missing `name` (it prints on every slide footer)");

  const { sequence, skipped } = deriveSequence(useOrder, { present, speakerCount: speakers.length });
  for (const s of skipped) {
    warnings.push(s === "spotlights" ? "no speakers listed — no spotlight slides" : `no [${SECTION_TABLE[s] || s}] table — "${s}" slide skipped`);
  }
  if (!sequence.length) problems.push("nothing to render — every section in `order` is missing its table");

  /* Content checks, per section that actually made the cut. */
  if (present.has("cover")) {
    checkCount(arr(cfg.cover.title), LIMITS.titleLines, problems, "[cover] title");
    checkCount(speakers, LIMITS.coverSpeakers, problems, "cover");
    if (speakers.length > MAX_COVER_SPEAKERS) {
      problems.push(`${speakers.length} speakers is past the ${MAX_COVER_SPEAKERS}-tile ladder — split the panel`);
    }
  }
  if (present.has("agenda")) checkCount(arr(cfg.topic), LIMITS.agendaTopics, problems, "[agenda]");
  if (present.has("stat") && !str(cfg.stat.text)) problems.push("[stat] needs `text` — the one line under the number");
  if (present.has("offer_primary")) checkCount(arr(cfg.benefit), LIMITS.benefits, problems, "[offer_primary]");
  if (present.has("offer_secondary")) checkCount(arr(cfg.offer_secondary.items), LIMITS.secondaryItems, problems, "[offer_secondary]");
  if (present.has("sponsor")) checkCount(arr(cfg.sponsor_proof), LIMITS.proof, problems, "[sponsor]");

  const needsSpotlight = sequence.some((s) => s.type === "spotlight");
  if (needsSpotlight) {
    for (const sp of speakers) {
      checkCount(sp.bio, LIMITS.bio, problems, `speaker "${sp.stem}"`);
      checkCount(sp.tags, LIMITS.tags, problems, `speaker "${sp.stem}"`);
    }
  }

  if (problems.length) return { problems, warnings };

  /* Build the slides. Numbering is assigned here, after everything that could drop. */
  const total = sequence.length;
  const footerLeft = str(event.name);
  const slides = sequence.map((s, i) => {
    const base = {
      type: s.type,
      index: i,
      number: i + 1,
      total,
      footerLeft,
      showFooter: !NO_FOOTER.has(s.type),
    };
    return { ...base, ...buildSlide(s, cfg, speakers, warnings) };
  });

  return {
    problems,
    warnings,
    config: {
      deck: deckName,
      brandId,
      canvas: { w: 1920, h: 1080, scale: 2 },
      event: {
        name: footerLeft,
        category: str(event.category),
        date: str(event.date),
        time: str(event.time),
        format: str(event.format),
        cost: str(event.cost),
        website: str(event.website),
      },
      speakers,
      slideCount: total,
      slides,
    },
  };
}

function buildSlide(s, cfg, speakers, warnings) {
  switch (s.type) {
    case "cover": {
      const c = cfg.cover;
      return {
        eyebrow: str(cfg.event?.name),
        category: str(cfg.event?.category),
        title: toFragments(c.title),
        subtitle: str(c.subtitle),
        meta: [str(cfg.event?.date), str(cfg.event?.time), str(cfg.event?.format), str(cfg.event?.cost)].filter(Boolean),
        speakers,
      };
    }
    case "sponsor": {
      const sp = cfg.sponsor;
      const logoRef = str(sp.logo);
      const logo = logoRef ? resolveLogoAsset(logoRef) : "";
      if (logoRef && !logo) warnings.push(`sponsor logo "${logoRef}" not found in logos/ — rendering an empty plate`);
      return {
        level: str(sp.level),
        name: str(sp.name),
        logo,
        description: str(sp.description),
        // Second paragraph, under the mark: what the sponsor actually does. Optional —
        // omit it and the logo plate takes the space instead.
        detail: str(sp.detail),
        proofLabel: str(sp.proof_label),
        cta: str(sp.cta),
        website: str(sp.website),
        // `stars` defaults to 0, not 5: a proof point that is a metric rather than a
        // client quote should not grow a rating it never claimed.
        proof: arr(cfg.sponsor_proof).map((p) => ({
          text: str(p.text),
          source: str(p.source),
          stars: Math.max(0, Math.min(5, Number(p.stars) || 0)),
        })),
      };
    }
    case "agenda":
      return {
        eyebrow: "Agenda",
        heading: str(cfg.agenda.heading),
        items: arr(cfg.topic).map((t, i) => ({
          n: String(i + 1).padStart(2, "0"),
          title: str(t.title),
          note: str(t.note),
        })),
      };
    case "divider":
      return { text: s.text };
    case "stat": {
      const st = cfg.stat;
      return { value: str(st.value), text: str(st.text), note: str(st.note), source: str(st.source) };
    }
    case "spotlight": {
      const sp = speakers[s.speakerIndex];
      return {
        ordinal: s.ordinal,
        ofTotal: s.ofTotal,
        eyebrow: `Speaker ${String(s.ordinal).padStart(2, "0")} / ${String(s.ofTotal).padStart(2, "0")}`,
        speaker: sp,
        bio: sp.bio,
        tags: sp.tags,
      };
    }
    case "offer_primary": {
      const o = cfg.offer_primary;
      return {
        eyebrow: "For attendees",
        headline: str(o.headline),
        support: str(o.support),
        // Title of the QR panel — the thing being offered, as opposed to `headline`,
        // which is the call to action for the slide as a whole.
        panelTitle: str(o.panel_title),
        value: str(o.value),
        url: str(o.url),
        cta: str(o.cta) || "Scan to get it",
        qr: resolveQrRef(o.qr, "[offer_primary]", warnings),
        benefits: arr(cfg.benefit).map((b) => ({ title: str(b.title), note: str(b.note) })),
      };
    }
    case "offer_secondary": {
      const o = cfg.offer_secondary;
      const visualRef = str(o.visual);
      const visual = visualRef ? resolveLogoAsset(visualRef) : "";
      if (visualRef && !visual) warnings.push(`[offer_secondary] visual "${visualRef}" not found — using a placeholder`);
      return {
        eyebrow: "Go further",
        headline: str(o.headline),
        support: str(o.support),
        items: arr(o.items).map(str).filter(Boolean),
        visual,
        url: str(o.url),
        qr: resolveQrRef(o.qr, "[offer_secondary]", warnings),
      };
    }
    case "qa": {
      const q = cfg.qa;
      const recap = q.recap ? arr(cfg.topic).map((t) => str(t.title)).filter(Boolean) : [];
      return {
        heading: str(q.heading) || "Questions",
        support: str(q.support),
        prompts: [
          { label: "Speak up", text: str(q.speaking), icon: "mic" },
          { label: "Or type it", text: str(q.chat), icon: "chat" },
        ],
        recap,
        recapLabel: "We covered today",
        railLabel: "Before you go",
        reminder: str(q.reminder),
        cta: str(q.cta) || "Scan for the link",
        qr: resolveQrRef(q.qr, "[qa]", warnings),
        qrRequested: Boolean(str(q.qr)) || Boolean(resolveDefaultQr()),
      };
    }
    case "closing": {
      const c = cfg.closing;
      return {
        message: str(c.message),
        next: str(c.next),
        website: str(c.website) || str(cfg.event?.website),
        qr: resolveQrRef(c.qr, "[closing]", warnings),
        qrRequested: Boolean(str(c.qr)) || Boolean(resolveDefaultQr()),
        speakers,
      };
    }
    default:
      return {};
  }
}

async function buildDeck(name, args) {
  const file = path.join(DECKS, `${name}.toml`);
  if (!fs.existsSync(file)) {
    console.error(`No deck at decks/${name}.toml\n\nTry: node gen.mjs --list`);
    return false;
  }

  const rawText = fs.readFileSync(file, "utf8");
  let parsed;
  try {
    parsed = parseToml(rawText);
  } catch (err) {
    console.error(`decks/${name}.toml — ${err.message}`);
    return false;
  }

  const deckName = str(parsed.deck) || name;
  const { config, problems, warnings } = normalize(parsed, deckName, rawText);

  if (problems.length) {
    console.error(`\ndecks/${name}.toml — ${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error("");
    return false;
  }
  for (const w of warnings) console.warn(`  ! ${w}`);

  /* Shrink oversized sources before they are embedded two or three times each. */
  if (!args.noOptimize) {
    const photos = config.speakers.map((s) => s.photo).filter(Boolean);
    const { map, warnings: imgWarn, saved } = await optimizePhotos(photos);
    for (const w of imgWarn) console.warn(`  ! ${w}`);
    for (const sp of config.speakers) if (map.has(sp.photo)) sp.photo = map.get(sp.photo);
    for (const slide of config.slides) {
      if (slide.speaker && map.has(slide.speaker.photo)) slide.speaker.photo = map.get(slide.speaker.photo);
    }
    if (saved > 0) console.log(`  img: downsampled headshots, ${(saved / 1048576).toFixed(1)} MB saved per embed`);
  }

  fs.mkdirSync(GEN, { recursive: true });
  const jsonFile = path.join(GEN, `${deckName}.json`);
  fs.writeFileSync(jsonFile, JSON.stringify(config, null, 2));

  const counts = config.slides.reduce((m, s) => ({ ...m, [s.type]: (m[s.type] || 0) + 1 }), {});
  console.log(
    `  ${deckName}: ${config.slideCount} slides (` +
      Object.entries(counts).map(([t, n]) => (n > 1 ? `${n}x ${t}` : t)).join(", ") + ")"
  );

  const run = (script, extra = []) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, script), "-c", jsonFile, ...extra], { stdio: "inherit" });
    return r.status;
  };

  const slideArg = args.slides ? ["--slides", [...args.slides].join(",")] : [];

  const svgStatus = run("render-svg.mjs", slideArg);
  if (svgStatus === 3) {
    console.error("  Content does not fit its layout. Shorten the copy above, or change the geometry in lib/geometry.mjs.");
    return false;
  }
  if (svgStatus !== 0) {
    console.error("  SVG render crashed — this is the zero-dependency path, so this is a bug, not a content problem.");
    return false;
  }
  if (args.svgOnly) return true;

  /* PNG/PDF are non-fatal: a machine without Chromium still gets its SVGs. */
  if (run("render.mjs", [...slideArg, ...(args.noPdf ? ["--no-pdf"] : [])]) !== 0) {
    console.warn("  ! PNG/PDF render failed — the SVGs in canva/ are still valid. Re-run without --svg-only once Chromium is available.");
  }
  return true;
}

function listDecks() {
  const files = deckFiles();
  if (!files.length) {
    console.log(`No decks yet. Copy decks/_template.toml to decks/<name>.toml and edit it.`);
    return;
  }
  for (const f of files) {
    const name = f.replace(/\.toml$/, "");
    let cfg;
    try {
      cfg = parseToml(fs.readFileSync(path.join(DECKS, f), "utf8"));
    } catch (err) {
      console.log(`${name}  — unparseable: ${err.message}`);
      continue;
    }
    const stems = arr(cfg.speakers).map(str).filter(Boolean);
    /* Count bio/tags AFTER deck overrides, or every deck that supplies them locally is
       told it is missing them. */
    const overrides = new Map(arr(cfg.speaker_override).filter((o) => str(o?.ref)).map((o) => [str(o.ref), o]));
    console.log(`\n${name}  (brand ${str(cfg.brand) || "OBA"})`);
    for (const stem of stems) {
      const profile = resolveSpeakerProfile(stem);
      if (!profile) { console.log(`  ${stem.padEnd(24)} [MISSING PROFILE]`); continue; }
      const p = parseToml(fs.readFileSync(profile, "utf8"));
      const photo = resolveSpeakerPhoto(stem, str(p.photo));
      const src = profile.startsWith(SPEAKERS) ? "local" : "shared";
      const merged = { ...p, ...(overrides.get(stem) || {}) };
      const bio = arr(merged.bio).length, tags = arr(merged.tags).length;
      const from = overrides.has(stem) ? " (deck override)" : "";
      /* Name the actual file: headshots arrive under a dozen naming shapes, and "[photo]"
         alone does not tell you whether the one you just dropped in is the one in use. */
      const where = photo
        ? (photo.startsWith(ROOT) ? path.relative(ROOT, photo) : path.relative(AUTOMATION, photo))
        : "no photo found";
      console.log(
        `  ${stem.padEnd(24)} ${photo ? "[photo]" : "[monogram]"} ${src.padEnd(7)}` +
          ` bio:${bio} tags:${tags}${from}${bio !== 3 || tags < 2 ? "  <- needs bio:3 tags:2-3" : ""}`
      );
      console.log(`  ${" ".repeat(24)} ${where}`);
    }
    for (const [section, key] of [["offer_primary", "offer_primary"], ["offer_secondary", "offer_secondary"], ["qa", "qa"], ["closing", "closing"]]) {
      if (!cfg[key] || typeof cfg[key] !== "object") continue;
      const ref = str(cfg[key].qr);
      if (ref) {
        console.log(`  qr ${section.padEnd(21)} ${resolveQr(ref) ? "[qr]" : "[MISSING]"} ${ref}`);
      } else {
        const def = resolveDefaultQr();
        if (def) console.log(`  qr ${section.padEnd(21)} [qr:default] ${path.relative(ROOT, def)}`);
      }
    }
  }
}

/* --- machine-readable inventory (--list --json / --emit-json) ------------
   Stable shape — see panel-kit/docs/CONTRACT.md §2. */
function listOutputs(deckName) {
  const out = [];
  for (const rel of [`out/${deckName}.pdf`, `.gen/${deckName}.json`]) {
    if (fs.existsSync(path.join(WORKSPACE, rel))) out.push(rel);
  }
  const pngDir = path.join(OUT, deckName);
  if (fs.existsSync(pngDir)) {
    for (const f of fs.readdirSync(pngDir).filter((f) => f.endsWith(".png")).sort()) out.push(`out/${deckName}/${f}`);
  }
  const svgDir = path.join(CANVA, deckName);
  if (fs.existsSync(svgDir)) {
    for (const f of fs.readdirSync(svgDir).filter((f) => f.endsWith(".svg")).sort()) out.push(`canva/${deckName}/${f}`);
  }
  return out;
}

function inventory(name) {
  const file = path.join(DECKS, `${name}.toml`);
  const fail = (message) => ({ name, title: null, ok: false, problems: [{ line: null, message }], warnings: [], assets: { headshots: [], qrs: [], logos: [] }, outputs: [] });
  if (!fs.existsSync(file)) return fail(`No deck at decks/${name}.toml`);
  const rawText = fs.readFileSync(file, "utf8");
  let parsed;
  try {
    parsed = parseToml(rawText);
  } catch (e) {
    return fail(e.message);
  }
  const deckName = str(parsed.deck) || name;
  const { config, problems, warnings } = normalize(parsed, deckName, rawText);
  const stems = arr(parsed.speakers).map(str).filter(Boolean);
  const headshots = stems.map((stem) => {
    const profile = resolveSpeakerProfile(stem);
    let photo = "";
    if (profile) {
      try {
        photo = resolveSpeakerPhoto(stem, str(parseToml(fs.readFileSync(profile, "utf8")).photo));
      } catch { photo = ""; }
    }
    return { ref: stem, resolved: !!photo };
  });
  const qrs = [];
  for (const key of ["offer_primary", "offer_secondary", "qa", "closing"]) {
    const ref = parsed[key] && typeof parsed[key] === "object" ? str(parsed[key].qr) : "";
    if (ref) qrs.push({ ref, resolved: !!resolveQr(ref) });
  }
  return {
    name,
    title: str(config?.event?.name) || str(parsed.event?.name) || null,
    ok: problems.length === 0,
    problems: problems.map((p) => ({ line: null, message: p })),
    warnings,
    assets: { headshots, qrs, logos: [] },
    outputs: listOutputs(deckName),
  };
}

function listJson() {
  const items = deckFiles().map((f) => inventory(f.replace(/\.toml$/, "")));
  process.stdout.write(JSON.stringify({ tool: "deck", configDir: "decks", items }, null, 2) + "\n");
}

/** Normalize + write .gen/<deck>.json, no rendering and no photo optimization. */
async function emitJson(names) {
  const targets = names.length ? names : deckFiles().map((f) => f.replace(/\.toml$/, ""));
  const results = [];
  let ok = true;
  for (const name of targets) {
    const file = path.join(DECKS, `${name}.toml`);
    if (!fs.existsSync(file)) {
      results.push({ name, ok: false, problems: [{ line: null, message: `No deck at decks/${name}.toml` }] });
      ok = false;
      continue;
    }
    const rawText = fs.readFileSync(file, "utf8");
    let parsed;
    try {
      parsed = parseToml(rawText);
    } catch (e) {
      results.push({ name, ok: false, problems: [{ line: null, message: e.message }] });
      ok = false;
      continue;
    }
    const deckName = str(parsed.deck) || name;
    const { config, problems, warnings } = normalize(parsed, deckName, rawText);
    if (problems.length) {
      results.push({ name, ok: false, problems: problems.map((p) => ({ line: null, message: p })), warnings });
      ok = false;
      continue;
    }
    fs.mkdirSync(GEN, { recursive: true });
    const jsonFile = path.join(GEN, `${deckName}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(config, null, 2));
    results.push({ name, ok: true, genPath: path.relative(WORKSPACE, jsonFile), warnings });
  }
  process.stdout.write(JSON.stringify({ tool: "deck", results }, null, 2) + "\n");
  if (!ok) process.exitCode = 1;
  return ok;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return console.log(HELP);

  const envProblems = checkEnvironment();
  if (envProblems.length) {
    console.error("\ng-slides depends on its sibling tools, and some are missing:\n");
    for (const p of envProblems) console.error(`  • ${p}`);
    console.error("\nThese are imported, not vendored, on purpose — see CLAUDE.md.\n");
    process.exit(1);
  }

  ensureDirs();
  if (args.emitJson) return process.exit((await emitJson(args.names)) ? 0 : 1);
  if (args.list) return args.json ? listJson() : listDecks();

  const metrics = await ensureMetrics({ force: args.force });
  for (const w of metrics.warnings) console.warn(`  ! ${w}`);

  const names = args.names.length ? args.names : deckFiles().map((f) => f.replace(/\.toml$/, ""));
  if (!names.length) {
    console.log("No decks yet. Copy decks/_template.toml to decks/<name>.toml and edit it.");
    return;
  }

  let ok = true;
  for (const name of names) ok = (await buildDeck(name, args)) && ok;

  if (args.watch) {
    console.log("\nwatching decks/ and speakers/ — ctrl-c to stop");
    const rebuild = debounce(async () => { for (const n of names) await buildDeck(n, args); }, 120);
    for (const dir of [DECKS, SPEAKERS]) fs.watch(dir, rebuild);
    return;
  }
  process.exit(ok ? 0 : 1);
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
