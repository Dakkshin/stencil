/**
 * The brand registry: every pack in brands/, and how a format reads one.
 *
 * A pack is data (plan AD-1): base `tokens`, and per format `{ layout, tokens }`.
 * resolveBrand(id, format) layers them in the order the design note fixes:
 *
 *   brand base  ->  format override  ->  (layout-local defaults, inside the layout)
 *
 * Moved renderers expect the exact brand object their fork's registry produced, so a
 * layout declares the keys it reads and calls pick(); that keeps `.gen/<name>.json` and
 * every renderer seeing the same object they saw before the merge (AD-2).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BRANDS_DIR, LOGOS } from "./paths.mjs";
import { mimeOf } from "./svg.mjs";

const PACKS = {};
for (const f of fs.readdirSync(BRANDS_DIR).filter((f) => f.endsWith(".mjs")).sort()) {
  const pack = (await import(pathToFileURL(path.join(BRANDS_DIR, f)).href)).default;
  if (!pack?.id) throw new Error(`brands/${f} must export default { id, tokens, formats }`);
  if (PACKS[pack.id]) throw new Error(`brand id ${pack.id} is declared twice (brands/${f})`);
  PACKS[pack.id] = pack;
}

/** "iu-light", "iu_light" and "IU_LIGHT" all name the same pack. */
export function normalizeBrandId(raw) {
  return String(raw ?? "").trim().toUpperCase().replace(/-/g, "_");
}

export function brandIds() {
  return Object.keys(PACKS).sort();
}

export function getPack(id) {
  const pack = PACKS[normalizeBrandId(id)];
  if (!pack) throw new Error(`unknown brand "${id}" (have: ${brandIds().join(", ")})`);
  return pack;
}

export function hasBrand(id) {
  return Boolean(PACKS[normalizeBrandId(id)]);
}

/** Brands that have a real design for this format. */
export function brandsFor(format) {
  return brandIds().filter((id) => PACKS[id].formats?.[format]);
}

function formatEntry(pack, format) {
  const entry = pack.formats?.[format];
  if (!entry) {
    const has = Object.keys(pack.formats || {}).join(", ") || "none";
    throw new Error(`brand ${pack.id} has no ${format} design (has: ${has})`);
  }
  return entry;
}

export function layoutFor(id, format) {
  return formatEntry(getPack(id), format).layout;
}

/**
 * The brand object a format reads: the pack's id and label, its base tokens, then this
 * format's overrides. A pack states id and label once, at the top.
 */
export function resolveBrand(id, format) {
  const pack = getPack(id);
  const entry = formatEntry(pack, format);
  return structuredClone({ id: pack.id, label: pack.label, ...pack.tokens, ...(entry.tokens || {}) });
}

/** Format-level settings that are not colours (rules such as a required CE line). */
export function formatOptions(id, format) {
  return structuredClone(formatEntry(getPack(id), format).options || {});
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/** The logo file for a brand in this format, or "" (callers fall back to the wordmark). */
export function logoFile(id, format) {
  const { logo } = resolveBrand(id, format);
  if (!logo) return "";
  const p = path.join(LOGOS, path.basename(logo));
  return fs.existsSync(p) ? p : "";
}

export function logoDataUri(id, format) {
  const p = logoFile(id, format);
  return p ? `data:${mimeOf(p)};base64,${fs.readFileSync(p).toString("base64")}` : "";
}
