/**
 * The output contract, frozen (plan AD-3).
 *
 * These names are how a person reviews output before anything is published, and what a
 * future publishing step will read without parsing SVG. They are the forks' names,
 * unchanged, relative to the workspace root. Changing one is a breaking change.
 *
 * Every function returns workspace-relative paths, in a stable order.
 */
import fs from "node:fs";
import path from "node:path";
import { INPUT_DIRS, inputDir } from "./paths.mjs";

const two = (n) => String(n).padStart(2, "0");

export const CONTRACT = {
  /** 640x200 strip; `stem` is the panel's `output` key without ".png", else the name. */
  banner(name, { stem = name } = {}) {
    return [`out/${stem}.png`, `out/${stem}@3x.png`, `canva/${stem}.svg`, `.gen/${name}.json`];
  },

  /** 2560x1440 PNG; the SVG carries the brand prefix (OBA or IU), the PNG does not. */
  thumb(name, { prefix }) {
    if (!prefix) throw new Error("thumb outputs need the brand prefix (OBA or IU)");
    return [`canva/${prefix}-${name}.svg`, `preview/${name}.png`, `.gen/${name}.json`];
  },

  /**
   * One SVG and one @2x PNG per requested format. A campaign nests them as
   * <campaign>/<person or "shared">/<format>/<stem>; otherwise <stem>-<format>.
   */
  social(name, { stem = name, formats, campaign = "", person = "" }) {
    const files = [];
    for (const fmt of formats) {
      if (campaign) {
        const dir = `${campaign}/${person || "shared"}/${fmt}`;
        files.push(`canva/${dir}/${stem}.svg`, `out/${dir}/${stem}@2x.png`);
      } else {
        files.push(`canva/${stem}-${fmt}.svg`, `out/${stem}-${fmt}@2x.png`);
      }
    }
    files.push(`.gen/${name}.json`);
    return files;
  },

  /** One numbered SVG and @2x PNG per slide, plus the vector PDF. slides: [type, ...]. */
  deck(name, { slides }) {
    const svgs = slides.map((type, i) => `canva/${name}/${two(i + 1)}-${type}.svg`);
    const pngs = slides.map((type, i) => `out/${name}/${two(i + 1)}-${type}@2x.png`);
    return [...svgs, ...pngs, `out/${name}.pdf`, `.gen/${name}.json`];
  },

  /** The Zoom host background: one fixed set. */
  background() {
    return ["canva/host-background.svg", "out/host-background.png", "out/host-background.jpg"];
  },
};

/* Names a format owns outright, so no other format may build an input called that. */
const RESERVED = { background: ["host-background"] };

/**
 * `.gen/<name>.json` is shared by every format, so one name may belong to one format.
 * Returns a human-readable clash message, or "" when the name is free.
 */
export function nameClash(format, name) {
  for (const [other, names] of Object.entries(RESERVED)) {
    if (other !== format && names.includes(name)) return `"${name}" is reserved by the ${other} format`;
  }
  for (const other of Object.keys(INPUT_DIRS)) {
    if (other === format) continue;
    const file = path.join(inputDir(other), `${name}.toml`);
    if (fs.existsSync(file)) {
      const mine = INPUT_DIRS[format] ? path.join(inputDir(format), `${name}.toml`) : `(${format})`;
      return `"${name}" exists as a ${other} input (${file}) and as ${mine}; .gen/${name}.json is shared, so rename one`;
    }
  }
  return "";
}
