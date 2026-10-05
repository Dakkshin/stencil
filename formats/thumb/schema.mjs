/**
 * Thumb GUI schema: the union of the two thumbnail forks' schemas, read by the panel-kit
 * front door (panel-kit/docs/CONTRACT.md §3.1). Brand options come from the packs that have
 * a thumb design, so adding a brand file adds it here.
 *
 * The preview template is the cards design's (IU is the default brand). It is generated:
 * the first `node stencil.mjs thumb` build of a cards episode writes it (see
 * layouts/cards/index.mjs). Fields that only one design reads say so in their help.
 */
import { brandsFor } from "../../core/brands.mjs";

export default {
  tool: "thumb",
  title: "Podcast Thumbnails",
  configDir: "episodes",
  configLabel: "Episode",
  assetDirs: { headshots: "assets/headshots" },
  outDirs: { canva: "canva", preview: "preview", sidecar: ".gen" },
  generate: { flags: ["--speakers", "--svg-only"], arg: "<name>" },
  preview: {
    template: "formats/thumb/layouts/cards/template.html",
    apply: "applyConfig",
    scale: "setPreviewScale",
    width: 1280,
    height: 720,
  },
  sections: [
    {
      id: "meta",
      label: "Episode",
      fields: [
        { path: "brand", label: "Brand", type: "enum", options: brandsFor("thumb"), default: "IU", help: "OBA: classic design · IU / IU_LIGHT: cards design" },
        { path: "episode", label: "Episode number", type: "number", help: "For humans — not rendered" },
        { path: "mode", label: "Theme", type: "enum", options: ["dark", "light"], help: "Cards design only: dark = Depth ground; light = Air ground. Defaults per brand (IU_LIGHT is light)" },
        { path: "eyebrow", label: "Eyebrow", type: "string", required: true, help: "Episode label, e.g. Insurance Untangled · Ep 148 or OBA · Podcast 028" },
        { path: "category", label: "Category", type: "string", required: true, help: "Classic: bottom-left mono label · Cards: kicker above the headline" },
        { path: "hook", label: "Hook", type: "string", help: "Cards design only: replaces the category as the kicker when set" },
      ],
    },
    {
      id: "headline",
      label: "Headline",
      fields: [
        {
          path: "title",
          label: "Title lines",
          type: "stringArray",
          required: true,
          accent: true,
          help: "One line per row. Prefix a line with ~ for the second tone (classic: dim · cards: EB Garamond accent).",
        },
      ],
    },
    {
      id: "layout",
      label: "Layout",
      fields: [
        {
          path: "speakers",
          label: "Force tiles",
          type: "number",
          min: 1,
          help: "Optional; missing guests show a ? placeholder. Classic: 1 solo · 2 duo · 3–4 row · 5–6 grid · 7+ circles. Cards: 1 solo, 2 duo, 3+ a row",
        },
        { path: "output", label: "Output name", type: "string", help: "Defaults to the filename" },
      ],
    },
    {
      id: "guests",
      label: "Guests",
      fields: [
        {
          path: "guests",
          label: "Guests",
          type: "repeat",
          min: 1,
          itemLabel: "name",
          fields: [
            { path: "name", label: "Name", type: "string", required: true },
            { path: "role", label: "Role", type: "string", help: "Designation, e.g. Practice Owner" },
            { path: "company", label: "Company", type: "string", help: "Cards design only: shown after the role on the card label" },
            { path: "short", label: "Short name", type: "string", help: "Classic: the headshot pill · Cards: the small cards of a 6+ row" },
            { path: "photo", label: "Photo", type: "image", help: "Bare filename resolved against assets/headshots/" },
          ],
        },
      ],
    },
  ],
};
