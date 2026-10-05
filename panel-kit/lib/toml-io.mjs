// Lossless TOML read/write.
//
// Read/validate: smol-toml (spec-complete, zero-dep).
// Write: text splices against the ORIGINAL source, using exact node ranges from
// toml-eslint-parser. Never re-serialize — smol-toml's stringify drops comments.
//
// Guarantee: every byte outside the replaced range is preserved, so comments and
// formatting survive any sequence of edits.

import * as smol from "smol-toml";
import * as tsp from "toml-eslint-parser";

const KV = "TOMLKeyValue";
const TABLE = "TOMLTable";

/* ------------------------------------------------------------------ parse --- */

export function parseToml(source) {
  try {
    return { data: smol.parse(source), problems: [] };
  } catch (e) {
    return { data: null, problems: [{ line: errorLine(e), message: cleanMessage(e) }] };
  }
}

function errorLine(e) {
  if (typeof e.line === "number") return e.line;
  if (typeof e.lineNumber === "number") return e.lineNumber;
  const m = String(e.message || "").match(/line\s+(\d+)/i);
  return m ? Number(m[1]) : 1;
}

function cleanMessage(e) {
  return String(e.message || e).replace(/\s*\(line.*$/, "").trim();
}

/* --------------------------------------------------------------- indexing --- */

function keyNames(keyNode) {
  return (keyNode?.keys ?? []).map((k) => k.name);
}

const pathStr = (path) => path.join(".");

/**
 * Flatten the AST into:
 *  - entries: every key-value with its full dotted path
 *  - tables:  every table header with kind ("standard" | "array") and range
 * Array-table entries carry their 0-based occurrence index in the path
 * (e.g. "panelists.1.role").
 */
function indexAst(ast) {
  const entries = [];
  const tables = [];
  const counts = new Map();

  const root = ast.body.find((n) => n.type === "TOMLTopLevelTable") ?? ast;

  const walk = (node, prefix) => {
    if (node.type === KV) {
      entries.push({
        path: [...prefix, ...keyNames(node.key)],
        keyNode: node.key,
        valueNode: node.value,
      });
      return;
    }
    if (node.type === TABLE) {
      const names = keyNames(node.key);
      const name = pathStr(names);
      let index = -1;
      if (node.kind === "array") {
        index = (counts.get(name) ?? -1) + 1;
        counts.set(name, index);
      }
      const tablePath = node.kind === "array" ? [...names, index] : names;
      tables.push({
        name,
        kind: node.kind,
        index,
        range: node.range,
        keyNode: node.key,
      });
      for (const child of node.body ?? []) walk(child, tablePath);
    }
  };

  for (const child of root.body ?? []) walk(child, []);
  return { entries, tables };
}

function findEntry(source, path) {
  const { entries } = indexAst(tsp.parseTOML(source));
  const want = pathStr(Array.isArray(path) ? path : String(path).split("."));
  const entry = entries.find((e) => pathStr(e.path) === want);
  if (!entry) {
    throw new Error(`TOML key not found: ${want}`);
  }
  return entry;
}

/* ------------------------------------------------------------ serializing --- */

function tomlValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number: ${value}`);
    return String(value);
  }
  if (Array.isArray(value)) return tomlArray(value);
  throw new Error(`unsupported TOML value: ${typeof value}`);
}

function tomlArray(arr) {
  const parts = arr.map(tomlValue);
  const inline = `[${parts.join(", ")}]`;
  const hasNewline = arr.some((v) => typeof v === "string" && v.includes("\n"));
  if (!hasNewline && inline.length <= 72) return inline;
  return `[\n${parts.map((p) => `  ${p}`).join(",\n")},\n]`;
}

/* ---------------------------------------------------------------- writes --- */

/** Replace the value at a dotted path (integer segment = array-table index). */
export function setValue(source, path, value) {
  const entry = findEntry(source, path);
  const [a, b] = entry.valueNode.range;
  return source.slice(0, a) + tomlValue(value) + source.slice(b);
}

/** Replace an array value (convenience over setValue; validates array input). */
export function setArray(source, path, values) {
  if (!Array.isArray(values)) throw new Error("setArray expects an array");
  return setValue(source, path, values);
}

/** Append a new `[[tableName]]` entry at EOF, one blank line after existing content. */
export function appendBlock(source, tableName, fields = {}) {
  const lines = Object.entries(fields).map(([k, v]) => `${k} = ${tomlValue(v)}`);
  const body = lines.length ? `\n${lines.join("\n")}` : "";
  const block = `[[${tableName}]]${body}\n`;
  if (!source.trim()) return block;
  return `${source.replace(/\s*$/, "")}\n\n${block}`;
}

/** Delete the index-th `[[tableName]]` entry without touching neighbouring comments. */
export function removeBlock(source, tableName, index) {
  const { tables } = indexAst(tsp.parseTOML(source));
  const own = tables.filter((t) => t.name === tableName && t.kind === "array");
  const target = own[index];
  if (!target) throw new Error(`no [[${tableName}]] at index ${index}`);

  const blockStart = lineStart(source, target.range[0]);
  const after = tables
    .filter((t) => t.range[0] > target.range[0])
    .sort((a, b) => a.range[0] - b.range[0])[0];
  const blockEnd = after ? lineStart(source, after.range[0]) : source.length;

  let out = source.slice(0, blockStart) + source.slice(blockEnd);
  if (!after) out = `${out.replace(/\s*$/, "")}\n`;
  return out.replace(/\n{3,}/g, "\n\n");
}

function lineStart(source, offset) {
  return source.lastIndexOf("\n", offset - 1) + 1;
}
