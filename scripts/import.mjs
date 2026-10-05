#!/usr/bin/env node
/**
 * Copy fonts, logos, content and inputs from the seven forks into Stencil.
 *
 * Copy, never move (plan A7): every fork keeps working, untouched, until its format
 * passes parity and the owner retires it. Run it again any time; it is idempotent:
 *
 *   node scripts/import.mjs --dry-run     show what would change
 *   node scripts/import.mjs               copy (a second run reports 0 changes)
 *   node scripts/import.mjs --from <dir>  forks live somewhere other than ../
 *
 * Fonts and logos land in the committed instrument (assets/fonts, assets/logos).
 * Everything else is client content and lands in gitignored folders.
 *
 * One edit is made on the way in: thumbnail episodes had no `brand` key (each fork was
 * single-brand), so a `brand = "OBA"` or `brand = "IU"` line is added at the top. Banner
 * panels, social posts and decks already carry one. A same-path file with different
 * bytes is a conflict: nothing is overwritten, it is reported, and the exit code is 1.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const fromIdx = argv.indexOf("--from");
const FROM = fromIdx >= 0 ? path.resolve(argv[fromIdx + 1]) : path.resolve(process.env.STENCIL_SOURCES || path.dirname(ROOT));

const ALL = ["podcast-thumbnails", "iu-podcast-thumbnails", "panel-social-posts", "iu-panel-social-posts", "zoom-banner", "iu-zoom-banner", "g-slides"];
const IMAGE = /\.(png|jpe?g|webp|svg)$/i;

/* Starter templates: the IU one keeps the plain name (IU is the default brand), the OBA
   one is suffixed. The deck has only an OBA template. */
const TEMPLATE_RENAMES = {
  "zoom-banner/panels/_template.toml": "panels/_template-oba.toml",
  "iu-zoom-banner/panels/_template.toml": "panels/_template.toml",
  "podcast-thumbnails/episodes/_template.toml": "episodes/_template-oba.toml",
  "iu-podcast-thumbnails/episodes/_template.toml": "episodes/_template.toml",
  "panel-social-posts/posts/_template.toml": "posts/_template-oba.toml",
  "iu-panel-social-posts/posts/_template.toml": "posts/_template.toml",
  "g-slides/decks/_template.toml": "decks/_template.toml",
};

/* Which brand a fork's thumbnail episodes belong to. */
const EPISODE_BRAND = { "podcast-thumbnails": "OBA", "iu-podcast-thumbnails": "IU" };

const JOBS = [
  { what: "fonts", dirs: ["podcast-thumbnails/fonts", "iu-podcast-thumbnails/fonts", "panel-social-posts/fonts", "iu-panel-social-posts/fonts", "panel-kit/assets/fonts"], to: "assets/fonts", keep: (f) => f.endsWith(".woff2"), flat: true },
  { what: "logos", dirs: ["panel-kit/assets", "iu-zoom-banner/panel-kit/assets", "iu-panel-social-posts/assets", "iu-podcast-thumbnails/assets"], to: "assets/logos", keep: (f) => IMAGE.test(f) && !f.includes("/") && f !== "reference-cover.jpeg", flat: true },
  /* Social forks first: when one photo sits in several forks, theirs is the mtime the
     cutout cache was keyed on, and the first source to place a file sets its mtime. */
  { what: "headshots", dirs: ["panel-social-posts", "iu-panel-social-posts", ...ALL.filter((r) => !r.includes("social-posts"))].map((r) => `${r}/headshots`), to: "assets/headshots", keep: (f) => !f.endsWith(".gitkeep") },
  { what: "panelists", dirs: ["panel-social-posts/panelists", "iu-panel-social-posts/panelists"], to: "assets/panelists", keep: (f) => f.endsWith(".toml") },
  { what: "qrs", dirs: ["panel-social-posts/qrs", "iu-panel-social-posts/qrs", "g-slides/qrs"], to: "assets/qrs", keep: (f) => f !== "README.md" && !f.endsWith(".gitkeep") },
  { what: "sponsors", dirs: ["g-slides/logos"], to: "assets/sponsors", keep: (f) => IMAGE.test(f) },
  { what: "panels", dirs: ["zoom-banner/panels", "iu-zoom-banner/panels"], to: "panels", keep: (f) => f.endsWith(".toml") },
  { what: "episodes", dirs: ["podcast-thumbnails/episodes", "iu-podcast-thumbnails/episodes"], to: "episodes", keep: (f) => f.endsWith(".toml") },
  { what: "posts", dirs: ["panel-social-posts/posts", "iu-panel-social-posts/posts"], to: "posts", keep: (f) => !f.endsWith(".gitkeep") },
  { what: "decks", dirs: ["g-slides/decks"], to: "decks", keep: (f) => f.endsWith(".toml") },
  { what: "speakers", dirs: ["g-slides/speakers"], to: "speakers", keep: (f) => f.endsWith(".toml") },
  /* The social cutout cache (rembg output and framing stamps). Generated, but expensive
     and keyed on each photo's size and mtime, so it is seeded rather than recomputed. */
  { what: "cutout cache", dirs: ["panel-social-posts/.gen/cutouts", "iu-panel-social-posts/.gen/cutouts"], to: ".gen/cutouts", keep: () => true },
];

const sha = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

/* Copy the source's mtime exactly. A Date carries whole milliseconds only, and the cutout
   cache keys on Math.round(mtimeMs), so the time goes over as fractional seconds. */
function keepTime(src, dest) {
  const st = fs.statSync(src);
  fs.utimesSync(dest, st.atimeMs / 1000, st.mtimeMs / 1000);
}

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out.sort();
}

/* Insert `brand = "<ID>"` before the first line that is not blank or a comment. */
function withBrand(text, brand) {
  if (/^\s*brand\s*=/m.test(text)) return text;
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim() && !l.trim().startsWith("#"));
  const line = `brand = "${brand}"`;
  if (at < 0) lines.push(line);
  else lines.splice(at, 0, line, ...(lines[at].trim().startsWith("[") ? [""] : []));
  return lines.join("\n");
}

const stats = { copied: 0, same: 0, annotated: 0, retimed: 0, conflicts: [] };
const sourceSnapshot = new Map();
const planned = new Map(); // destRel -> sha, so a dry run sees in-run duplicates too
const timed = new Set(); // destRel whose mtime a source already set this run

for (const job of JOBS) {
  for (const rel of job.dirs) {
    const srcDir = path.join(FROM, rel);
    const repo = rel.split("/")[0];
    for (const f of walk(srcDir)) {
      if (!job.keep(f)) continue;
      const src = path.join(srcDir, f);
      const key = `${rel}/${f}`;
      let destRel = TEMPLATE_RENAMES[key] || path.join(job.to, job.flat ? path.basename(f) : f);
      const raw = fs.readFileSync(src);
      sourceSnapshot.set(src, { mtimeMs: fs.statSync(src).mtimeMs, sha: sha(raw) });

      let data = raw;
      if (job.what === "episodes") {
        const brand = EPISODE_BRAND[repo];
        const next = withBrand(raw.toString("utf8"), brand);
        if (next !== raw.toString("utf8")) data = Buffer.from(next);
      }

      const dest = path.join(ROOT, destRel);
      const existing = planned.get(destRel) ?? (fs.existsSync(dest) ? sha(fs.readFileSync(dest)) : null);
      if (existing) {
        if (existing === sha(data)) {
          /* Keep the fork's mtime on unedited copies: cutout caches key on it. */
          if (!DRY && data === raw && !timed.has(destRel) && fs.existsSync(dest) && Math.abs(fs.statSync(dest).mtimeMs - fs.statSync(src).mtimeMs) > 0.001) {
            keepTime(src, dest);
            stats.retimed++;
          }
          timed.add(destRel);
          stats.same++;
          continue;
        }
        stats.conflicts.push(`${destRel}  (from ${key}) differs from what is already there`);
        continue;
      }
      stats.copied++;
      if (data !== raw) stats.annotated++;
      planned.set(destRel, sha(data));
      if (DRY) {
        console.log(`  would copy ${key} -> ${destRel}`);
        continue;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
      if (data === raw) keepTime(src, dest);
      timed.add(destRel);
    }
  }
}

/* Prove the forks were only read. */
let touched = 0;
for (const [src, before] of sourceSnapshot) {
  const st = fs.statSync(src);
  if (st.mtimeMs !== before.mtimeMs || sha(fs.readFileSync(src)) !== before.sha) touched++;
}

console.log(
  `${DRY ? "dry run: " : ""}${stats.copied} to copy${DRY ? "" : " copied"}, ${stats.same} already present, ` +
    `${stats.annotated} episode${stats.annotated === 1 ? "" : "s"} given a brand line, ${stats.retimed} given back the fork's mtime, ` +
    `${sourceSnapshot.size} fork files read, ${touched} fork files changed`
);
for (const c of stats.conflicts) console.error(`  conflict: ${c}`);
if (stats.conflicts.length || touched) process.exit(1);
