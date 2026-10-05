/**
 * Thumbnail parity cases: every real episode in both thumbnail forks.
 *
 * Both forks write the 2560x1440 preview straight from a Chrome element screenshot (no sharp
 * resampling anywhere), so every PNG must be pixel-identical, and the SVG and the sidecar
 * exact. Nothing here is declared resampled, so `tolerance` is empty.
 *
 * One render at a time (`concurrency: 1`), as both forks' gen.mjs build episodes. Under
 * machine load Chrome now and then lays the classic template's text out differently for one
 * page session: the variable Inter it fetches from Google Fonts comes out with some glyph
 * advances 1/64 px off, and a few glyphs cross a sub-pixel boundary. The fork's own renderer
 * does it (ep065's other variant in 2 of 18 renders at 6-way concurrency, once in the first
 * 4-way golden run), while every quiet run of the fork and of Stencil was byte-identical.
 * Fewer parallel Chromes means fewer flips on the golden side; on the Stencil side the
 * classic design also takes the capture two browser sessions agree on (render-png.mjs).
 */
const build = (name) => ["gen.mjs", name];
const emitJson = (name) => ["gen.mjs", name, "--emit-json"];

/* ep001..ep075, then the three late OBA episodes (ep076-079 were never made). */
const eps = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `ep${String(from + i).padStart(3, "0")}`);

export default {
  format: "thumb",
  stencilInputDir: "episodes",
  outputDirs: [".gen", "canva", "preview"],
  forks: {
    "podcast-thumbnails": {
      inputDir: "episodes",
      cases: [...eps(1, 75), "ep080", "ep081", "ep082"],
      supply: { headshots: "headshots" },
      build,
      emitJson,
      concurrency: 1,
    },
    "iu-podcast-thumbnails": {
      inputDir: "episodes",
      cases: ["ep148", "ep149", "ep950", "ep951"],
      supply: { headshots: "headshots" },
      build,
      emitJson,
      concurrency: 1,
    },
  },
  concurrency: 1,
  stencil: {
    build: (name) => ["stencil.mjs", "thumb", name],
    emitJson: (name) => ["stencil.mjs", "thumb", name, "--emit-json"],
  },
  tolerance: [],
  /* Which outputs belong to a case (for --only and --brand filtering): the sidecar, the
     preview and the brand-prefixed Canva SVG (canva/OBA-<name>.svg, canva/IU-<name>.svg). */
  belongsTo: (rel, name) => rel === `.gen/${name}.json` || rel === `preview/${name}.png` || new RegExp(`^canva/[A-Z_]+-${name}\\.svg$`).test(rel),
};
