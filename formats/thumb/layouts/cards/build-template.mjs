#!/usr/bin/env node
/**
 * build-template.mjs — inline the brand fonts, both logos (full-colour +
 * reversed-white), the atmosphere, the petal mark and the shared layout code
 * into the shipped thumbnail template.
 *
 *   source : template/iu-thumbnail.src.html   (edit this)
 *   output : iu-thumbnail-template.html       (generated — never hand-edit)
 *
 * Everything is embedded as data URIs so the template is fully self-contained:
 * it renders identically under file:// (render.mjs) and over http (the GUI
 * preview at /preview/template), with no external font or asset requests.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTemplate, G } from "./geometry.mjs";
import { SHARED } from "./layout.mjs";
import { atmosphereFragment, petalInner, verifyMotif } from "./motif.mjs";
import { FONTS, LOGOS, ROOT as STENCIL_ROOT } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = STENCIL_ROOT;
const SRC = path.join(__dirname, "template.src.html");
const OUT = path.join(__dirname, "template.html");
const FONT_DIR = FONTS;
const LOGO = path.join(LOGOS, "iu-logo.png");
const LOGO_REVERSED = path.join(LOGOS, "iu-logo-reversed.svg");

/* family, weight, style, filename — order is cosmetic only. */
const FACES = [
  ["InterDisplay", 400, "normal", "InterDisplay-400.woff2"],
  ["InterDisplay", 500, "normal", "InterDisplay-500.woff2"],
  ["InterDisplay", 600, "normal", "InterDisplay-600.woff2"],
  ["Inter", 400, "normal", "Inter-400.woff2"],
  ["Inter", 500, "normal", "Inter-500.woff2"],
  ["Inter", 600, "normal", "Inter-600.woff2"],
  ["EBGaramond", 500, "normal", "EBGaramond-500.woff2"],
  ["EBGaramond", 500, "italic", "EBGaramond-500-italic.woff2"],
];

function dataUri(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

function fontFaces() {
  return FACES.map(([family, weight, style, file]) => {
    const abs = path.join(FONT_DIR, file);
    if (!fs.existsSync(abs)) throw new Error(`missing font: ${file}`);
    const uri = dataUri(abs, "font/woff2");
    return `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url(${uri}) format("woff2");}`;
  }).join("\n");
}

function build() {
  if (!fs.existsSync(SRC)) throw new Error(`missing source template: ${SRC}`);
  if (!fs.existsSync(LOGO)) throw new Error(`missing logo: ${LOGO}`);

  if (!fs.existsSync(LOGO_REVERSED)) throw new Error(`missing reversed logo: ${LOGO_REVERSED}`);

  /* The petal triad is the reversed logo's own first three strokes — if design
     re-traces the mark in a different order, fail loudly rather than silently
     shipping the wrong glyph as the sign-off. */
  if (!verifyMotif(fs.readFileSync(LOGO_REVERSED, "utf8"))) {
    throw new Error(
      `${path.basename(LOGO_REVERSED)} no longer carries the three petal paths first — ` +
      "check lib/motif.mjs PETAL_PATH_INDEXES against the new artwork",
    );
  }

  const html = fs.readFileSync(SRC, "utf8");
  const tokens = [
    "/* __FONT_FACES__ */",
    "__LOGO_DATA_URI__",
    "__LOGO_REVERSED_DATA_URI__",
    "<!-- __ATMOSPHERE__ -->",
    "<!-- __PETAL__ -->",
    "/* __GEOMETRY__ */",
  ];
  for (const t of tokens) {
    if (!html.includes(t)) throw new Error(`source template is missing the ${t} token`);
  }

  /* The template's CSS and lib/geometry.mjs (used by render-svg.mjs) describe
     the same geometry; refuse to build if they have drifted apart. */
  const drift = verifyTemplate(html);
  if (drift.length) {
    throw new Error(
      "template/iu-thumbnail.src.html has drifted from lib/geometry.mjs:\n" +
      drift.map((d) => `  - ${d}`).join("\n") +
      "\nUpdate the CSS (or lib/geometry.mjs) so both describe the same geometry."
    );
  }

  const reversed = `data:image/svg+xml;base64,${fs.readFileSync(LOGO_REVERSED).toString("base64")}`;
  /* The geometry object and the layout functions render-svg.mjs uses, verbatim:
     one implementation, so the PNG and the SVG compute identical boxes. */
  const shared = [
    `const IU_GEOM = ${JSON.stringify(G)};`,
    ...SHARED.map((fn) => fn.toString()),
  ].join("\n\n");
  /* Function replacers: injected code may contain `$` sequences. */
  const out = html
    .replaceAll("/* __FONT_FACES__ */", () => fontFaces())
    .replaceAll("__LOGO_DATA_URI__", () => dataUri(LOGO, "image/png"))
    .replaceAll("__LOGO_REVERSED_DATA_URI__", () => reversed)
    .replaceAll("<!-- __ATMOSPHERE__ -->", () => atmosphereFragment())
    .replaceAll("<!-- __PETAL__ -->", () => petalInner())
    .replaceAll("/* __GEOMETRY__ */", () => shared);

  fs.writeFileSync(OUT, out);
  const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
  console.log(`✓ ${path.relative(ROOT, OUT)} (${kb} KB): fonts, logos and shared layout inlined`);
}

build();
