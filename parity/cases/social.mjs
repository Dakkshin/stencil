/**
 * Social parity cases: every real post in both social forks, in every format it requests.
 *
 * Two things make this format different from the banner:
 *
 * - Outputs are named by the post's `output_name` and nested by campaign and person, not by
 *   the post's file name, so `belongsTo` reads each post to know which files are its own.
 * - The OBA fork names its sidecar after `output_name` too, and several posts share one
 *   (the four `Promo_05` cards, say). In the fork each build writes `.gen/<stem>.json` and
 *   then renders from it, so two builds of one stem running at once read each other's
 *   config. `node gen.mjs` builds one post at a time, so both sides run one case at a time
 *   (concurrency 1): the last post of a stem in list order owns `.gen/<stem>.json`.
 *
 * Nothing is resampled: the classic layout's PNG is a 2x CDP capture, the scene layout's
 * a 2x Chrome screenshot of the SVG, so every PNG must be pixel-identical (no tolerance).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseToml } from "../../core/toml.mjs";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const build = (name) => ["gen.mjs", name];
const emitJson = (name) => ["gen.mjs", name, "--emit-json"];

const OBA = [
  "happening_today",
  "happening_today_bradley_barnett",
  "happening_today_crystal_brimer",
  "happening_today_dry_eye",
  "happening_today_patti_barkey",
  "happening_today_stephanie_doherty",
  "intro_bradley_barnett",
  "intro_crystal_brimer",
  "intro_light_bradley_barnett",
  "intro_light_crystal_brimer",
  "intro_light_patti_barkey",
  "intro_light_stephanie_doherty",
  "intro_patti_barkey",
  "intro_stephanie_doherty",
  "one_more_day",
  "one_more_day_bradley_barnett",
  "one_more_day_crystal_brimer",
  "one_more_day_dry_eye",
  "one_more_day_patti_barkey",
  "one_more_day_stephanie_doherty",
  "speaker_amanda_cardwell",
  "speaker_bradley_barnett",
  "speaker_chris_bonsall",
  "speaker_christine_lapointe",
  "speaker_crystal_brimer",
  "speaker_patti_barkey",
  "speaker_sean_hanlon",
  "speaker_stephanie_doherty",
  "the_intro",
  "the_intro_dry_eye",
];

const IU = [
  "demo_fee_schedule_reset",
  "fsr_intro_ben_tuinei",
  "fsr_intro_laura_johnston",
  "fsr_intro_tessina_bullock",
  "fsr_live_tonight_ben_tuinei",
  "fsr_live_tonight_laura_johnston",
  "fsr_live_tonight_tessina_bullock",
  "fsr_one_more_day_ben_tuinei",
  "fsr_one_more_day_laura_johnston",
  "fsr_one_more_day_tessina_bullock",
  "fsr_panel_ben_tuinei",
  "fsr_panel_laura_johnston",
  "fsr_panel_tessina_bullock",
  "fsr_speaker_ben_tuinei",
  "fsr_speaker_laura_johnston",
  "fsr_speaker_tessina_bullock",
  "lane_a_intro",
  "lane_a_panel",
  "lane_b_intro_one",
  "lane_b_speaker",
  "lane_c_live",
  "lane_c_one_more_day",
];

/* --- which outputs belong to a case (only --only and --brand use this) ---------------- */

const FOUR = ["square", "portrait", "story", "landscape"];
/* Per fork: the formats a post gets when it names none, the formats the renderer can
   draw, and whether the sidecar is named after the output stem or the post. */
const RULES = {
  classic: { defaults: (type) => (type === "speaker_promo" ? ["square"] : FOUR), drawn: FOUR, sidecar: "stem" },
  scene: { defaults: () => ["square", "portrait"], drawn: ["square", "portrait"], sidecar: "post" },
};

function readToml(file) {
  try {
    return parseToml(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function panelistName(ref) {
  if (ref && typeof ref === "object") return String(ref.name || "");
  const p = readToml(path.join(ROOT, "assets", "panelists", `${ref}.toml`));
  return p ? String(p.name || "") : "";
}

/* The same naming rules as both forks' gen.mjs (output_name, The_Intro_<Name>, campaign
   nesting, person bucket), kept here so the harness does not trust the code it checks. */
function outputsOf(name, rule) {
  const raw = readToml(path.join(ROOT, "posts", `${name}.toml`));
  if (!raw) return { files: [], sidecar: "" };
  const refs = Array.isArray(raw.panelists) ? raw.panelists : raw.event && Array.isArray(raw.event.panelists) ? raw.event.panelists : [];
  let stem = name;
  if (raw.output_name) {
    stem = String(raw.output_name).trim();
    if (refs.length === 1 && stem.toLowerCase() === "the_intro") {
      stem = `The_Intro_${panelistName(refs[0]).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    }
  }
  const asked = Array.isArray(raw.formats) && raw.formats.length ? raw.formats : rule.defaults(String(raw.post_type || "").trim());
  const formats = [...new Set(asked)].filter((f) => rule.drawn.includes(f));
  const campaign = raw.campaign ? String(raw.campaign).trim() : "";
  const person = raw.person ? String(raw.person).trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") : "";
  const files = [];
  for (const fmt of formats) {
    if (campaign) {
      const dir = `${campaign}/${person || "shared"}/${fmt}`;
      files.push(`canva/${dir}/${stem}.svg`, `out/${dir}/${stem}@2x.png`);
    } else {
      files.push(`canva/${stem}-${fmt}.svg`, `out/${stem}-${fmt}@2x.png`);
    }
  }
  return { files, sidecar: `.gen/${rule.sidecar === "stem" ? stem : name}.json` };
}

const OWNED = new Map();
for (const [names, rule] of [[OBA, RULES.classic], [IU, RULES.scene]]) {
  const lastWriter = new Map();
  for (const n of names) lastWriter.set(outputsOf(n, rule).sidecar, n);
  for (const n of names) {
    const { files, sidecar } = outputsOf(n, rule);
    OWNED.set(n, new Set(lastWriter.get(sidecar) === n ? [...files, sidecar] : files));
  }
}

export default {
  format: "social",
  stencilInputDir: "posts",
  outputDirs: [".gen", "out", "canva"],
  /* The speaker cards' cutout cache: framed stamps and raw rembg output, keyed on each
     photo's size and mtime, so the scratch workspace hits it exactly as the forks do. */
  stencilExtraDirs: [".gen/cutouts"],
  concurrency: 1,
  timeout: 300000,
  forks: {
    "panel-social-posts": {
      inputDir: "posts",
      cases: OBA,
      supply: { headshots: "headshots" },
      build,
      emitJson,
      concurrency: 1,
      timeout: 300000,
    },
    "iu-panel-social-posts": {
      inputDir: "posts",
      cases: IU,
      supply: { headshots: "headshots" },
      build,
      emitJson,
      concurrency: 1,
      timeout: 300000,
    },
  },
  stencil: {
    build: (name) => ["stencil.mjs", "social", name],
    emitJson: (name) => ["stencil.mjs", "social", name, "--emit-json"],
  },
  tolerance: [],
  belongsTo: (rel, name) => OWNED.get(name)?.has(rel) ?? false,
};
