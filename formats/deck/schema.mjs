// g-slides GUI — the tool's only tool-specific UI input.
// Sections are optional: the Inspector only shows a section whose table exists
// in the deck, so a deck with no [sponsor] doesn't offer sponsor fields.
import { defineSchema } from "../../panel-kit/lib/index.mjs";
import { brandsFor } from "../../core/brands.mjs";

export default defineSchema({
  tool: "deck",
  title: "Slide Decks",
  configDir: "decks",
  configLabel: "Deck",
  assetDirs: { headshots: "assets/headshots", qrs: "assets/qrs", logos: "assets/sponsors" },
  outDirs: { out: "out", canva: "canva", preview: "preview", sidecar: ".gen" },
  generate: { flags: ["--slides", "--no-pdf", "--svg-only", "--no-optimize", "--force-metrics"], arg: "<deck>" },
  preview: { mode: "svg", width: 1920, height: 1080, buildFlags: ["--svg-only"] },
  sections: [
    {
      id: "deck",
      label: "Deck",
      fields: [
        { path: "deck", label: "Output stem", type: "string", help: "Defaults to the filename" },
        { path: "brand", label: "Brand", type: "enum", options: brandsFor("deck"), default: "OBA" },
        {
          path: "speakers",
          label: "Speakers",
          type: "stringArray",
          help: "Profile stems in presentation order (max 6). Resolved from speakers/, then the shared pool.",
        },
        {
          path: "order",
          label: "Section order",
          type: "stringArray",
          help: "Optional. Reorder or drop sections. divider:Text injects a break.",
        },
      ],
    },
    {
      id: "event",
      label: "Event",
      optional: true,
      fields: [
        { path: "event.name", label: "Name", type: "string", help: "Prints on every slide footer" },
        { path: "event.category", label: "Category", type: "string" },
        { path: "event.date", label: "Date", type: "string" },
        { path: "event.time", label: "Time", type: "string" },
        { path: "event.format", label: "Format", type: "string" },
        { path: "event.cost", label: "Cost", type: "string" },
        { path: "event.website", label: "Website", type: "string" },
      ],
    },
    {
      id: "cover",
      label: "Cover",
      optional: true,
      fields: [
        { path: "cover.title", label: "Title lines", type: "stringArray", accent: true, help: "One per row. ~ = dimmed second tone." },
        { path: "cover.subtitle", label: "Subtitle", type: "text" },
      ],
    },
    {
      id: "stat",
      label: "Stat",
      optional: true,
      fields: [
        { path: "stat.value", label: "Value", type: "string", help: "The big number" },
        { path: "stat.text", label: "Text", type: "text", help: "The one line under the number" },
        { path: "stat.note", label: "Note", type: "text" },
        { path: "stat.source", label: "Source", type: "string" },
      ],
    },
    {
      id: "agenda",
      label: "Agenda",
      optional: true,
      fields: [
        { path: "agenda.heading", label: "Heading", type: "string" },
        {
          path: "topic",
          label: "Topics",
          type: "repeat",
          minItems: 4,
          maxItems: 5,
          itemLabel: "title",
          help: "4 or 5 topics.",
          fields: [
            { path: "title", label: "Title", type: "string", required: true },
            { path: "note", label: "Note", type: "text" },
          ],
        },
      ],
    },
    {
      id: "offer",
      label: "Primary offer",
      optional: true,
      fields: [
        { path: "offer_primary.headline", label: "Headline", type: "string" },
        { path: "offer_primary.support", label: "Support", type: "text" },
        { path: "offer_primary.panel_title", label: "Panel title", type: "string" },
        { path: "offer_primary.value", label: "Value badge", type: "string" },
        { path: "offer_primary.url", label: "URL", type: "string" },
        { path: "offer_primary.cta", label: "CTA caption", type: "string" },
        { path: "offer_primary.qr", label: "QR image", type: "image", options: ["qrs"] },
      ],
    },
    {
      id: "benefits",
      label: "Benefits",
      optional: true,
      fields: [
        {
          path: "benefit",
          label: "Benefits",
          type: "repeat",
          minItems: 3,
          maxItems: 4,
          itemLabel: "title",
          fields: [
            { path: "title", label: "Title", type: "string", required: true },
            { path: "note", label: "Note", type: "text" },
          ],
        },
      ],
    },
  ],
});
