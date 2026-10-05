/**
 * Social GUI schema: the union of the two social forks' schemas, read by the panel-kit
 * front door (panel-kit/docs/CONTRACT.md §3.1). Brand options come from the packs that
 * have a social design, so adding a brand file adds it here. The CE line is a field
 * because the scene layout (IU) refuses a post without one.
 */
import { brandsFor } from "../../core/brands.mjs";

export default {
  tool: "social",
  title: "Panel Social Posts",
  configDir: "posts",
  configLabel: "Post",
  assetDirs: { headshots: "assets/headshots", qrs: "assets/qrs", logos: "assets/sponsors" },
  outDirs: { out: "out", canva: "canva", sidecar: ".gen" },
  generate: { flags: ["--formats", "--brand", "--svg-only", "--no-cutout", "--force-cutout"], arg: "<name>" },
  preview: {
    templates: {
      default: "formats/social/layouts/classic/template.html",
      speaker_promo: "formats/social/layouts/classic/speaker-template.html",
    },
    selectTemplateBy: { field: "post_type", fallback: "default" },
    apply: "applyConfig",
    scale: "setPreviewScale",
    formats: {
      options: {
        square: { width: 1080, height: 1080 },
        portrait: { width: 1080, height: 1350 },
        story: { width: 1080, height: 1920 },
        landscape: { width: 1200, height: 630 },
      },
      setter: "__setFormat",
      default: "square",
    },
  },
  sections: [
    {
      id: "post",
      label: "Post",
      fields: [
        {
          path: "post_type",
          label: "Type",
          type: "enum",
          required: true,
          options: ["the_intro", "intro_panel_one", "intro_panel_two", "one_more_day", "happening_today", "panel", "speaker_promo"],
        },
        { path: "brand", label: "Brand", type: "enum", options: brandsFor("social"), default: "IU" },
        {
          path: "formats",
          label: "Formats",
          type: "stringArray",
          help: "square · portrait · story · landscape — one per line. The IU design draws square and portrait; OBA speaker_promo defaults to square.",
        },
        { path: "portrait_tone", label: "Portrait tone", type: "enum", options: ["color", "bw"], help: "speaker_promo only" },
        { path: "campaign", label: "Campaign", type: "string", help: "Output subfolder, e.g. 2026-10-22-fee-schedule-reset" },
        { path: "person", label: "Tracked panelist", type: "string", help: "QR folder name in assets/qrs/; required for automatic matching on multi-panelist cards" },
        { path: "output_name", label: "Output name", type: "string", help: "Custom output stem" },
      ],
    },
    {
      id: "copy",
      label: "Copy",
      fields: [
        { path: "eyebrow", label: "Eyebrow", type: "string", required: true },
        { path: "category", label: "Category", type: "string", help: "Not used by speaker_promo" },
        {
          path: "title",
          label: "Title lines",
          type: "stringArray",
          required: true,
          accent: true,
          help: "One line per row. Prefix with ~ for the dim second tone.",
        },
        { path: "urgency", label: "Urgency pill", type: "string", help: "e.g. Happening today!" },
      ],
    },
    {
      id: "countdown",
      label: "Countdown",
      fields: [
        { path: "countdown.number", label: "Number", type: "string" },
        { path: "countdown.label", label: "Label", type: "string" },
      ],
    },
    {
      id: "event",
      label: "Event",
      fields: [
        { path: "event.name", label: "Name", type: "string" },
        { path: "event.date", label: "Date", type: "string" },
        { path: "event.time", label: "Time", type: "string" },
        { path: "event.website", label: "Website", type: "string" },
        { path: "event.cta", label: "CTA", type: "string" },
        { path: "event.ce", label: "CE credit", type: "string", help: 'e.g. "1 CE credit"; required for IU, drives the PACE plate and CE seal' },
        { path: "event.qr", label: "QR image override", type: "image", options: ["qrs"], help: "Filename or person/1.png in assets/qrs/. Omit this key in TOML to auto-match variants 1–5; an empty string disables the QR." },
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
          refs: true,
          min: 1,
          itemLabel: "name",
          help: "List profile names (one per line) from assets/panelists/, or switch to inline blocks by adding [[panelists]] in the TOML.",
          fields: [
            { path: "name", label: "Name", type: "string", required: true },
            { path: "role", label: "Role", type: "string" },
            { path: "credentials", label: "Credentials", type: "string" },
            { path: "company", label: "Company", type: "string" },
            { path: "short", label: "Short pill name", type: "string" },
            { path: "quote", label: "Quote", type: "text" },
            { path: "photo", label: "Photo", type: "image" },
          ],
        },
      ],
    },
  ],
};
