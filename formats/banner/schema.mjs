/**
 * Banner GUI schema: the union of the two banner forks' schemas, read by the panel-kit
 * front door (panel-kit/docs/CONTRACT.md §3.1). Brand options come from the packs that
 * have a banner design, so adding a brand file adds it here.
 */
import { brandsFor } from "../../core/brands.mjs";

export default {
  tool: "banner",
  title: "Zoom Banner",
  configDir: "panels",
  configLabel: "Panel",
  assetDirs: { headshots: "assets/headshots", qrs: "assets/qrs", logos: "assets/sponsors" },
  outDirs: { raster: "out", canva: "canva", sidecar: ".gen" },
  generate: { flags: ["--count", "--svg-only"], arg: "<name>" },
  preview: {
    template: "formats/banner/layouts/strip-iu/template.html",
    apply: "applyConfig",
    scale: "setPreviewScale",
    mode: "config",
    width: 640,
    height: 200,
  },
  sections: [
    {
      id: "header",
      label: "Header",
      fields: [
        { path: "brand", label: "Brand", type: "enum", options: brandsFor("banner"), default: "IU" },
        {
          path: "title",
          label: "Title",
          type: "string",
          required: true,
          accent: true,
          help: "Prefix a word with ~ to tint it (e.g. A ~B~ C)",
        },
        { path: "date", label: "Date chip", type: "string", help: 'e.g. "Nov 19 · 12PM EDT"' },
        { path: "eyebrow", label: "Eyebrow", type: "string", help: "Defaults per brand (IU: Insurance Untangled · Live)" },
        { path: "ce", label: "CE credit", type: "string", default: "1 CE credit", help: 'e.g. "1 CE credit"; required for IU, drives PACE + stamp' },
      ],
    },
    {
      id: "panelists",
      label: "Panelists",
      fields: [
        {
          path: "panelists",
          label: "Panelists",
          type: "repeat",
          min: 1,
          max: 4,
          itemLabel: "name",
          fields: [
            { path: "name", label: "Name", type: "string", required: true },
            { path: "role", label: "Role", type: "string", maxLength: 40, help: "Under 40 characters or it clips" },
            { path: "photo", label: "Photo", type: "image", help: "Bare filename resolved against assets/headshots/" },
          ],
        },
      ],
    },
  ],
};
