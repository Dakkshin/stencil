/**
 * Chrome and sharp, from this repo's own node_modules.
 *
 * Every fork resolved Playwright "locally, else from ../../OBA/oba-website", because no
 * fork declared it. Stencil declares both once (package.json), so resolution is local and
 * a missing install is a clear error rather than a silent reach into another project.
 *
 * Launch order matches what already worked on this machine: the installed Chrome channel,
 * then the system binary, then Playwright's bundled Chromium. --no-sandbox throughout.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium = null;

export function loadChromium() {
  if (chromium) return chromium;
  try {
    chromium = require("playwright").chromium;
  } catch {
    throw new Error("playwright is not installed in stencil/node_modules — run `npm install` in the stencil folder");
  }
  return chromium;
}

/** sharp is optional at call sites that can fall back (a second DPR-1 capture, say). */
export function loadSharp() {
  try {
    return require("sharp");
  } catch {
    return null;
  }
}

export const LAUNCH_CANDIDATES = [
  { channel: "chrome", args: ["--no-sandbox"] },
  { executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox"] },
  { args: ["--no-sandbox"] },
];

export async function launch() {
  const pw = loadChromium();
  let lastErr;
  for (const opts of LAUNCH_CANDIDATES) {
    try {
      return await pw.launch(opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
