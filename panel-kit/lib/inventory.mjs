// Thin wrapper over the tool's own `gen.mjs --list --json` (the stable contract).
// The GUI never screen-scrapes the human --list.

import { spawnSync } from "node:child_process";
import path from "node:path";

export function getInventory(root, { timeout = 60000 } = {}) {
  const r = spawnSync(process.execPath, ["gen.mjs", "--list", "--json"], {
    cwd: root,
    encoding: "utf8",
    timeout,
  });
  if (r.error) throw new Error(`inventory failed: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`inventory exited ${r.status}: ${(r.stderr || "").trim().slice(0, 400)}`);
  }
  try {
    return JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`inventory returned non-JSON: ${e.message}`);
  }
}

/** Resolve the config file for a name, asserting it stays inside the tool root. */
export function configPath(root, schema, name) {
  return path.join(root, schema.configDir, `${name}.toml`);
}
