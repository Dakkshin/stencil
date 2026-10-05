/**
 * panel-kit — brand presets (part of the shared instrument, not content).
 *
 * A brand = the accent/ink palette + optional logo asset + wordmark fallback.
 * The default is the OBA design system (the tokens used by the podcast /
 * panel thumbnails); VET is the Veterinary Business Institute variant used by
 * the old picasso campaign (lime-on-dark).
 *
 * Logo: `logo` is a path relative to the kit root (e.g. "assets/oba-logo-white.png").
 * If the file is missing, the template falls back to the `wordmark` text.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.join(__dirname, "..");

export const BRANDS = {
  OBA: {
    id: "OBA",
    label: "Ophthalmology Business Academy",
    wordmark: "OBA",
    logo: "assets/oba-logo-white.png",
    /* OBA design system (mirrors oba-website globals.css) */
    gradient: [
      ["#5b7484", 0],
      ["#3e5361", 34],
      ["#263743", 62],
      ["#16232c", 100],
    ],
    glow: "rgba(214, 228, 235, 0.5)",
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
  },
  VET: {
    id: "VET",
    label: "Veterinary Business Institute",
    wordmark: "VBI",
    logo: "assets/vbi-logo-white.png", // drop the VBI logo here when available
    /* VBI palette (from the picasso campaign.yaml) */
    gradient: [
      ["#12332b", 0],
      ["#0b241f", 40],
      ["#061512", 78],
      ["#040c0a", 100],
    ],
    glow: "rgba(230, 242, 10, 0.16)",
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
  },
};

export function resolveLogo(brand, base = KIT_ROOT) {
  const b = BRANDS[brand] || BRANDS.OBA;
  if (!b.logo) return "";
  const p = path.resolve(base, b.logo);
  if (fs.existsSync(p)) return p;
  return "";
}

export function logoDataUri(brand, base = KIT_ROOT) {
  const p = resolveLogo(brand, base);
  if (!p) return "";
  return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
}

export default BRANDS;
