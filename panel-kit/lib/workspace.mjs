// Content lives outside the instrument.
//
// The kit is the instrument: code + design system, publishable, no data.
// A *workspace* is where a user's content lives: configs, headshots, panelist
// profiles, QRs, outputs. It defaults to the tool's own directory (so existing
// setups keep working) and can be redirected to any folder — one shared
// workspace can serve several tools.
//
//   PANEL_WORKSPACE=/data/panels node gen.mjs <name>
//   node gui.mjs            (reads PANEL_WORKSPACE too)

import fs from "node:fs";
import path from "node:path";

export function resolveWorkspace(toolDir, explicit) {
  const raw = explicit || process.env.PANEL_WORKSPACE || toolDir;
  return path.resolve(raw);
}

/** Standard content subdirectories under a workspace. */
export function workspacePaths(ws) {
  return {
    root: ws,
    headshots: path.join(ws, "headshots"),
    panelists: path.join(ws, "panelists"),
    qrs: path.join(ws, "qrs"),
    logos: path.join(ws, "logos"),
    out: path.join(ws, "out"),
    canva: path.join(ws, "canva"),
    preview: path.join(ws, "preview"),
    gen: path.join(ws, ".gen"),
  };
}

export function ensureDirs(...dirs) {
  for (const d of dirs) if (d && !fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/** Resolve a bare filename against a preferred dir, then any fallbacks. */
export function findFile(name, dirs) {
  if (!name) return "";
  if (name.startsWith("data:") || path.isAbsolute(name)) return fs.existsSync(name) ? name : "";
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return "";
}
