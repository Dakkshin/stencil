/**
 * IU_LIGHT, Insurance Untangled on the Air ground (white to cloud to powder) with the
 * full-colour master logo. The thumbnail format calls this `mode = "light"`.
 */
export default {
  id: "IU_LIGHT",
  label: "Insurance Untangled (light)",
  status: "active",
  fonts: [
    "Inter-400.woff2",
    "Inter-500.woff2",
    "Inter-600.woff2",
    "InterDisplay-400.woff2",
    "InterDisplay-500.woff2",
    "InterDisplay-600.woff2",
    "EBGaramond-500.woff2",
    "EBGaramond-500-italic.woff2",
  ],
  tokens: {
    wordmark: "INSURANCE UNTANGLED",
    logo: "iu-logo.png",
    logoH: 94,
    logoHSpeaker: 94,
    gradient: [
      ["#FFFFFF", 0],
      ["#F4F7FB", 46],
      ["#C8DDF5", 100],
    ],
    glow: "rgba(139, 179, 226, 0.42)",
    dots: "rgba(18,24,43,0.18)",
    ink: "#12182B",
    inkOnAccent: "#ffffff",
    accent: "#2A3A71",
    inkSoft: "#4D7BAC",
    dim: "#4D7BAC",
    textMuted: "rgba(18,24,43,0.72)",
    textFaint: "rgba(18,24,43,0.42)",
    pillBg: "rgba(18, 24, 43, 0.42)",
    tileFill: "rgba(42,58,113,0.08)",
    tileFrame: "#E6EEF8",
    monoText: "#2A3A71",
    line: "#D8E0EB",
    qrGold: "#2A3A71",
    titleText: "#12182B",
    wordmarkColor: "#12182B",
    wave: "#4D7BAC",
    qrCaption: "#12182B",
    qrFrame: "rgba(18,24,43,0.06)",
    qrStroke: "#12182B",
    scrim: [
      [0, "#ffffff", 0.5],
      [0.4, "#ffffff", 0.25],
      [0.6, "#ffffff", 0],
    ],
    cePlate: "#FFFFFF",
    ceSeal: "#2A3A71",
    ceInk: "#FFFFFF",
    arc: "#2A3A71",
    arcOpacity: [0.09, 0.035],
  },
  formats: {
    banner: {
      layout: "strip-corner",
      tokens: {
        /* A 200px strip header, not a 1080 post: the stacked lockup scales to 22px. */
        logoH: 22,
        /* The corner-lobe strip's own values: light ground, the two glow lobes (the
           SVG draws both from these; the PNG takes lobe A from brand.glow on a dark
           ground), the PACE plate beside the logo when a panel has a CE line, and the
           Canva layer name for the logo. */
        strip: {
          tone: "light",
          lobeA: { color: "#8BB3E2", alpha: 0.38 },
          lobeB: { color: "#6289D9", alpha: 0.16 },
          pace: true,
          logoLayer: ["iu-logo", "IU logo"],
          label: "IU",
        },
      },
      options: { requireCe: true, eyebrow: "Insurance Untangled · Live" },
    },
    /* canva/IU-<name>.svg; the cards design calls this ground mode "light". */
    thumb: { layout: "cards", options: { prefix: "IU", mode: "light" } },
    social: { layout: "scene" },
  },
};
