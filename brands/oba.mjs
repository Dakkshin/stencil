/**
 * OBA, Ophthalmology Business Academy. The dark slate design system that every
 * generator started from (mirrors oba-website globals.css).
 *
 * Legacy: OBA retired on 2026-09-28. The pack stays because IU reuses the OBA machinery
 * and archived OBA work must still render exactly as it did.
 */
export default {
  id: "OBA",
  label: "Ophthalmology Business Academy",
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
    id: "OBA",
    label: "Ophthalmology Business Academy",
    wordmark: "OBA",
    logo: "oba-logo-white.png",
    gradient: [
      ["#5b7484", 0],
      ["#3e5361", 34],
      ["#263743", 62],
      ["#16232c", 100],
    ],
    glow: "rgba(214, 228, 235, 0.5)",
    dots: "rgba(255,255,255,0.10)",
    ink: "#16232c",
    inkOnAccent: "#ffffff",
    accent: "#3d5361",
    inkSoft: "#465a66",
    dim: "rgba(255,255,255,0.55)",
    textMuted: "rgba(255,255,255,0.66)",
    textFaint: "rgba(255,255,255,0.55)",
    pillBg: "rgba(11, 18, 32, 0.42)",
    tileFill: "rgba(255,255,255,0.1)",
    line: "rgba(255,255,255,0.14)",
    qrGold: "#D4AF37",
    /* Light-on-dark text and chrome (OBA_LIGHT overrides these). */
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
    banner: {
      layout: "strip-centre",
      tokens: {
        /* The IU banner fork rendered legacy OBA panels with a 26px logo; the OBA fork's
           template already draws the logo at 26px from its own geometry. */
        logoH: 26,
        /* The centre-lobe strip's own values. The title accent is a warm gold because
           the brand accent is a background-weight slate that vanishes on the ground;
           roles sit on the darkest band, so they take .60 white, not the posts' .55;
           the pill keeps the exact string the OBA SVG always wrote. */
        strip: {
          titleAccent: "#e2b552",
          roleText: "rgba(255,255,255,0.60)",
          pillBg: "rgba(11,18,32,0.42)",
          logoLayer: ["oba-logo", "OBA logo"],
          label: "OBA",
        },
      },
    },
    thumb: { layout: "classic" },
    social: { layout: "classic" },
    deck: { layout: "deck" },
    background: { layout: "host" },
  },
};
