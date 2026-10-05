/**
 * The format registry: one entry per surface Stencil renders.
 *
 * A format owns one surface (plan AD-1). Its CLI lives at formats/<id>/gen.mjs and
 * exports `main(argv)`, keeping the flags of the fork(s) it replaces (AD-9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* `layouts` are the design names a brand pack may pick in formats.<id>.layout. */
export const FORMATS = {
  banner: { title: "Zoom banner (640x200)", layouts: ["strip-centre", "strip-corner"], forks: ["zoom-banner", "iu-zoom-banner"] },
  thumb: { title: "Podcast thumbnail (2560x1440)", layouts: ["classic", "cards"], forks: ["podcast-thumbnails", "iu-podcast-thumbnails"] },
  social: { title: "Panel social posts (square, portrait, story)", layouts: ["classic", "scene"], forks: ["panel-social-posts", "iu-panel-social-posts"] },
  deck: { title: "Panel slide deck (SVG, PNG, PDF)", layouts: ["deck"], forks: ["g-slides"] },
  background: { title: "Zoom host background (1920x1080)", layouts: ["host"], forks: ["g-slides/host-background"] },
};

export function formatIds() {
  return Object.keys(FORMATS);
}

export function genPath(id) {
  return path.join(HERE, id, "gen.mjs");
}

export function isPorted(id) {
  return fs.existsSync(genPath(id));
}

/** The format's CLI module, or null while it is not ported yet. */
export async function loadFormat(id) {
  if (!FORMATS[id]) throw new Error(`unknown format "${id}" (have: ${formatIds().join(", ")})`);
  if (!isPorted(id)) return null;
  return import(pathToFileURL(genPath(id)).href);
}
