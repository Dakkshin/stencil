/**
 * Classic thumbnail normalize (from podcast-thumbnails/gen.mjs:102-193): an episode TOML into
 * the config both classic renderers read, `.gen/<name>.json`.
 *
 * Changes from the fork: photos resolve through core/assets.mjs (the workspace and repo
 * headshot pools, then paths relative to the workspace) instead of the fork's own
 * headshots/ folder, and normalize() returns null on problems instead of exiting, so the
 * format CLI owns the exit code. normalizeResult() is the fork's code unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveAsset } from "../../../../core/assets.mjs";

/* Resolve a TOML `photo` value to an absolute path (or "" for no photo). */
export function resolvePhoto(photo, name, quiet = false) {
  if (!photo) return "";
  if (photo.startsWith("data:")) return photo;
  if (path.isAbsolute(photo)) {
    if (fs.existsSync(photo)) return photo;
    if (!quiet) console.warn(`  [${name}] photo not found: ${photo}`);
    return "";
  }
  /* Bare filename or relative path -> the headshot pools first, then the workspace. */
  const hit = resolveAsset(photo, "headshots");
  if (hit) return hit;
  if (!quiet) console.warn(`  [${name}] photo not found: ${photo} (dropping tile to "?" placeholder)`);
  return "";
}

/* Normalize a parsed TOML object into the config shape the renderers expect.
   Structured core: returns { cfg, problems, warnings }, never exits or prints.
   normalize() below wraps it with the CLI's exact behaviour. */
export function normalizeResult(cfg, name, opts) {
  const problems = [];
  const warnings = [];
  if (!cfg.eyebrow) problems.push(`"eyebrow" is required (e.g. "OBA · Podcast 028")`);
  if (!cfg.category) problems.push(`"category" is required (e.g. "Practice Growth · Sub-Specialty")`);
  if (!Array.isArray(cfg.title) || cfg.title.length === 0)
    problems.push(`"title" must be an array with at least one line`);

  /* Title lines -> fragments. A leading "~" marks the dim (second-tone) line. */
  const title = Array.isArray(cfg.title)
    ? cfg.title.map((line) => {
        const s = String(line);
        return { text: s.startsWith("~") ? s.slice(1) : s, br: true, dim: s.startsWith("~") };
      })
    : [];

  const rawGuests = Array.isArray(cfg.guests) ? cfg.guests : [];
  if (rawGuests.length === 0 && !cfg.speakers && !opts.speakers)
    problems.push(`no [[guests]] blocks and no "speakers" count — add at least one guest`);
  if (cfg.speakers !== undefined && (!Number.isInteger(cfg.speakers) || cfg.speakers < 1))
    problems.push(`"speakers" must be a positive integer (got ${JSON.stringify(cfg.speakers)})`);

  const guests = rawGuests.map((g, i) => {
    if (!g.name) problems.push(`guest #${i + 1} is missing "name"`);
    return {
      name: String(g.name ?? ""),
      role: g.role ? String(g.role) : "",
      short: g.short ? String(g.short) : "",
      img: resolvePhoto(g.photo, name),
    };
  });

  /* Explicit speaker count: force the grid to this many tiles, padding with
     "?" Portrait placeholders for guests we don't have yet. */
  const declared = guests.length;
  const target = opts.speakers ?? cfg.speakers ?? declared;
  if (target < declared)
    problems.push(
      `"speakers" is ${target} but ${declared} guest(s) are listed — raise "speakers" or remove guests`,
    );
  while (guests.length < target) {
    guests.push({ name: "", role: "", img: "", placeholder: true });
  }
  if (declared === 0 && target > 0)
    warnings.push(`  [${name}] no real guests listed — ${target} "?" placeholder tile(s) will render`);

  return {
    cfg: {
      eyebrow: String(cfg.eyebrow).trim(),
      title,
      category: String(cfg.category).trim(),
      guests,
      output: `${name}.png`,
    },
    problems,
    warnings,
  };
}

/** The CLI wrapper: prints warnings and problems as the fork did; null when not valid. */
export function normalize(cfg, name, opts) {
  const { cfg: out, problems, warnings } = normalizeResult(cfg, name, opts);
  for (const w of warnings) console.warn(w);
  if (problems.length) {
    console.error(`gen: ${name}.toml is not valid:`);
    for (const p of problems) console.error(`  - ${p}`);
    return null;
  }
  return out;
}
