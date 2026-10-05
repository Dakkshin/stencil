/**
 * VET, Veterinary Business Institute (VBI): lime on dark green, from the old picasso
 * campaign. Kept so archived VBI work still renders (design note, open question 2).
 *
 * Legacy. Banner and social posts only. No VBI logo file has ever been supplied, so the
 * "VBI" wordmark renders in its place.
 */
export default {
  id: "VET",
  label: "Veterinary Business Institute",
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
    id: "VET",
    label: "Veterinary Business Institute",
    wordmark: "VBI",
    logo: "vbi-logo-white.png",
    gradient: [
      ["#12332b", 0],
      ["#0b241f", 40],
      ["#061512", 78],
      ["#040c0a", 100],
    ],
    glow: "rgba(230, 242, 10, 0.16)",
    dots: "rgba(255,255,255,0.10)",
    ink: "#061512",
    inkOnAccent: "#061512",
    accent: "#E6F20A",
    inkSoft: "#00BFA5",
    dim: "rgba(230, 242, 10, 0.55)",
    textMuted: "rgba(230, 242, 10, 0.72)",
    textFaint: "rgba(230, 242, 10, 0.6)",
    pillBg: "rgba(4, 12, 10, 0.5)",
    tileFill: "rgba(221, 240, 0, 0.07)",
    line: "rgba(230, 242, 10, 0.22)",
    qrGold: "#E6F20A",
    titleText: "#ffffff",
    wordmarkColor: "#ffffff",
    wave: "#ffffff",
    qrCaption: "#ffffff",
    qrFrame: "rgba(255,255,255,0.08)",
    qrStroke: "#ffffff",
    scrim: [
      [0, "#0b1220", 0.52],
      [0.4, "#0b1220", 0.26],
      [0.6, "#0b1220", 0],
    ],
  },
  formats: {
    banner: { layout: "strip-oba" },
    social: { layout: "classic" },
  },
};
