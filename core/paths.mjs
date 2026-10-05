/**
 * Where everything lives, resolved once.
 *
 * The forks reached into each other's folders by relative path (`../podcast-thumbnails/
 * headshots`, `../../OBA/oba-website`), which broke whenever a folder moved. Stencil has
 * two roots and nothing else:
 *
 *   ROOT       this repo: the engine, the brand packs, fonts and logos (the instrument)
 *   WORKSPACE  content: inputs, headshots, panelists, QRs and every output.
 *              STENCIL_WORKSPACE, else PANEL_WORKSPACE (the panel-kit name), else ROOT.
 *
 * Output names under WORKSPACE are the frozen contract (plan AD-3); see core/contract.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const WORKSPACE = path.resolve(process.env.STENCIL_WORKSPACE || process.env.PANEL_WORKSPACE || ROOT);

/* The instrument: always from the repo, never from a workspace. */
export const FONTS = path.join(ROOT, "assets", "fonts");
export const LOGOS = path.join(ROOT, "assets", "logos");
export const BRANDS_DIR = path.join(ROOT, "brands");
export const FORMATS_DIR = path.join(ROOT, "formats");

/* Content pools. A workspace pool is searched before the repo's own pool, so a
   campaign workspace can override a shared photo without touching the pool.
   Brand logos are the instrument (LOGOS above); sponsor logos are client content. */
export const POOL_KINDS = ["headshots", "panelists", "qrs", "sponsors"];

export function poolDirs(kind) {
  if (!POOL_KINDS.includes(kind)) throw new Error(`unknown asset pool "${kind}" (have: ${POOL_KINDS.join(", ")})`);
  const dirs = [path.join(WORKSPACE, "assets", kind), path.join(ROOT, "assets", kind)];
  return [...new Set(dirs)];
}

/* Input folders keep the names the forks used, so a GUI schema's configDir is unchanged. */
export const INPUT_DIRS = {
  banner: "panels",
  thumb: "episodes",
  social: "posts",
  deck: "decks",
};

export function inputDir(format) {
  const rel = INPUT_DIRS[format];
  if (!rel) throw new Error(`format "${format}" has no input folder`);
  return path.join(WORKSPACE, rel);
}

/* Deck-local speaker profile overrides (the canonical pool is assets/panelists). */
export const SPEAKERS = path.join(WORKSPACE, "speakers");

export const GEN = path.join(WORKSPACE, ".gen");
export const OUT = path.join(WORKSPACE, "out");
export const CANVA = path.join(WORKSPACE, "canva");
export const PREVIEW = path.join(WORKSPACE, "preview");

export function ensureDirs(...dirs) {
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
}
