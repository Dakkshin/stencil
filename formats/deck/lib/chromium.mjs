/**
 * Chromium resolution, shared by the metrics pass and the PNG/PDF renderer.
 *
 * No dependency is declared anywhere in this tree by design, so Playwright is resolved
 * at runtime: a local install if one exists, otherwise the copy inside oba-website's
 * node_modules. Both the launch candidates and the fallback path are copied from
 * panel-social-posts/render.mjs, where they are already known to work on this machine.
 *
 * Callers that can degrade (the metrics pass) should catch and fall back; callers that
 * cannot (the PNG path) should report and continue, never abort the SVG build.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { AUTOMATION } from "./paths.mjs";

let cached = null;

export function loadChromium() {
  if (cached) return cached;
  const local = createRequire(import.meta.url);
  try {
    cached = local("playwright").chromium;
  } catch {
    const sitePkg = path.join(AUTOMATION, "package.json");
    cached = createRequire(sitePkg)("playwright").chromium;
  }
  return cached;
}

/* System Chrome first, then the Playwright bundle. --no-sandbox throughout. */
export async function launch() {
  const chromium = loadChromium();
  const candidates = [
    { channel: "chrome", args: ["--no-sandbox"] },
    { executablePath: "/usr/bin/google-chrome-stable", args: ["--no-sandbox"] },
    { args: ["--no-sandbox"] },
  ];
  let lastErr;
  for (const opts of candidates) {
    try {
      return await chromium.launch(opts);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
