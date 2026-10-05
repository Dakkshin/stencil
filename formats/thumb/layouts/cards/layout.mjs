/**
 * lib/layout.mjs — the layout math both renderers share.
 *
 * Every function here is pure and self-contained: it reads only its arguments
 * (the geometry object `G` from lib/geometry.mjs, a config, a guest) and the
 * other functions in this file. scripts/build-template.mjs injects their source
 * verbatim into the HTML template next to `IU_GEOM`, so Chrome (the PNG) and
 * render-svg.mjs (the Canva SVG) compute identical boxes from one
 * implementation. Never reference a module-level value from inside a function;
 * tests/layout.test.mjs rebuilds them from source to prove it.
 */

/* Rendered width of `str` from real glyph advances (em) plus letter-spacing,
   which Chrome also applies after the last glyph. */
export function textWidth(G, str, font, size, ls = 0) {
  const tab = G.widths[font] || G.widths.display;
  let sum = 0;
  let count = 0;
  for (const ch of String(str)) {
    sum += tab[ch] ?? 0.5;
    count += 1;
  }
  return sum * size + ls * count;
}

/* Baseline of a `size` line inside a line box `lineH` tall, the way Chrome
   lays it out: ascent and descent rounded to whole px, the top half-leading
   floored (measured: a 52px line in a 54.6px box sits 1.2px higher than the
   exact half-leading formula says). */
export function baseline(G, font, size, lineH) {
  const m = G.fonts[font];
  const asc = Math.round(m.asc * size);
  const desc = Math.round(m.desc * size);
  return Math.floor((lineH - asc - desc) / 2) + asc;
}

/* Em dashes never render. Inside a sentence one becomes a comma ("a — b" is
   "a, b"), at either end it is dropped; spaced en dashes count as dashes,
   unspaced ones (ranges like 8–9) are left alone. */
export function plain(text) {
  return String(text ?? "")
    .replace(/^\s*—\s*|\s*—\s*$/g, "")
    .replace(/\s*—\s*|\s+–\s+/g, ", ")
    .replace(/,\s*,/g, ",");
}

/* `str` cut with an ellipsis so it fits `max` px. */
export function ellipsize(G, str, font, size, ls, max) {
  let s = String(str);
  if (textWidth(G, s, font, size, ls) <= max) return s;
  while (s.length && textWidth(G, s.trimEnd() + "…", font, size, ls) > max) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

export function initials(name) {
  return String(name || "")
    .replace(/,.*$/, "")
    .split(/[\s·–—-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/* Greedy wrap of title fragments: `br` forces a break, `dim` marks the EB
   Garamond accent line (set smaller, wraps at its own size). `ls` is the
   letter-spacing every line inherits from the title's own size. */
export function wrapTitle(G, frags, maxW, size, accentSize, ls) {
  const lines = [];
  let line = "";
  let lineAccent = false;
  const push = () => {
    if (line.trim()) lines.push({ text: line.trim(), accent: lineAccent });
    line = "";
    lineAccent = false;
  };
  for (const frag of frags) {
    const accent = !!frag.dim;
    const fs = accent ? accentSize : size;
    const font = accent ? "serif" : "display";
    const words = String(frag.text ?? "").split(/\s+/).filter(Boolean);
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (textWidth(G, test, font, fs, ls) <= maxW || !line) {
        line = test;
        lineAccent = lineAccent || accent;
      } else {
        push();
        line = word;
        lineAccent = accent;
      }
    }
    if (frag.br) push();
  }
  if (line.trim()) lines.push({ text: line.trim(), accent: lineAccent });
  return lines;
}

/* How one guest's picture sits in its card:
     framed   cut-out with a face box: scaled so the face is `faceH` tall and
              placed in the shared window; the box is the whole image in
              canvas px, clipped by the card
     contain  cut-out with no face box: fit inside the card, bottom centre
     cover    plain photo: fills the card, centred
     mono     no photo: initials (see compose) */
export function frameImage(G, guest, card, faceH) {
  if (!guest.img) return { kind: "mono" };
  if (!guest.cutout) return { kind: "cover" };
  const face = guest.face;
  const size = guest.size;
  if (!face || !face.h || !size) return { kind: "contain" };
  const scale = faceH / face.h;
  const winW = card.w / scale;
  const winH = card.h / scale;
  /* Centre the face, but keep the window inside the image when it can be, so a
     body that reaches the photo's edge never ends in a hard line in the card. */
  let srcX = face.x + face.w / 2 - winW / 2;
  if (size[0] >= winW) srcX = Math.min(Math.max(srcX, 0), size[0] - winW);
  let srcY = face.y - G.window.above * face.h;
  if (size[1] >= winH) srcY = Math.min(srcY, size[1] - winH);
  return {
    kind: "framed",
    x: card.x - srcX * scale,
    y: card.y - srcY * scale,
    w: size[0] * scale,
    h: size[1] * scale,
  };
}

/* The label docked bottom-left inside a card: name, then one meta line
   (role · company). Null when there is no name to show. */
export function labelBox(G, guest, card, faceH) {
  const tier = faceH >= G.label.L.minFace ? "L" : faceH >= G.label.M.minFace ? "M" : "S";
  const T = G.label[tier];
  const name = plain(tier === "S" && guest.short ? guest.short : guest.name);
  if (!name || guest.placeholder) return null;
  const meta = T.meta ? plain([guest.role, guest.company].filter(Boolean).join(" · ")) : "";
  const max = card.w - 2 * T.inset - 2 * T.padX - 2;
  const nameText = ellipsize(G, name, "display", T.name, 0, max);
  const metaText = meta ? ellipsize(G, meta, "sans", T.meta, 0, max) : "";
  const nameLH = T.name * G.label.nameLH;
  const metaLH = T.meta * G.label.metaLH;
  const innerW = Math.max(
    textWidth(G, nameText, "display", T.name, 0),
    metaText ? textWidth(G, metaText, "sans", T.meta, 0) : 0,
  );
  const w = Math.ceil(innerW) + 2 * T.padX + 2;
  const h = 2 + 2 * T.padY + nameLH + (metaText ? T.gap + metaLH : 0);
  return {
    tier,
    x: card.x + T.inset,
    y: card.y + card.h - T.inset - h,
    w,
    h,
    radius: T.radius,
    padX: T.padX,
    padY: T.padY,
    gap: T.gap,
    name: nameText,
    nameSize: T.name,
    nameLH,
    meta: metaText,
    metaSize: T.meta,
    metaLH,
  };
}

/* The whole composition for one config, in canvas px:
     1–2 guests  band  lead column left, cards right, both centred on the stage
     3+  guests  row   one claim line on top, a row of cards beneath it */
export function compose(G, cfg) {
  const list = Array.isArray(cfg.guests) ? cfg.guests.filter(Boolean) : [];
  const guests = list.length ? list : [{ placeholder: true, name: "" }];
  const n = guests.length;
  const sizeTier = n === 1 ? 1 : n === 2 ? 2 : 3;
  const size = G.title[sizeTier].size;
  const accentSize = size * G.type.accent;
  const lineH = size * G.type.leading;
  const ls = G.type.track * size;
  const frags = (cfg.title || []).map((f) => ({ text: plain(f.text), br: !!f.br, dim: !!f.dim }));
  const right = G.canvas.w - G.pad.x;
  const floor = G.canvas.h - G.pad.y;
  const head = G.kicker.h + G.kicker.gap;

  let leadW;
  let lines;
  let leadH;
  let leadY;
  let cards;
  if (n <= 2) {
    const w = G.band.w[n];
    const h = w * G.card.ratio;
    const x0 = right - (n * w + (n - 1) * G.card.gap);
    const mid = (G.band.stageTop + G.band.stageBottom) / 2;
    cards = guests.map((g, i) => ({ x: x0 + i * (w + G.card.gap), y: mid - h / 2, w, h }));
    leadW = x0 - G.midGap - G.pad.x;
    lines = wrapTitle(G, frags, leadW, size, accentSize, ls);
    leadH = head + lines.length * lineH;
    leadY = mid - leadH / 2;
  } else {
    leadW = G.row.leadW;
    lines = wrapTitle(G, frags, leadW, size, accentSize, ls);
    leadH = head + lines.length * lineH;
    leadY = G.pad.y + G.logo.h + G.topGap;
    const top = leadY + leadH + G.row.gapAbove;
    const avail = floor - top;
    const fill = (G.canvas.w - 2 * G.pad.x - (n - 1) * G.card.gap) / n;
    const h = Math.min(avail, fill * G.card.ratio);
    const w = h / G.card.ratio;
    cards = guests.map((g, i) => ({ x: G.pad.x + i * (w + G.card.gap), y: top + (avail - h) / 2, w, h }));
  }
  const faceH = cards[0].w / G.window.w;
  const titleY = leadY + head;

  /* The petal: punctuation after the last line, bottom just under its baseline. */
  let mark = null;
  if (lines.length) {
    const i = lines.length - 1;
    const last = lines[i];
    const lastSize = last.accent ? accentSize : size;
    const textW = textWidth(G, last.text, last.accent ? "serif" : "display", lastSize, ls);
    const base = titleY + i * lineH + baseline(G, "display", size, lineH);
    const h = G.mark.h * lastSize;
    mark = {
      x: G.pad.x + textW + G.mark.gap * lastSize,
      y: base + G.mark.drop * lastSize - h,
      w: (h * G.petal.w) / G.petal.h,
      h,
    };
  }

  const radius = faceH >= G.label.M.minFace ? G.card.radius : G.card.radiusS;
  const people = guests.map((g, i) => {
    const card = cards[i];
    return {
      guest: g,
      card,
      image: frameImage(G, g, card, faceH),
      label: labelBox(G, g, card, faceH),
      mono: g.img
        ? null
        : {
            text: g.placeholder ? "?" : initials(g.name) || "?",
            size: G.monogram.size * faceH,
            cx: card.x + card.w / 2,
            cy: card.y + (G.window.above + 0.5) * faceH,
          },
    };
  });

  return {
    n,
    band: n <= 2,
    sizeTier,
    size,
    accentSize,
    lineH,
    ls,
    kicker: plain(cfg.hook || cfg.category).toUpperCase(),
    eyebrow: plain(cfg.eyebrow),
    lead: { x: G.pad.x, y: leadY, w: leadW, h: leadH, titleY },
    lines,
    mark,
    faceH,
    radius,
    people,
  };
}

/* The functions the template receives, in dependency-free order. */
export const SHARED = [textWidth, baseline, plain, ellipsize, initials, wrapTitle, frameImage, labelBox, compose];
