// Path safety. Every filesystem path the server touches is resolved and asserted
// to stay inside the tool root before any read/write.

import path from "node:path";

export function assertName(name) {
  const n = String(name ?? "");
  if (!/^[A-Za-z0-9._-]+$/.test(n) || n === "." || n === "..") {
    const e = new Error(`invalid name: ${JSON.stringify(name)}`);
    e.code = "BAD_NAME";
    throw e;
  }
  return n;
}

export function safeResolve(root, ...parts) {
  const resolved = path.resolve(root, ...parts);
  const rel = path.relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    const e = new Error("path escapes the tool root");
    e.code = "PATH_TRAVERSAL";
    throw e;
  }
  return resolved;
}

/** Resolve a `scope/rest` reference against the tool root, rejecting traversal. */
export function safeScopePath(root, scope, rest) {
  const clean = String(rest ?? "").replace(/^\/+/, "");
  if (clean.split(/[\\/]/).some((s) => s === "..")) {
    const e = new Error("path traversal rejected");
    e.code = "PATH_TRAVERSAL";
    throw e;
  }
  return safeResolve(root, String(scope ?? ""), clean);
}
