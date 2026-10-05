/**
 * A small, zero-dependency TOML-subset parser for OBA episode configs.
 *
 * Supports exactly what gen.mjs needs:
 *   - comments (`#` to end of line, outside strings)
 *   - `key = value` pairs (top level and inside `[[array-of-tables]]`)
 *   - basic strings ("...", with \n \t \r \" \\ \/ \uXXXX escapes)
 *   - literal strings ('...', no escapes)
 *   - integers, booleans
 *   - arrays of those values, optionally spanning multiple lines
 *   - `[[guests]]` array-of-tables blocks
 *   - plain tables `[event]` (single level)
 *
 * Everything else (nested tables, inline tables, dates, multiline strings)
 * deliberately throws a clear error with the offending line number.
 *
 * Usage: import { parseToml } from "./lib/toml.mjs";
 */

function TomlError(line, message) {
  const err = new Error(`TOML line ${line}: ${message}`);
  err.name = "TomlError";
  err.line = line;
  return err;
}

/* Remove a trailing `# comment`, respecting quotes and brackets. */
function stripComment(line) {
  let quote = null; // '"' or "'", null when outside a string
  let depth = 0; // bracket depth
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < line.length) i++; // skip escaped char
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
    } else if (ch === "#" && depth === 0) {
      return line.slice(0, i);
    }
  }
  return line;
}

/* Index of the first `=` that separates a key from its value (not inside
   quotes or brackets). Returns -1 if there is none. */
function findTopLevelEquals(text) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < text.length) i++;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
    } else if (ch === "=" && depth === 0) {
      return i;
    }
  }
  return -1;
}

/* Does the value-looking part of `full` have balanced quotes and brackets?
   Used to decide whether an array continues on the next line. */
function hasBalancedValue(full) {
  let quote = null;
  let depth = 0;
  for (let i = 0; i < full.length; i++) {
    const ch = full[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < full.length) i++;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
    }
  }
  return quote === null && depth === 0;
}

/* Parse a basic "..." string body (without the surrounding quotes). */
function parseBasicString(body, line) {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = body[++i];
    if (next === undefined) throw TomlError(line, `unterminated escape in string`);
    switch (next) {
      case "n": out += "\n"; break;
      case "t": out += "\t"; break;
      case "r": out += "\r"; break;
      case '"': out += '"'; break;
      case "\\": out += "\\"; break;
      case "/": out += "/"; break;
      case "u": {
        const hex = body.slice(i + 1, i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex))
          throw TomlError(line, `invalid \\u escape (need 4 hex digits)`);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
        break;
      }
      default:
        throw TomlError(line, `unsupported escape "\\${next}"`);
    }
  }
  return out;
}

/* Parse a single value token. `raw` has already been trimmed. */
function parseValue(raw, line, key) {
  if (raw === "") throw TomlError(line, `empty value for "${key}"`);
  if (raw[0] === '"') {
    if (raw.length < 2 || raw[raw.length - 1] !== '"')
      throw TomlError(line, `unterminated string for "${key}"`);
    return parseBasicString(raw.slice(1, -1), line);
  }
  if (raw[0] === "'") {
    if (raw.length < 2 || raw[raw.length - 1] !== "'")
      throw TomlError(line, `unterminated literal string for "${key}"`);
    return raw.slice(1, -1);
  }
  if (raw[0] === "[") {
    if (raw[raw.length - 1] !== "]")
      throw TomlError(line, `unterminated array for "${key}"`);
    const inner = raw.slice(1, -1);
    return parseArray(inner, line, key);
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^[+-]?\d+$/.test(raw)) return parseInt(raw, 10);
  throw TomlError(line, `cannot parse value for "${key}" (got "${raw.slice(0, 40)}")`);
}

/* Parse the comma-separated body of an array (between the outer brackets). */
function parseArray(inner, line, key) {
  const out = [];
  let i = 0;
  const pushToken = (token) => {
    const t = token.trim();
    if (t !== "") out.push(parseValue(t, line, key));
  };
  let current = "";
  let quote = null;
  while (i < inner.length) {
    const ch = inner[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < inner.length) {
        current += inner[++i];
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      pushToken(current);
      current = "";
    } else {
      current += ch;
    }
    i++;
  }
  pushToken(current);
  return out;
}

/**
 * Parse TOML text into a plain JS object.
 * @param {string} text
 * @returns {object}
 */
export function parseToml(text) {
  const root = {};
  let currentTable = null; // object being populated (inside [[...]])
  const lines = String(text).split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let line = stripComment(lines[i]).trim();
    if (!line) continue;

    if (line.startsWith("[[") && line.endsWith("]]")) {
      const name = line.slice(2, -2).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        throw TomlError(lineNo, `invalid array-of-tables name "${name}"`);
      if (!Array.isArray(root[name])) root[name] = [];
      currentTable = {};
      root[name].push(currentTable);
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      const name = line.slice(1, -1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        throw TomlError(lineNo, `invalid table name "${name}"`);
      if (!root[name] || typeof root[name] !== "object" || Array.isArray(root[name])) {
        root[name] = {};
      }
      currentTable = root[name];
      continue;
    }

    /* key = value, where the value may span multiple lines (arrays). */
    let full = line;
    while (findTopLevelEquals(full) < 0 || !hasBalancedValue(full)) {
      if (i + 1 >= lines.length)
        throw TomlError(lineNo, `unterminated value (started with "${full.slice(0, 40)}")`);
      full += "\n" + lines[++i];
    }

    const eq = findTopLevelEquals(full);
    if (eq < 0) throw TomlError(lineNo, `expected "key = value", got "${full.slice(0, 40)}"`);
    const key = full.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      throw TomlError(lineNo, `invalid key "${key}"`);
    const rawVal = full.slice(eq + 1).trim();
    const value = parseValue(rawVal, lineNo, key);
    (currentTable || root)[key] = value;
  }

  return root;
}
