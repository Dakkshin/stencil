/**
 * Host background parity: the one fixed Zoom background from g-slides/host-background.
 * The SVG and PNG must match exactly; the JPEG is a lossy re-encode, compared within the
 * default JPEG tolerance.
 */
export default {
  format: "background",
  stencilInputDir: null,
  outputDirs: ["out", "canva"],
  forks: {
    "g-slides": {
      cwd: "g-slides/host-background",
      inputDir: null,
      cases: ["host-background"],
      build: () => ["gen.mjs"],
      emitJson: () => ["gen.mjs", "--svg-only"],
    },
  },
  stencil: {
    build: () => ["stencil.mjs", "background"],
    emitJson: () => ["stencil.mjs", "background", "--svg-only"],
  },
  tolerance: [],
  belongsTo: () => true,
};
