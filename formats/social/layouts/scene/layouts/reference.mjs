/**
 * Reference layout — proves the pipeline and shows how components compose.
 * Lanes replace it per post type; it stays as the fallback for unknown types.
 *
 *   logo top-left · format pill top-right
 *   kicker → claim + accent → petal sign-off
 *   B&W face row with rings (≤4) or monograms
 *   frosted CTA card at the foot (the one Signal Teal use)
 */
import { SPACE } from "../tokens.mjs";
import { logo, pill, kicker, titleBlock, ctaCard, portrait, ring, monogram } from "../components.mjs";
import { petal } from "../atmosphere.mjs";

export async function reference(ctx) {
  const { s, cfg, F, T, theme, panelists } = ctx;
  await ctx.background();
  const P = F.pad;
  const W = F.w, H = F.h;

  const lg = logo(s, theme, { x: P, y: P - 6, h: 84 });
  pill(s, theme, { x: W - P, y: P + 14, text: "Live panel", size: T.caption, align: "right", dot: true });

  /* CTA card first: it fixes the foot, the rest fills upward. */
  const cardW = W - P * 2;
  const cardOpts = { x: P, w: cardW, cta: cfg.event?.cta || "Register now", date: cfg.event?.date, time: cfg.event?.time, size: T.caption + 2 };
  const cardY = H - P - ctaCard(s, theme, { ...cardOpts, y: 0, dryRun: true }).h;
  ctaCard(s, theme, { ...cardOpts, y: cardY });

  let y = lg.y + lg.h + SPACE.xl;
  const k = kicker(s, theme, { x: P, y, text: cfg.category || cfg.eyebrow, size: T.caption });
  y += k.h + SPACE.m;
  const tb = titleBlock(s, theme, { x: P, top: y, maxW: W - P * 2, title: cfg.title, size: T.display });
  y += tb.h + SPACE.m;

  /* face row */
  const n = Math.min(panelists.length, 4);
  if (n) {
    const gap = SPACE.l;
    const d = Math.min(200, (W - P * 2 - gap * (n - 1)) / n);
    const rowY = Math.min(y + SPACE.m, cardY - d - SPACE.xl);
    panelists.slice(0, n).forEach((p, i) => {
      const cx = P + d / 2 + i * (d + gap);
      const cy = rowY + d / 2;
      const clip = { cx, cy, r: d / 2 };
      if (p.photo) portrait(s, p.photo, { faceH: d * 0.46, cx, faceTop: rowY + d * 0.2, clip });
      else monogram(s, theme, { name: p.name, clip, size: d * 0.3 });
      ring(s, theme, { cx, cy, r: d / 2 + 8 });
    });
  }

  petal(s, theme, { x: W - P - 20, y: cardY - SPACE.l, h: 56 });
}
