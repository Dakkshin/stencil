/**
 * Banner parity cases: every real panel in both banner forks.
 *
 * The 640x200 PNG is a sharp Lanczos downscale of the @3x Chrome capture, and the forks
 * resolve sharp 0.34.5 from oba-website while Stencil declares 0.35.x, so that one file
 * may differ by resampling noise; the @3x capture and the SVG must be identical.
 */
const build = (name) => ["gen.mjs", name];
const emitJson = (name) => ["gen.mjs", name, "--emit-json"];

export default {
  format: "banner",
  stencilInputDir: "panels",
  outputDirs: [".gen", "out", "canva"],
  forks: {
    "zoom-banner": {
      inputDir: "panels",
      cases: ["cataract-panel", "dry-eye-growth-panel", "referral-growth-panel"],
      build,
      emitJson,
    },
    "iu-zoom-banner": {
      inputDir: "panels",
      cases: ["oct-22-fee-schedule-reset", "oct-22-fee-schedule-reset-light"],
      build,
      emitJson,
    },
  },
  stencil: {
    build: (name) => ["stencil.mjs", "banner", name],
    emitJson: (name) => ["stencil.mjs", "banner", name, "--emit-json"],
  },
  tolerance: [{ match: /^out\/[^/]+(?<!@3x)\.png$/, mae: 0.002 }],
  /* Which outputs belong to a case (for --only and --brand filtering). */
  belongsTo: (rel, name) => rel.includes(`/${name}.`) || rel.includes(`/${name}@`),
};
