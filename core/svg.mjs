/**
 * Small SVG helpers every format needs.
 *
 * Moved renderers keep their own copies where the exact output bytes depend on them
 * (font-face formatting, say), so these are for engine code and new layouts.
 */
import fs from "node:fs";
import path from "node:path";

export function escXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const MIME = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
};

export function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
}

export function fileDataUri(file) {
  return `data:${mimeOf(file)};base64,${fs.readFileSync(file).toString("base64")}`;
}

/**
 * `@font-face` rules with each woff2 embedded as base64, so an SVG renders with the
 * brand's real type wherever it is opened. faces: [{ family, weight, style?, file }].
 */
export function fontFaceCss(faces, dir) {
  return faces
    .map((f) => {
      const data = fs.readFileSync(path.join(dir, f.file)).toString("base64");
      return `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style || "normal"};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
    })
    .join("\n");
}
