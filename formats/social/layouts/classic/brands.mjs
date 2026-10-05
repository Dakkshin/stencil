/**
 * The classic layout's brand registry, served from the brand packs (plan AD-2).
 *
 * The moved renderers import { BRANDS, logoDataUri, resolveLogo } from "./brands.mjs", as
 * they did from panel-social-posts/brands.mjs. Here BRANDS holds every pack that picks the
 * classic design for social posts, resolved for "social" and picked to the fork registry's
 * keys, so the renderers see the object the fork's registry held. The one difference is
 * `logo`: the fork kept "assets/<file>" beside its registry, the packs keep the file name
 * in assets/logos/. The renderers never read it raw; they replace it with the data URI and
 * the file path below (exactly as they did in the fork).
 */
import { brandsFor, layoutFor, resolveBrand, pick, logoFile, logoDataUri as packLogoDataUri } from "../../../../core/brands.mjs";

/* panel-social-posts/brands.mjs, the keys of every entry (OBA, VET, OBA_LIGHT), in order. */
export const BRAND_KEYS = [
  "id", "label", "wordmark", "logo", "gradient", "glow", "dots", "ink", "inkOnAccent", "accent", "inkSoft", "dim",
  "textMuted", "textFaint", "pillBg", "tileFill", "line", "qrGold", "titleText", "wordmarkColor", "wave", "qrCaption",
  "qrFrame", "qrStroke", "scrim",
];

export const BRANDS = Object.fromEntries(
  brandsFor("social")
    .filter((id) => layoutFor(id, "social") === "classic")
    .map((id) => [id, pick(resolveBrand(id, "social"), BRAND_KEYS)]),
);

/* `base` was the fork folder the logo path was relative to; logos now live in assets/logos/,
   so it is accepted and ignored. A brand without a logo file (OBA_LIGHT, VET) gives "". */
export function resolveLogo(brand, base) {
  void base;
  return BRANDS[brand] ? logoFile(brand, "social") : "";
}

export function logoDataUri(brand, base) {
  void base;
  return BRANDS[brand] ? packLogoDataUri(brand, "social") : "";
}

export default BRANDS;
