/**
 * A tiny scene graph → one SVG string.
 *
 * The SVG is both deliverables: it is written to canva/ as the Canva-editable
 * file, and render.mjs has Chrome rasterise the *same* SVG into the retina PNG.
 * So the PNG and the SVG cannot drift.
 *
 * Canva-safety rules honoured here:
 *   - plain <text> per line, fonts embedded as woff2 data URIs
 *   - one element = one named layer (data-name)
 *   - no filters, masks, blend modes or backdrop blur; alpha is per node
 *   - gradients and clip paths only (Canva imports both)
 *
 * Usage:
 *   const s = new Scene(1080, 1080);
 *   s.rect({ x, y, w, h, rx, fill, name });
 *   s.text({ x, top, lines, font, lh, fill, name });
 *   s.toSvg();
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VARIANTS, FAMILY, variantKey } from "./fonts.mjs";
import { baseline, shown } from "./text.mjs";
import { FONTS } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = FONTS;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const n = (v) => (Number.isFinite(v) ? Number(v.toFixed(2)) : 0);

/* "rgba(r,g,b,a)" → { color: "#rrggbb", alpha }; hex passes through. */
export function splitColor(c) {
  const m = String(c).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return { color: c, alpha: 1 };
  const hex = [m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, "0")).join("");
  return { color: `#${hex}`, alpha: m[4] != null ? +m[4] : 1 };
}

export class Scene {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.defs = [];
    this.stack = [[]];
    this.fonts = new Set();
    this.textSizes = []; // [{ size, name, text }] — for the legibility guard
    this.seq = 0;
  }

  id(prefix) {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  get out() {
    return this.stack[this.stack.length - 1];
  }

  /* ---- paint ---- */

  /** Paint → attribute string. `paint` is a colour string or a gradient object:
      { type:"linear", x1,y1,x2,y2, stops:[[color, offset, alpha?]] } (0–1, objectBoundingBox)
      { type:"radial", cx,cy,r, stops } (userSpace if `user:true`, px). */
  paint(attr, paint, opacity) {
    if (paint == null || paint === "none") return `${attr}="none"`;
    if (typeof paint === "string") {
      const { color, alpha } = splitColor(paint);
      const a = alpha * (opacity ?? 1);
      return `${attr}="${color}"${a < 1 ? ` ${attr}-opacity="${n(a)}"` : ""}`;
    }
    const id = this.id("g");
    const stops = paint.stops
      .map(([c, o, a]) => {
        const sc = splitColor(c);
        const alpha = (a ?? 1) * sc.alpha;
        return `<stop offset="${n(o)}" stop-color="${sc.color}"${alpha < 1 ? ` stop-opacity="${n(alpha)}"` : ""}/>`;
      })
      .join("");
    const units = paint.user ? ` gradientUnits="userSpaceOnUse"` : "";
    if (paint.type === "radial") {
      const t = paint.transform ? ` gradientTransform="${paint.transform}"` : "";
      this.defs.push(`<radialGradient id="${id}"${units} cx="${n(paint.cx)}" cy="${n(paint.cy)}" r="${n(paint.r)}"${t}>${stops}</radialGradient>`);
    } else {
      this.defs.push(`<linearGradient id="${id}"${units} x1="${n(paint.x1)}" y1="${n(paint.y1)}" x2="${n(paint.x2)}" y2="${n(paint.y2)}">${stops}</linearGradient>`);
    }
    return `${attr}="url(#${id})"${opacity != null && opacity < 1 ? ` ${attr}-opacity="${n(opacity)}"` : ""}`;
  }

  name(nm) {
    return nm ? ` data-name="${esc(nm)}"` : "";
  }

  /* ---- clip ---- */

  /** Returns a clip-path id for a rounded rect or circle. */
  clip(shape) {
    const id = this.id("clip");
    const el = shape.r != null && shape.cx != null
      ? `<circle cx="${n(shape.cx)}" cy="${n(shape.cy)}" r="${n(shape.r)}"/>`
      : shape.d
        ? `<path d="${shape.d}"/>`
        : `<rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(shape.h)}" rx="${n(shape.rx || 0)}"/>`;
    this.defs.push(`<clipPath id="${id}">${el}</clipPath>`);
    return id;
  }

  /* ---- nodes ---- */

  group(name, fn, { clip, opacity, transform } = {}) {
    this.stack.push([]);
    fn();
    const kids = this.stack.pop();
    const attrs = [
      this.name(name),
      clip ? ` clip-path="url(#${this.clip(clip)})"` : "",
      opacity != null && opacity < 1 ? ` opacity="${n(opacity)}"` : "",
      transform ? ` transform="${transform}"` : "",
    ].join("");
    this.out.push(`<g${attrs}>\n${kids.join("\n")}\n</g>`);
  }

  rect({ x, y, w, h, rx = 0, fill, stroke, sw = 1, opacity, strokeOpacity, name }) {
    const s = stroke ? ` ${this.paint("stroke", stroke, strokeOpacity)} stroke-width="${n(sw)}"` : "";
    this.out.push(`<rect${this.name(name)} x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rx ? ` rx="${n(Math.min(rx, h / 2, w / 2))}"` : ""} ${this.paint("fill", fill, opacity)}${s}/>`);
  }

  circle({ cx, cy, r, fill = "none", stroke, sw = 1, opacity, strokeOpacity, name }) {
    const s = stroke ? ` ${this.paint("stroke", stroke, strokeOpacity)} stroke-width="${n(sw)}"` : "";
    this.out.push(`<circle${this.name(name)} cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${this.paint("fill", fill, opacity)}${s}/>`);
  }

  ellipse({ cx, cy, rx, ry, fill, opacity, name }) {
    this.out.push(`<ellipse${this.name(name)} cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" ${this.paint("fill", fill, opacity)}/>`);
  }

  path({ d, fill = "none", stroke, sw = 1, opacity, strokeOpacity, cap = "round", join = "round", transform, name }) {
    const s = stroke ? ` ${this.paint("stroke", stroke, strokeOpacity)} stroke-width="${n(sw)}" stroke-linecap="${cap}" stroke-linejoin="${join}"` : "";
    const t = transform ? ` transform="${transform}"` : "";
    this.out.push(`<path${this.name(name)} d="${d}" ${this.paint("fill", fill, opacity)}${s}${t}/>`);
  }

  image({ href, x, y, w, h, clip, opacity, fit = "none", name }) {
    const c = clip ? ` clip-path="url(#${this.clip(clip)})"` : "";
    const o = opacity != null && opacity < 1 ? ` opacity="${n(opacity)}"` : "";
    this.out.push(`<image${this.name(name)} href="${href}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="${fit === "cover" ? "xMidYMid slice" : "none"}"${c}${o}/>`);
  }

  /**
   * Text block. `top` is the top of the first line box; each line gets its own
   * <text> (Canva keeps them editable). `anchor` = start | middle | end.
   * Returns the block height (lines × lh).
   */
  text({ x, top, lines, font, lh, fill, opacity, anchor = "start", name }) {
    const key = variantKey(font);
    if (!key) throw new Error(`scene: no font variant for ${JSON.stringify(font)}`);
    this.fonts.add(key);
    this.textSizes.push({ size: font.size, name: name || "text", text: String(Array.isArray(lines) ? lines[0] : lines).slice(0, 40) });
    const lineH = lh ?? font.size * 1.2;
    const family = FAMILY[font.role];
    const ls = font.tracking ? ` letter-spacing="${n(font.tracking * font.size)}"` : "";
    const st = font.style === "italic" ? ` font-style="italic"` : "";
    const an = anchor !== "start" ? ` text-anchor="${anchor}"` : "";
    (Array.isArray(lines) ? lines : [lines]).forEach((line, i) => {
      const y = top + i * lineH + baseline(font, lineH);
      this.out.push(
        `<text${this.name(name ? `${name}${lines.length > 1 ? ` ${i + 1}` : ""}` : null)} x="${n(x)}" y="${n(y)}" font-family="${family}" font-size="${n(font.size)}" font-weight="${font.weight}"${st}${ls}${an} ${this.paint("fill", fill, opacity)}>${esc(shown(line, font))}</text>`,
      );
    });
    return (Array.isArray(lines) ? lines.length : 1) * lineH;
  }

  raw(svg) {
    this.out.push(svg);
  }

  /* ---- output ---- */

  fontCss() {
    return VARIANTS.filter((v) => this.fonts.has(v.key))
      .map((v) => {
        const b64 = fs.readFileSync(path.join(FONT_DIR, v.file)).toString("base64");
        return `@font-face{font-family:"${v.family}";font-style:${v.style};font-weight:${v.weight};src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
      })
      .join("");
  }

  toSvg() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">
<style>${this.fontCss()}text{text-rendering:geometricPrecision}</style>
<defs>${this.defs.join("")}</defs>
${this.stack[0].join("\n")}
</svg>
`;
  }
}
