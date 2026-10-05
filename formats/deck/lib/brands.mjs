/**
 * The deck's brand registry, in the shape render-svg.mjs and render.mjs read:
 * `const { BRANDS } = await import(BRANDS_MODULE); cfg.brand = BRANDS[cfg.brandId] || BRANDS.OBA`.
 *
 * g-slides read the panel-kit registry. Here each entry is built from a brand pack that
 * has a deck design, picked to the panel-kit keys (plan AD-2), so the deck code sees the
 * object it always saw. Deck-scoped values (the visible dots grid) live in the pack as
 * formats.deck.tokens.
 */
import { brandsFor, resolveBrand, pick } from "../../../core/brands.mjs";

const KEYS = [
  "id", "label", "wordmark", "logo", "gradient", "glow", "ink", "inkOnAccent", "accent",
  "inkSoft", "dim", "textMuted", "textFaint", "pillBg", "tileFill", "line", "qrGold",
];

export const BRANDS = Object.fromEntries(brandsFor("deck").map((id) => [id, pick(resolveBrand(id, "deck"), KEYS)]));

export default BRANDS;
