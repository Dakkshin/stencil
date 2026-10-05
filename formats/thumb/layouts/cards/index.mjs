/**
 * The cards thumbnail design (iu-podcast-thumbnails v3, portrait cards): what the thumb
 * format drives.
 *
 *   normalize, normalizeResult   the fork's validation (normalize.mjs), ground from the pack
 *   buildSvg(genPath)            the fork's SVG twin, run on the sidecar exactly as the fork's
 *                                gen.mjs ran it; writes canva/IU-<name>.svg
 *   pngTemplate()                the PNG hook: builds template.html when it is missing or
 *                                older than its sources, then hands it to render-png.mjs
 *
 * Both renderers run compose() from layout.mjs, as in the fork. template.html is generated
 * (gitignored) by build-template.mjs, which inlines the pooled fonts and logos and the
 * layout code, and still refuses to build on CSS drift.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FONTS, LOGOS, ROOT } from "../../../../core/paths.mjs";

export { normalize, normalizeResult, resolvePhoto, chosenMode, themeOf } from "./normalize.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The prefix this design's twin writes: canva/IU-<name>.svg (frozen name, AD-3). */
export const svgPrefix = "IU";
/** What --list and the build log call one guest. */
export const unit = "card";
export const template = path.join(HERE, "template.html");
const BUILD = path.join(HERE, "build-template.mjs");

/* Everything build-template.mjs reads: its source, the layout code it inlines, and the
   fonts and logos it embeds (its FACES table and the two lockups). */
const SOURCES = [
  ...["template.src.html", "build-template.mjs", "geometry.mjs", "layout.mjs", "motif.mjs", "widths.json"].map((f) => path.join(HERE, f)),
  ...["InterDisplay-400", "InterDisplay-500", "InterDisplay-600", "Inter-400", "Inter-500", "Inter-600", "EBGaramond-500", "EBGaramond-500-italic"].map((f) => path.join(FONTS, `${f}.woff2`)),
  path.join(LOGOS, "iu-logo.png"),
  path.join(LOGOS, "iu-logo-reversed.svg"),
];

function stale() {
  if (!fs.existsSync(template)) return true;
  const built = fs.statSync(template).mtimeMs;
  return SOURCES.some((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > built);
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Build template.html when it is missing or older than its sources. Several renders may
 * start at once (parallel builds, test files), so one process builds under a lock file
 * while the others wait for it; a lock older than a minute is a crashed build and is
 * cleared. The lock ends in .tmp, which the repo already ignores.
 */
export function ensureTemplate() {
  const lock = `${template}.lock.tmp`;
  for (;;) {
    /* Fresh and nobody writing it: the order matters, a writer holds the lock first. */
    if (!stale() && !fs.existsSync(lock)) return template;
    let fd;
    try {
      fd = fs.openSync(lock, "wx");
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 60000) fs.rmSync(lock, { force: true });
      } catch {
        /* released meanwhile */
      }
      sleep(100);
      continue;
    }
    try {
      if (stale()) {
        const res = spawnSync(process.execPath, [BUILD], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
        if (res.status !== 0) throw new Error(`build-template.mjs failed (status ${res.status}); template.html was not rebuilt`);
      }
    } finally {
      fs.closeSync(fd);
      fs.rmSync(lock, { force: true });
    }
    return template;
  }
}

/** Run the SVG twin on .gen/<name>.json; true when it wrote the SVG. */
export function buildSvg(genPath) {
  const res = spawnSync(process.execPath, [path.join(HERE, "render-svg.mjs"), "-c", genPath], { cwd: ROOT, stdio: "inherit" });
  return res.status === 0;
}

/** The PNG hook: the built template to screenshot. */
export async function pngTemplate() {
  return ensureTemplate();
}

/** The --list layout column: composition by count alone (iu-podcast-thumbnails/gen.mjs). */
export function listLabel(target) {
  return target === 1 ? "solo (band)" : target === 2 ? "duo (band)" : `row (${target})`;
}
