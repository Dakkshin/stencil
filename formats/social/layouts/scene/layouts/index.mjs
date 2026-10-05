/**
 * post_type → layout. Each layout is `async (ctx) => void` and draws the whole
 * canvas (call `await ctx.background()` first). ctx:
 *   s          Scene (lib/iu/scene.mjs)
 *   cfg        normalized post config (.gen/<name>.json)
 *   format     "square" | "portrait";  F = { w, h, pad }
 *   T          type scale for the format (lib/iu/tokens.mjs TYPE)
 *   theme      THEMES[brand]
 *   panelists  cfg.panelists with `.photo` replaced by the prepared B&W photo
 *              ({ href, w, h, face, bbox, cutout }) or null → use monogram()
 *
 * Lanes own one file each: group.mjs · speaker.mjs · signal.mjs.
 */
import { reference } from "./reference.mjs";
import * as group from "./group.mjs";
import * as speaker from "./speaker.mjs";
import * as signal from "./signal.mjs";

const REGISTRY = {
  the_intro: group.theIntro,
  panel: group.panel,
  speaker_promo: speaker.speakerPromo,
  intro_panel_one: speaker.introPanelist,
  intro_panel_two: speaker.introPanelist,
  one_more_day: signal.oneMoreDay,
  happening_today: signal.happeningToday,
};

export function layoutFor(postType) {
  return REGISTRY[postType] || reference;
}
