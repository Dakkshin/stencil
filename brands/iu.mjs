/**
 * IU, Insurance Untangled, on the Depth ground (ink to navy) with the reversed-white
 * vector lockup. Values from the IU brand guidelines v2 §2, exactly as the IU podcast
 * thumbnails apply them. Signal Teal (#35C7B6) is reserved and deliberately absent.
 *
 * The active brand: new inputs default to IU.
 */
export default {
  id: "IU",
  label: "Insurance Untangled",
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
    id: "IU",
    label: "Insurance Untangled",
    wordmark: "INSURANCE UNTANGLED",
    logo: "iu-logo-reversed.svg",
    /* The lockup is stacked (462x340), so it needs far more height than the OBA mark:
       logoH is the group-post top bar, logoHSpeaker the speaker card. */
    logoH: 94,
    logoHSpeaker: 94,
    gradient: [
      ["#1B2560", 0],
      ["#12182B", 55],
      ["#0A0F22", 100],
    ],
    glow: "rgba(98, 137, 217, 0.34)",
    dots: "rgba(255,255,255,0.10)",
    ink: "#12182B",
    inkOnAccent: "#ffffff",
    accent: "#6289D9",
    inkSoft: "#4D7BAC",
    dim: "#8BB3E2",
    textMuted: "rgba(255,255,255,0.62)",
    textFaint: "rgba(255,255,255,0.44)",
    pillBg: "rgba(18, 24, 43, 0.42)",
    tileFill: "rgba(255,255,255,0.12)",
    /* Monogram placeholder tile (no photo yet): frame fill and initials. */
    tileFrame: "#232C4A",
    monoText: "#ffffff",
    line: "rgba(255,255,255,0.14)",
    qrGold: "#8BB3E2",
    titleText: "#ffffff",
    wordmarkColor: "#ffffff",
    wave: "#ffffff",
    qrCaption: "#ffffff",
    qrFrame: "rgba(255,255,255,0.08)",
    qrStroke: "#ffffff",
    scrim: [
      [0, "#12182B", 0.52],
      [0.4, "#12182B", 0.26],
      [0.6, "#12182B", 0],
    ],
    /* CE and PACE marks: every IU event surface carries the PACE plate and CE seal. */
    cePlate: "#FFFFFF",
    ceSeal: "#C8DDF5",
    ceInk: "#12182B",
    arc: "#8BB3E2",
    arcOpacity: [0.08, 0.03],
  },
  formats: {
    banner: {
      layout: "strip-iu",
      /* A 200px strip header, not a 1080 post: the stacked lockup scales to 22px. */
      tokens: { logoH: 22 },
      options: { requireCe: true, eyebrow: "Insurance Untangled · Live" },
    },
    thumb: { layout: "cards" },
    social: { layout: "scene" },
  },
};
