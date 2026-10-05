/**
 * One rule for finding an asset, for every format.
 *
 * Each fork had its own photo lookup with its own fallbacks into a sibling's folder.
 * Here a reference resolves in one order:
 *
 *   data: URI       returned as is
 *   absolute path   used if it exists
 *   local dirs      the caller's own drop folders, if any (a deck's speakers/, say)
 *   pool dirs       WORKSPACE/assets/<kind>, then ROOT/assets/<kind>
 *   relative path   against WORKSPACE, then ROOT
 *
 * Missing returns "" so callers can warn and fall back (monogram, empty QR frame)
 * instead of failing the build.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, WORKSPACE, poolDirs } from "./paths.mjs";

export function resolveAsset(ref, kind, { local = [] } = {}) {
  if (!ref) return "";
  const p = String(ref).trim();
  if (!p) return "";
  if (p.startsWith("data:")) return p;
  if (path.isAbsolute(p)) return fs.existsSync(p) ? p : "";

  for (const dir of [...local, ...poolDirs(kind)]) {
    const hit = path.join(dir, p);
    if (fs.existsSync(hit)) return hit;
  }
  for (const base of [...new Set([WORKSPACE, ROOT])]) {
    const hit = path.join(base, p);
    if (fs.existsSync(hit)) return hit;
  }
  return "";
}

export const resolvePhoto = (ref, opts) => resolveAsset(ref, "headshots", opts);
export const resolveQr = (ref, opts) => resolveAsset(ref, "qrs", opts);
export const resolveSponsorLogo = (ref, opts) => resolveAsset(ref, "sponsors", opts);

/** A panelist profile by stem: local dirs first, then the panelist pools. */
export function resolvePanelist(stem, { local = [] } = {}) {
  for (const dir of [...local, ...poolDirs("panelists")]) {
    const p = path.join(dir, `${stem}.toml`);
    if (fs.existsSync(p)) return p;
  }
  return "";
}

/**
 * Reduce a filename to a comparable speaker stem. Everything from the first underscore
 * is campaign bookkeeping ("Chris Bonsall_OBA_17.09.2026.jpeg"), so it is dropped and the
 * rest slugified: that file, "chris-bonsall.jpg" and "Chris Bonsall.png" are one speaker.
 */
export function photoStem(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .split("_")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Index a folder by derived stem. Background-removed cutouts are skipped. */
export function photoIndex(dir) {
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).sort()) {
    const ext = path.extname(f).toLowerCase();
    if (!PHOTO_EXT.has(ext) || f.includes("cutout")) continue;
    const stem = photoStem(f);
    if (stem && !out.has(stem)) out.set(stem, path.join(dir, f));
  }
  return out;
}

/**
 * Pick a framed head-and-shoulders photo for a speaker stem, from the local dirs and then
 * the headshot pools; fall back to whatever the profile names (often a cutout PNG).
 */
export function resolveSpeakerPhoto(stem, profilePhoto = "", { local = [] } = {}) {
  for (const dir of [...local, ...poolDirs("headshots")]) {
    const hit = photoIndex(dir).get(stem);
    if (hit) return hit;
  }
  return resolvePhoto(profilePhoto, { local });
}
