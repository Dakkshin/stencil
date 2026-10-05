/**
 * OBA_LIGHT, OBA inverted: light slate-tinted gradient and dark ink text, with the same
 * accent so CTA pills keep white-on-slate contrast. No dark logo asset exists, so the
 * wordmark renders in ink instead.
 *
 * Legacy with OBA (retired 2026-09-28). Social posts only.
 */
export default {
  id: "OBA_LIGHT",
  label: "OBA Light (inverted)",
  status: "legacy",
  fonts: [
    "Inter-300-normal.woff2",
    "Inter-400-normal.woff2",
    "Inter-500-normal.woff2",
    "Inter-600-normal.woff2",
    "IBM-Plex-Mono-500-normal.woff2",
    "IBM-Plex-Mono-600-normal.woff2",
  ],
  tokens: {
    wordmark: "OBA",
    logo: "",
    gradient: [
      ["#ffffff", 0],
      ["#e9eff3", 38],
      ["#cfdae2", 72],
      ["#b7c7d2", 100],
    ],
    glow: "rgba(61, 83, 97, 0.18)",
    dots: "rgba(22,35,44,0.25)",
    ink: "#16232c",
    inkOnAccent: "#ffffff",
    accent: "#3d5361",
    inkSoft: "#465a66",
    dim: "rgba(22,35,44,0.55)",
    textMuted: "rgba(22,35,44,0.66)",
    textFaint: "rgba(22,35,44,0.55)",
    pillBg: "rgba(11, 18, 32, 0.42)",
    tileFill: "rgba(61,83,97,0.08)",
    line: "rgba(22,35,44,0.16)",
    qrGold: "#3d5361",
    titleText: "#16232c",
    wordmarkColor: "#16232c",
    wave: "#465a66",
    qrCaption: "#16232c",
    qrFrame: "rgba(22,35,44,0.06)",
    qrStroke: "#16232c",
    scrim: [
      [0, "#ffffff", 0.5],
      [0.4, "#ffffff", 0.25],
      [0.6, "#ffffff", 0],
    ],
  },
  formats: {
    social: { layout: "classic" },
  },
};
