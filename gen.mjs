#!/usr/bin/env node
/**
 * The GUI's door into Stencil.
 *
 * panel-kit (the vendored GUI and HTTP API) runs `node gen.mjs <name> [flags]` and
 * `node gen.mjs --list --json` in the tool root. Stencil has one root for every format,
 * so gui.mjs names the format in STENCIL_FORMAT and this shim forwards there. People and
 * agents use `node stencil.mjs <format> ...` directly.
 */
import { run } from "./stencil.mjs";

const format = process.env.STENCIL_FORMAT;
if (!format) {
  console.error("gen.mjs is the GUI's entry point and needs STENCIL_FORMAT; use node stencil.mjs <format> ... instead");
  process.exit(2);
}
process.exitCode = await run([format, ...process.argv.slice(2)]);
