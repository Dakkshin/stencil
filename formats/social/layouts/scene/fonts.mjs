/**
 * The IU font variants — the only faces the layouts may use.
 * Roles (IU brand guidelines §3): display = the claim, sans = explanation and
 * uppercase labels, serif = the one editorial accent line.
 */
export const VARIANTS = [
  { key: "display-500", role: "display", family: "InterDisplay", weight: 500, style: "normal", file: "InterDisplay-500.woff2" },
  { key: "display-600", role: "display", family: "InterDisplay", weight: 600, style: "normal", file: "InterDisplay-600.woff2" },
  { key: "sans-400", role: "sans", family: "Inter", weight: 400, style: "normal", file: "Inter-400.woff2" },
  { key: "sans-500", role: "sans", family: "Inter", weight: 500, style: "normal", file: "Inter-500.woff2" },
  { key: "sans-600", role: "sans", family: "Inter", weight: 600, style: "normal", file: "Inter-600.woff2" },
  { key: "serif-500", role: "serif", family: "EBGaramond", weight: 500, style: "normal", file: "EBGaramond-500.woff2" },
  { key: "serif-500-italic", role: "serif", family: "EBGaramond", weight: 500, style: "italic", file: "EBGaramond-500-italic.woff2" },
];

export const FAMILY = { display: "InterDisplay", sans: "Inter", serif: "EBGaramond" };

export function variantKey(font) {
  const k = `${font.role}-${font.weight}${font.style === "italic" ? "-italic" : ""}`;
  return VARIANTS.some((v) => v.key === k) ? k : null;
}
