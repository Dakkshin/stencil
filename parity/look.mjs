#!/usr/bin/env node
/**
 * Contact sheets for the human look (plan A4): one image per format, every case's
 * golden | Stencil | difference strip stacked and labelled, so a person can review a whole
 * format at a glance before its fork retires.
 *
 *   node parity/look.mjs [<format>...]    default: every format with look images
 *
 * Reads .parity/look/<format>/*.png (written by parity/run.mjs), writes
 * .parity/look/<format>-sheet.png and .parity/look/README.md (links to every sheet).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOOK = path.join(ROOT, ".parity", "look");

/* Strips per sheet: beyond this a sheet is split into numbered parts. */
const PER_SHEET = 24;

function sheet(format) {
  const dir = path.join(LOOK, format);
  const strips = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  /* Raw @3x/@2x captures duplicate the downscaled image for banners; keep both but put
     the shipped size first. */
  const parts = [];
  for (let i = 0; i < strips.length; i += PER_SHEET) {
    const chunk = strips.slice(i, i + PER_SHEET);
    const out = path.join(LOOK, `${format}-sheet${strips.length > PER_SHEET ? `-${i / PER_SHEET + 1}` : ""}.png`);
    const args = [];
    for (const f of chunk) {
      const label = f.replace(/\.png\.png$/, ".png").replace(/__/g, "/");
      args.push("(", path.join(dir, f), "-resize", "1800x>", "-background", "#1b1b1b", "-fill", "#e8e8e8",
        "-font", "DejaVu-Sans", "-pointsize", "18", `label:${label}`, "+swap", "-gravity", "west", "-append", ")");
    }
    /* Spacer rows go under each strip: -splice follows gravity, and west would cut them
       through the middle of every image. */
    const r = spawnSync("magick", [...args, "-background", "#1b1b1b", "-gravity", "south", "-splice", "0x12", "-gravity", "west", "-append", out], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`magick failed for ${format}: ${r.stderr}`);
    parts.push({ file: path.basename(out), count: chunk.length });
  }
  return { format, strips: strips.length, parts };
}

const wanted = process.argv.slice(2);
const formats = (wanted.length ? wanted : fs.existsSync(LOOK) ? fs.readdirSync(LOOK) : []).filter((f) => fs.existsSync(path.join(LOOK, f)) && fs.statSync(path.join(LOOK, f)).isDirectory());
const made = formats.map(sheet);

const lines = [
  "# The human look",
  "",
  "Each strip is golden (the fork's own output) | Stencil | difference (red marks any changed pixel).",
  "A blank third panel means identical. Numbers and verdicts: ../report.md.",
  "",
];
for (const m of made) {
  lines.push(`## ${m.format} (${m.strips} images)`, "");
  for (const p of m.parts) lines.push(`- [${p.file}](${p.file}) (${p.count})`);
  lines.push("");
}
fs.writeFileSync(path.join(LOOK, "README.md"), lines.join("\n"));
for (const m of made) console.log(`  ${m.format}: ${m.strips} strips -> ${m.parts.map((p) => p.file).join(", ")}`);
