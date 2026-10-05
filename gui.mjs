#!/usr/bin/env node
/**
 * One GUI for every surface: the panel-kit front door, pointed at one format.
 *
 *   node gui.mjs <format> [port]       start the GUI and HTTP API for that format
 *   NO_OPEN=1 node gui.mjs <format>    headless (agents, CI): prints the URL and token
 *   node gui.mjs                       list the formats that have a GUI
 *
 * panel-kit is vendored unchanged (panel-kit/VENDORED.md). It spawns gen.mjs in the
 * Stencil root, and gen.mjs forwards to the format named here in STENCIL_FORMAT. The GUI
 * reads and writes inputs under the Stencil root; see panel-kit/docs/CONTRACT.md.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "./panel-kit/lib/index.mjs";
import { ROOT, WORKSPACE } from "./core/paths.mjs";

/* panel-kit reads inputs under the root it is given and runs gen.mjs there, so the GUI
   serves the Stencil folder itself. A custom workspace would split the two silently. */
if (WORKSPACE !== ROOT) {
  console.error(`the GUI serves the Stencil folder (${ROOT}); unset STENCIL_WORKSPACE / PANEL_WORKSPACE (now ${WORKSPACE}) to use it`);
  process.exit(2);
}
const schemaFile = (format) => path.join(ROOT, "formats", format, "schema.mjs");
const withGui = fs.readdirSync(path.join(ROOT, "formats")).filter((f) => fs.existsSync(schemaFile(f))).sort();

const [format, portArg] = process.argv.slice(2);
if (!format || !withGui.includes(format)) {
  console.error(`usage: node gui.mjs <format> [port]\n\nformats with a GUI: ${withGui.join(", ")}`);
  process.exit(format ? 2 : 0);
}

process.env.STENCIL_FORMAT = format;
const schema = (await import(pathToFileURL(schemaFile(format)).href)).default;

/* A format whose preview page is generated (the thumbnail cards template) builds it
   before the GUI serves it. */
const mod = await import(pathToFileURL(path.join(ROOT, "formats", format, "gen.mjs")).href);
if (typeof mod.prepareGui === "function") await mod.prepareGui();
const port = Number(process.env.PORT || portArg || 0);
const { url, token } = await launch({ schema, root: ROOT, port, open: process.env.NO_OPEN !== "1" });

console.log(`\n  ${schema.title} GUI   ${url}`);
console.log(`  API token (send as X-Gui-Token on writes): ${token}\n`);
