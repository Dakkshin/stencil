/**
 * Judge one golden output against Stencil's (plan AD-5).
 *
 *   .json  deep-equal after mapping asset paths and file URIs to file names; a `brand`
 *          object is compared on the fork's keys only (Stencil packs may carry more)
 *   .svg   text-equal after the same path mapping
 *   .png   pixel-identical, or mean absolute error within the case file's tolerance for
 *          outputs that are resampled (sharp downscales); same size always
 *   .jpg   within tolerance (lossy encoding)
 *   .pdf   same page count and the same embedded font families
 *   other  byte-equal
 *
 * Returns { verdict: "exact" | "close" | "FAIL", detail }.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* Scratch trees (golden copies, Stencil parity workspaces) and the real Automation folder. */
const ROOTS = [
  path.join(process.env.STENCIL_PARITY_TMP || os.tmpdir()),
  os.tmpdir(),
  path.dirname(path.dirname(fileURLToPath(import.meta.url))), // this checkout (a lane worktree may live anywhere)
  path.resolve(process.env.STENCIL_SOURCES || path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))),
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATH_RES = ROOTS.flatMap((r) => [r, encodeURI(r)]).map((r) => new RegExp(`(?:file://)?${esc(r)}/[^"'<>)\\n]*`, "g"));
/* A relative asset path ("assets/oba-logo-white.png") or a bare asset file name: the forks
   kept logos beside their own registry, Stencil keeps them in assets/logos/. */
const REL_ASSET = /^(?:[\w@. -]+\/)*([\w@. -]+\.(?:png|jpe?g|webp|svg|woff2|toml))$/i;

/** Map absolute paths and file URIs under the known roots, and relative asset paths, to file names. */
export function normalizePaths(text) {
  let out = text;
  for (const re of PATH_RES) out = out.replace(re, (m) => `<file:${decodeURI(path.basename(m))}>`);
  return out;
}

function normalizeValue(v) {
  if (typeof v === "string") {
    if (v.startsWith("data:")) return v;
    const n = normalizePaths(v);
    const rel = n.match(REL_ASSET);
    return rel ? `<file:${rel[1]}>` : n;
  }
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizeValue(x)]));
  return v;
}

/* First differing JSON path, for a readable failure. */
function firstDiff(a, b, at = "$") {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) return `${at}: ${JSON.stringify(a)?.slice(0, 120)} vs ${JSON.stringify(b)?.slice(0, 120)}`;
  if (a && typeof a === "object") {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      if (!(k in a)) return `${at}.${k}: only in Stencil`;
      if (!(k in b)) return `${at}.${k}: missing in Stencil`;
      const d = firstDiff(a[k], b[k], `${at}.${k}`);
      if (d) return d;
    }
    return "";
  }
  return a === b ? "" : `${at}: ${JSON.stringify(a)?.slice(0, 120)} vs ${JSON.stringify(b)?.slice(0, 120)}`;
}

function pickBrand(golden, stencil) {
  if (golden?.brand && typeof golden.brand === "object" && stencil?.brand && typeof stencil.brand === "object") {
    const keys = Object.keys(golden.brand);
    stencil = { ...stencil, brand: Object.fromEntries(keys.filter((k) => k in stencil.brand).map((k) => [k, stencil.brand[k]])) };
  }
  return stencil;
}

export function compareJson(gFile, sFile) {
  const g = normalizeValue(JSON.parse(fs.readFileSync(gFile, "utf8")));
  const s = pickBrand(g, normalizeValue(JSON.parse(fs.readFileSync(sFile, "utf8"))));
  const d = firstDiff(g, s);
  return d ? { verdict: "FAIL", detail: d } : { verdict: "exact", detail: "" };
}

export function compareText(gFile, sFile) {
  const g = normalizePaths(fs.readFileSync(gFile, "utf8"));
  const s = normalizePaths(fs.readFileSync(sFile, "utf8"));
  if (g === s) return { verdict: "exact", detail: "" };
  const gl = g.split("\n");
  const sl = s.split("\n");
  let i = 0;
  while (i < gl.length && gl[i] === sl[i]) i++;
  const clip = (t = "") => (t.length > 140 ? `${t.slice(0, 140)}…` : t);
  return { verdict: "FAIL", detail: `line ${i + 1}: golden ${JSON.stringify(clip(gl[i]))} vs stencil ${JSON.stringify(clip(sl[i]))}` };
}

function magick(args) {
  return spawnSync("magick", args, { encoding: "utf8" });
}

function size(file) {
  return magick(["identify", "-format", "%wx%h", file]).stdout.trim();
}

export function compareImage(gFile, sFile, { mae: limit = 0 } = {}) {
  const gs = size(gFile);
  const ss = size(sFile);
  if (gs !== ss) return { verdict: "FAIL", detail: `size ${gs} vs ${ss}` };
  /* AE is 0 only for identical images. (ImageMagick 7.1.2 reports AE weighted, not as a
     count, so the count of differing pixels comes from a thresholded difference.) */
  const ae = magick(["compare", "-metric", "AE", gFile, sFile, "null:"]);
  if (Number.parseFloat((ae.stderr || "").trim().split(/\s/)[0]) === 0) return { verdict: "exact", detail: "" };
  const count = magick([gFile, sFile, "-compose", "difference", "-composite", "-colorspace", "gray", "-threshold", "0", "-format", "%[fx:round(mean*w*h)]", "info:"]);
  const differing = Number.parseInt(count.stdout.trim(), 10);
  const m = magick(["compare", "-metric", "MAE", gFile, sFile, "null:"]);
  const norm = Number.parseFloat(((m.stderr || "").match(/\(([\d.e-]+)\)/) || [])[1]);
  const detail = `${differing} px differ, MAE ${Number.isFinite(norm) ? norm.toFixed(5) : "?"}`;
  if (Number.isFinite(norm) && norm <= limit) return { verdict: "close", detail: `${detail} (limit ${limit})` };
  return { verdict: "FAIL", detail: limit ? `${detail} (limit ${limit})` : `${detail} (must be identical)` };
}

function pdfFacts(file) {
  const info = spawnSync("pdfinfo", [file], { encoding: "utf8" }).stdout;
  const pages = (info.match(/^Pages:\s+(\d+)/m) || [])[1];
  const fonts = spawnSync("pdffonts", [file], { encoding: "utf8" })
    .stdout.split("\n")
    .slice(2)
    .map((l) => l.split(/\s+/)[0].replace(/^[A-Z]{6}\+/, "").replace(/-.*$/, ""))
    .filter(Boolean);
  return { pages, fonts: [...new Set(fonts)].sort().join(",") };
}

export function comparePdf(gFile, sFile) {
  const g = pdfFacts(gFile);
  const s = pdfFacts(sFile);
  if (g.pages !== s.pages) return { verdict: "FAIL", detail: `pages ${g.pages} vs ${s.pages}` };
  if (g.fonts !== s.fonts) return { verdict: "FAIL", detail: `fonts ${g.fonts} vs ${s.fonts}` };
  return { verdict: "exact", detail: `${g.pages} pages, fonts ${g.fonts}` };
}

/** Pick the rule for a file. `tolerance` comes from the format's case file. */
export function compareFile(rel, gFile, sFile, tolerance = []) {
  const ext = path.extname(rel).toLowerCase();
  const rule = tolerance.find((t) => t.match.test(rel)) || {};
  if (ext === ".json") return compareJson(gFile, sFile);
  if (ext === ".svg" || ext === ".html" || ext === ".md") return compareText(gFile, sFile);
  if (ext === ".png") return compareImage(gFile, sFile, rule);
  if (ext === ".jpg" || ext === ".jpeg") return compareImage(gFile, sFile, { mae: rule.mae ?? 0.002 });
  if (ext === ".pdf") return comparePdf(gFile, sFile);
  return fs.readFileSync(gFile).equals(fs.readFileSync(sFile)) ? { verdict: "exact", detail: "" } : { verdict: "FAIL", detail: "bytes differ" };
}

/** Golden | Stencil | difference, side by side, at most 2400px wide, for the human look. */
export function sideBySide(gFile, sFile, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const diff = `${outFile}.diff.png`;
  magick(["compare", gFile, sFile, "-compose", "src", "-highlight-color", "#ff2d55", "-lowlight-color", "#00000000", diff]);
  const parts = fs.existsSync(diff) ? [gFile, sFile, diff] : [gFile, sFile];
  magick([...parts, "-background", "#808080", "-splice", "8x0", "+append", "-resize", "2400x>", outFile]);
  fs.rmSync(diff, { force: true });
}
