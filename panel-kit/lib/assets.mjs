// Asset management: headshots / qrs / logos (+ any dirs the schema declares).

import fs from "node:fs";
import path from "node:path";
import { safeResolve, assertName } from "./paths.mjs";
import { parseToml } from "./toml-io.mjs";

export const ASSET_EXT = {
  headshots: /\.(jpe?g|png|webp)$/i,
  qrs: /\.(png|svg|jpe?g)$/i,
  logos: /\.(png|svg|jpe?g)$/i,
};
const DEFAULT_EXT = /\.(png|svg|jpe?g|webp)$/i;
const MAX_BYTES = 12 * 1024 * 1024;

export function assetKindDir(root, schema, kind) {
  const rel = schema.assetDirs?.[kind];
  if (!rel) {
    const e = new Error(`unknown asset kind: ${kind}`);
    e.code = "UNKNOWN_KIND";
    throw e;
  }
  return safeResolve(root, rel);
}

export function listAssets(root, schema) {
  const out = {};
  for (const kind of Object.keys(schema.assetDirs ?? {})) {
    const dir = assetKindDir(root, schema, kind);
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => !f.startsWith(".") && fs.statSync(path.join(dir, f)).isFile())
      : [];
    out[kind] = files
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, url: `/files/${schema.assetDirs[kind]}/${encodeURIComponent(name)}` }));
  }
  return out;
}

export function extOk(kind, filename) {
  const re = ASSET_EXT[kind] ?? DEFAULT_EXT;
  return re.test(filename);
}

export function saveAsset(root, schema, kind, filename, buffer) {
  const dir = assetKindDir(root, schema, kind);
  const name = assertName(path.basename(String(filename)));
  if (!extOk(kind, name)) {
    const e = new Error(`file type not allowed for ${kind}: ${name}`);
    e.code = "BAD_EXT";
    throw e;
  }
  if (buffer.length > MAX_BYTES) {
    const e = new Error(`file too large (max ${MAX_BYTES / 1048576} MB)`);
    e.code = "TOO_LARGE";
    throw e;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buffer);
  return { name, url: `/files/${schema.assetDirs[kind]}/${encodeURIComponent(name)}` };
}

/** Which configs reference this asset filename (blocks a delete unless forced). */
export function findReferences(root, schema, filename) {
  const dir = path.join(root, schema.configDir);
  if (!fs.existsSync(dir)) return [];
  const hits = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".toml"))) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    if (text.includes(filename)) hits.push(f.replace(/\.toml$/, ""));
  }
  return hits;
}

export function deleteAsset(root, schema, kind, name, { force = false } = {}) {
  const dir = assetKindDir(root, schema, kind);
  const clean = assertName(path.basename(String(name)));
  const abs = path.join(dir, clean);
  if (!fs.existsSync(abs)) {
    const e = new Error(`asset not found: ${clean}`);
    e.code = "NOT_FOUND";
    throw e;
  }
  const refs = findReferences(root, schema, clean);
  if (refs.length && !force) {
    const e = new Error(`asset is referenced by: ${refs.join(", ")}`);
    e.code = "REFERENCED";
    e.details = { references: refs };
    throw e;
  }
  fs.unlinkSync(abs);
  return { name: clean, references: refs };
}

/** Parse a config's TOML (read-only view for GET). */
export function readConfig(root, schema, name) {
  const file = path.join(root, schema.configDir, `${assertName(name)}.toml`);
  if (!fs.existsSync(file)) return null;
  const toml = fs.readFileSync(file, "utf8");
  const { data, problems } = parseToml(toml);
  return { toml, data, problems, mtime: fs.statSync(file).mtimeMs };
}
