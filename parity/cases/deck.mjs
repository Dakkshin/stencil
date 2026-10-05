/**
 * Deck parity cases: every deck in g-slides, including the Sept 17 Referral Growth deck
 * (the design note's reference input) and the edge-cases deck (monogram fallback,
 * missing QR). The SVG is the deck's only visual source; PNGs are raw Chrome captures of
 * those SVGs and the PDF is printed from them, so everything must match exactly (the
 * PDF by page count and embedded fonts).
 */
const build = (name) => ["gen.mjs", name];
const emitJson = (name) => ["gen.mjs", name, "--emit-json"];

export default {
  format: "deck",
  stencilInputDir: "decks",
  stencilExtraDirs: ["speakers"],
  outputDirs: [".gen", "out", "canva"],
  forks: {
    "g-slides": {
      inputDir: "decks",
      cases: ["sep17-referral-growth", "sep24-dry-eye-growth", "edge-cases"],
      build,
      emitJson,
    },
  },
  stencil: {
    build: (name) => ["stencil.mjs", "deck", name],
    emitJson: (name) => ["stencil.mjs", "deck", name, "--emit-json"],
  },
  tolerance: [],
  belongsTo: (rel, name) => rel.includes(`/${name}/`) || rel.includes(`/${name}.`),
};
