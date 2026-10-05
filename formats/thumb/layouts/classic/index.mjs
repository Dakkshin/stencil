/**
 * The classic thumbnail design (podcast-thumbnails, the OBA look): what the thumb format drives.
 *
 *   normalize, normalizeResult   the fork's validation (normalize.mjs)
 *   buildSvg(genPath)            the fork's hand-mirrored SVG twin, run on the sidecar exactly
 *                                as the fork's gen.mjs ran it; writes canva/OBA-<name>.svg
 *   pngTemplate(), pngAgreement  the PNG hook: the page the format's render-png.mjs
 *                                screenshots, and how many captures must agree
 *
 * The moved files stay the fork's code (scripts/moves/thumb.json); this module only names
 * them. The design has one dark ground and hard-coded colours, so it reads no brand tokens.
 */
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT } from "../../../../core/paths.mjs";

export { normalize, normalizeResult, resolvePhoto } from "./normalize.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The prefix this design's twin writes: canva/OBA-<name>.svg (frozen name, AD-3). */
export const svgPrefix = "OBA";

/**
 * Byte-identical captures render-png.mjs must collect before it writes the preview. The
 * template loads one variable Inter file from Google Fonts for four weights, and under
 * machine load Chrome now and then builds a slightly different instance of it for a page:
 * some glyph advances move by 1/64 px and a few glyphs cross a sub-pixel boundary. The fork
 * does exactly the same (ep055, ep065; never on a quiet machine), so two agreeing sessions
 * are the canonical render. The cards template embeds static fonts and needs one capture.
 */
export const pngAgreement = 2;
/** What --list and the build log call one headshot. */
export const unit = "tile";
export const template = path.join(HERE, "template.html");

/** Run the SVG twin on .gen/<name>.json; true when it wrote the SVG. */
export function buildSvg(genPath) {
  const res = spawnSync(process.execPath, [path.join(HERE, "render-svg.mjs"), "-c", genPath], { cwd: ROOT, stdio: "inherit" });
  return res.status === 0;
}

/** The PNG hook: the template to screenshot (static, so nothing to prepare). */
export async function pngTemplate() {
  return template;
}

/** The --list layout column (podcast-thumbnails/gen.mjs listEpisodes). */
export function listLabel(target) {
  return target >= 7 ? "circles (7+)" : target === 1 ? "solo" : target === 2 ? "duo" : `${target}-tile ${target <= 4 ? "row" : "grid"}`;
}
