// @ekwa/panel-kit — shared GUI/HTTP-API engine for the Ekwa content tools.

import { spawn } from "node:child_process";
import { createServer } from "./server.mjs";

export { createServer } from "./server.mjs";
export { defineSchema } from "./schema.mjs";
export { parseToml, setValue, setArray, appendBlock, removeBlock } from "./toml-io.mjs";
export { getInventory } from "./inventory.mjs";
export { listAssets, saveAsset, deleteAsset } from "./assets.mjs";
export { startRun, getRun, listArtifactsSince } from "./runner.mjs";
export { safeResolve, safeScopePath, assertName } from "./paths.mjs";

/**
 * Start the server and (optionally) open the browser. Returns the bound URL and
 * the per-process API token.
 */
export function launch({ schema, root, port = 0, host = "127.0.0.1", open = true } = {}) {
  const { app, token, root: toolRoot } = createServer({ schema, root });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const actual = server.address().port;
      const url = `http://${host}:${actual}`;
      if (open) openBrowser(url);
      resolve({ server, url, token, root: toolRoot });
    });
    server.on("error", reject);
  });
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* headless is fine — print the URL instead */
  }
}
