/**
 * The deck's path module (from g-slides/lib/paths.mjs), resolved over Stencil's core.
 *
 * Every name the deck code imports is kept, so gen.mjs, render-svg.mjs, render.mjs and the
 * rest of lib/ move verbatim. What changed is where things live: there are no sibling
 * tools any more. Brand tokens come from the brand packs (lib/brands.mjs), fonts and the
 * logo from assets/, speaker profiles and photos from the one asset pool, and every
 * output goes to the workspace.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../../../core/paths.mjs";
import * as pool from "../../../core/assets.mjs";

/* The deck's own code: gen.mjs spawns render-svg.mjs and render.mjs from here, and
   render.mjs loads shell.html from here. */
export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* The stencil root. Display paths are relative to it, and lib/chromium.mjs falls back to
   resolving Playwright from its package.json. */
export const AUTOMATION = core.ROOT;

/* The instrument is Stencil itself now. */
export const KIT = core.ROOT;

export const WORKSPACE = core.WORKSPACE;

/* The legacy sibling pools are gone (one asset pool replaced them). The names stay so
   moved modules that still import them load unchanged. */
export const PSP = core.ROOT;
export const PODCAST = core.ROOT;

export const BRANDS_MODULE = path.join(ROOT, "lib", "brands.mjs");
export const FONT_DIR = core.FONTS;
export const PANELIST_DIRS = core.poolDirs("panelists");
const firstDir = (...dirs) => dirs.find((d) => fs.existsSync(d)) || dirs[0];
export const PANELIST_DIR = firstDir(...PANELIST_DIRS);
export const LOGO_BASE = core.LOGOS;

/* Inputs and drop folders, in the workspace. */
export const DECKS = core.inputDir("deck");
export const SPEAKERS = core.SPEAKERS;
export const HEADSHOTS = core.poolDirs("headshots")[0];
export const QRS = core.poolDirs("qrs")[0];
export const LOGOS = core.poolDirs("sponsors")[0];

export const GEN = core.GEN;
export const CANVA = core.CANVA;
export const OUT = core.OUT;
export const PREVIEW = core.PREVIEW;

/* Font pool. Weights match what the OBA design system ships; nothing else is used. */
export const FONT_FACES = [
  { family: "Inter", weight: 300, file: "Inter-300-normal.woff2" },
  { family: "Inter", weight: 400, file: "Inter-400-normal.woff2" },
  { family: "Inter", weight: 500, file: "Inter-500-normal.woff2" },
  { family: "Inter", weight: 600, file: "Inter-600-normal.woff2" },
  { family: "IBM Plex Mono", weight: 500, file: "IBM-Plex-Mono-500-normal.woff2" },
  { family: "IBM Plex Mono", weight: 600, file: "IBM-Plex-Mono-600-normal.woff2" },
];

export const fontPath = (file) => path.join(FONT_DIR, file);

/** Everything the deck needs from the repo, checked in one pass. Empty means sound. */
export function checkEnvironment() {
  const problems = [];
  const need = (p, what) => {
    if (!fs.existsSync(p)) problems.push(`${what} not found at ${p}`);
  };
  need(BRANDS_MODULE, "the deck brand registry");
  need(FONT_DIR, "font pool");
  for (const f of FONT_FACES) need(fontPath(f.file), `font ${f.family} ${f.weight}`);
  return problems;
}

/** Directories this format writes to. Created on demand; all are gitignored. */
export function ensureDirs() {
  for (const d of [GEN, CANVA, OUT, PREVIEW, DECKS, SPEAKERS]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/**
 * Resolve an asset reference to an absolute path, or "" if it cannot be found: data URI,
 * absolute path, the given folders in order, then relative to the workspace and the repo.
 */
export function resolveAsset(ref, localDirs, sharedDirs = []) {
  if (!ref) return "";
  if (ref.startsWith("data:")) return ref;
  if (path.isAbsolute(ref)) return fs.existsSync(ref) ? ref : "";
  for (const dir of [...localDirs, ...sharedDirs]) {
    const p = path.join(dir, ref);
    if (fs.existsSync(p)) return p;
  }
  for (const base of [...new Set([WORKSPACE, core.ROOT])]) {
    const rel = path.join(base, ref);
    if (fs.existsSync(rel)) return rel;
  }
  return "";
}

export const resolvePhoto = (ref) => pool.resolvePhoto(ref);
export const resolveQr = (ref) => pool.resolveQr(ref);
export const resolveLogoAsset = (ref) => pool.resolveSponsorLogo(ref);

/**
 * A file named "default" in the QR pool (any extension) fills every QR slot a deck does
 * not name explicitly. An explicit `qr = "..."` in the TOML always wins.
 */
export function resolveDefaultQr() {
  for (const dir of core.poolDirs("qrs")) {
    if (!fs.existsSync(dir)) continue;
    const hit = fs.readdirSync(dir).sort().find((f) => path.parse(f).name.toLowerCase() === "default");
    if (hit) return path.join(dir, hit);
  }
  return "";
}

export const photoStem = pool.photoStem;

/**
 * Pick the photo for a speaker tile: a framed head-and-shoulders photo from the headshot
 * pool by speaker stem, else whatever the profile names (often a background-removed PNG,
 * which renders as a floating head inside a tile).
 */
export const resolveSpeakerPhoto = (stem, profilePhoto = "") => pool.resolveSpeakerPhoto(stem, profilePhoto);

/** Where a speaker profile lives: the deck's local overrides first, then the panelist pool. */
export const resolveSpeakerProfile = (stem) => pool.resolvePanelist(stem, { local: [SPEAKERS] });
