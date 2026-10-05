/**
 * Cards thumbnail normalize (from iu-podcast-thumbnails/gen.mjs:106-269): an episode TOML into
 * the config both cards renderers read, `.gen/<name>.json`.
 *
 * Changes from the fork:
 *   - photos resolve through core/assets.mjs (the workspace and repo headshot pools, then
 *     paths relative to the workspace) before the fork's cut-out preference applies;
 *   - the ground (`mode`) takes the brand pack's default, formats.thumb.options.mode (dark
 *     for IU, light for IU_LIGHT): with --brand given the pack's mode wins, otherwise the
 *     file's own `mode` key, else the pack's, else dark (chosenMode below);
 *   - normalize() returns null on problems instead of exiting, so the format CLI owns the
 *     exit code.
 * Everything else in normalizeResult() is the fork's code unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveAsset } from "../../../../core/assets.mjs";
import { ROOT } from "../../../../core/paths.mjs";
import { cutoutSibling, cutoutSidecar } from "./cutout.mjs";

/* Heuristic: is this image a cut-out (subject on a transparent background)?
   True for a PNG with an alpha channel (colour types 4/6), or any filename
   containing "cutout". A per-guest `cutout = true|false` in the TOML always
   wins over this. */
function detectCutout(file) {
  if (!file || String(file).startsWith("data:")) return false;
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(26);
    fs.readSync(fd, buf, 0, 26, 0);
    fs.closeSync(fd);
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (isPng && (buf[25] === 4 || buf[25] === 6)) return true;
    if (/cutout/i.test(path.basename(file))) return true;
    return false;
  } catch {
    return false;
  }
}

/* Resolve a TOML `photo`, preferring an auto-generated cut-out over the
   original when one exists (see cutout-cli.mjs). */
export function resolvePhoto(photo, name, quiet = false) {
  const found = resolvePhotoRaw(photo, name, quiet);
  if (!found) return "";
  if (!detectCutout(found)) {
    const cut = cutoutSibling(found);
    if (cut) {
      /* stderr — stdout is reserved for --list --json / --emit-json output. */
      if (!quiet) console.error(`  [${name}] using cut-out: ${path.relative(ROOT, cut)}`);
      return cut;
    }
  }
  return found;
}

/* Resolve a TOML `photo` value to an absolute path (or "" for no photo). */
function resolvePhotoRaw(photo, name, quiet = false) {
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
  if (!quiet) console.warn(`  [${name}] photo not found: ${photo} (the card shows the initials)`);
  return "";
}

/**
 * The ground an episode asked for, before validation: the pack's mode when --brand was
 * given (opts.brandForced), else the file's `mode`, else the pack's (opts.options.mode);
 * undefined means the fork's default, dark.
 */
export function chosenMode(cfg, opts = {}) {
  const pack = opts.options ? opts.options.mode : undefined;
  if (opts.brandForced && pack !== undefined) return pack;
  return cfg.mode !== undefined ? cfg.mode : pack;
}

/** The ground --list --json reports: "light" or "dark" (the fork's inventory rule). */
export function themeOf(cfg, opts = {}) {
  const chosen = chosenMode(cfg, opts);
  return chosen !== undefined && String(chosen).toLowerCase() === "light" ? "light" : "dark";
}

/* Normalize a parsed TOML object into the config shape the renderers expect.
   Structured core: returns { cfg, problems, warnings }, never exits or prints.
   normalize() below wraps it with the CLI's exact behaviour. */
export function normalizeResult(cfg, name, opts) {
  const problems = [];
  const warnings = [];
  if (!cfg.eyebrow) problems.push(`"eyebrow" is required (e.g. "Insurance Untangled · Ep 148")`);
  if (!cfg.category) problems.push(`"category" is required (e.g. "Practice Economics")`);
  if (!Array.isArray(cfg.title) || cfg.title.length === 0)
    problems.push(`"title" must be an array with at least one line`);

  /* Theme: "dark" (default) or "light", defaulted by the brand pack (chosenMode). */
  const chosen = chosenMode(cfg, opts);
  const mode = chosen === undefined ? "dark" : String(chosen).toLowerCase();
  if (mode !== "dark" && mode !== "light")
    problems.push(`"mode" must be "dark" or "light" (got ${JSON.stringify(chosen)})`);

  /* Title lines -> fragments. A leading "~" marks the dim (second-tone) line. */
  const title = Array.isArray(cfg.title)
    ? cfg.title.map((line) => {
        const s = String(line);
        return { text: s.startsWith("~") ? s.slice(1) : s, br: true, dim: s.startsWith("~") };
      })
    : [];

  const rawGuests = Array.isArray(cfg.guests) ? cfg.guests : [];
  if (rawGuests.length === 0 && !cfg.speakers && !opts.speakers)
    problems.push(`no [[guests]] blocks and no "speakers" count, add at least one guest`);
  if (cfg.speakers !== undefined && (!Number.isInteger(cfg.speakers) || cfg.speakers < 1))
    problems.push(`"speakers" must be a positive integer (got ${JSON.stringify(cfg.speakers)})`);

  const guests = rawGuests.map((g, i) => {
    if (!g.name) problems.push(`guest #${i + 1} is missing "name"`);
    const img = resolvePhoto(g.photo, name);
    /* Explicit cutout flag wins; otherwise auto-detect from the image. */
    const cutout =
      g.cutout !== undefined ? Boolean(g.cutout) : detectCutout(img);
    /* The cut-out sidecar's face box lets the renderers frame every guest at a
       common head size and eye line. Absent for hand-made transparent PNGs. */
    const sidecar = cutout && img ? cutoutSidecar(img) : null;
    return {
      name: String(g.name ?? ""),
      role: g.role ? String(g.role) : "",
      /* The card label shows name, then "role · company". `cred` and `label`
         are still accepted but no longer rendered on the thumbnail. */
      company: g.company ? String(g.company) : "",
      cred: g.cred ? String(g.cred) : "",
      short: g.short ? String(g.short) : "",
      label: g.label ? String(g.label) : "",
      cutout,
      img,
      face: sidecar && sidecar.face ? sidecar.face : null,
      size: sidecar && sidecar.size ? sidecar.size : null,
    };
  });

  /* Explicit speaker count: force this many cards, padding with "?"
     placeholders for guests we don't have yet. */
  const declared = guests.length;
  const target = opts.speakers ?? cfg.speakers ?? declared;
  if (target < declared)
    problems.push(
      `"speakers" is ${target} but ${declared} guest(s) are listed; raise "speakers" or remove guests`,
    );
  while (guests.length < target) {
    guests.push({ name: "", role: "", img: "", placeholder: true });
  }
  if (declared === 0 && target > 0)
    warnings.push(`  [${name}] no real guests listed, ${target} "?" placeholder card(s) will render`);

  /* Thumbnails never show an em dash (or a spaced en dash used as one): the
     renderers turn it into a comma (layout.mjs plain()). Say so, so the
     copy can be fixed at the source. */
  const copy = [
    ["eyebrow", cfg.eyebrow], ["category", cfg.category], ["hook", cfg.hook],
    ...title.map((t, i) => [`title line ${i + 1}`, t.text]),
    ...guests.flatMap((g, i) => [[`guest #${i + 1} name`, g.name], [`guest #${i + 1} role`, g.role], [`guest #${i + 1} company`, g.company]]),
  ];
  for (const [field, value] of copy) {
    if (/—|\s–\s/.test(String(value ?? ""))) {
      warnings.push(`  [${name}] em dash in ${field}: it renders as a comma; rewrite the line without it`);
    }
  }

  return {
    cfg: {
      mode,
      eyebrow: String(cfg.eyebrow).trim(),
      title,
      category: String(cfg.category).trim(),
      hook: cfg.hook ? String(cfg.hook).trim() : "",
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
