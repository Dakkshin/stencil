/**
 * Lane A — group layouts.
 *
 *   theIntro  the headline sandwich: claim ABOVE the face row, the accent line
 *             BELOW it, so the faces sit inside the sentence. B&W cutouts in
 *             arched frames on one shared baseline, speech-bubble name tags
 *             with tails toward the faces (one tag tilted — the single
 *             deliberate imperfection), frosted CTA bar, petal sign-off.
 *   panel     the roster: claim on top (CE seal hung beside it), then the lineup
 *             as a credit row — large face discs with name and role beneath —
 *             CTA bar. ≥5 falls back to two columns of face + name rows.
 *
 * Both scale 1–6 panelists; at ≥5 faces tighten, tags shorten to first names
 * and roster credits drop to names.
 */
import { FONT, SPACE, RADIUS, C, ACCENT_SCALE, CE } from "../tokens.mjs";
import { measure, wrap, withSize } from "../text.mjs";
import { logo, pill, kicker, titleBlock, dateLine, portrait, nameTag, initials, ceBadge, ceStamp, stampRadius, buttonLabel, buttonContentW, registerUnit } from "../components.mjs";
import { qrFrame } from "../qr.mjs";
import { petal, PETAL_ASPECT } from "../atmosphere.mjs";
import { faceOf } from "../photo.mjs";
import { Scene } from "../scene.mjs";

/* ---------------- shared helpers ---------------- */

const roleOf = (p) => [p.role, p.company].filter(Boolean).join(" · ");

/** Split the normalized title into the sandwich halves. */
function sandwich(title) {
  const t = title || [];
  const above = t.filter((f) => !f.dim);
  const below = t.filter((f) => f.dim);
  if (above.length && below.length) return { above, below };
  const all = above.length ? above : below;
  if (all.length > 1) return { above: [all[0]], below: all.slice(1) };
  return { above: all, below: [] };
}

const fontFor = (frag, size) => (frag.dim ? withSize(FONT.accent, Math.round(size * ACCENT_SCALE)) : withSize(FONT.claim, size));

/** Pre-split each fragment into evenly balanced lines (no one-word orphans):
    the narrowest width that keeps the greedy line count. */
function balance(frags, maxW, size) {
  const out = [];
  for (const f of frags || []) {
    const font = fontFor(f, size);
    const count = wrap(f.text, maxW, font).length;
    let lo = 0, hi = maxW;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const ls = wrap(f.text, mid, font);
      if (ls.length <= count && ls.every((l) => measure(l, font) <= mid)) hi = mid;
      else lo = mid;
    }
    for (const t of wrap(f.text, hi, font)) out.push({ ...f, text: t });
  }
  return out;
}

/** Fewest lines first, then the largest size in [min,max]; returns balanced frags. */
function fitTitle(frags, maxW, { min, max, maxLines }) {
  const linesAt = (size) => titleBlock(null, null, { x: 0, top: 0, maxW, title: frags, size, dryRun: true }).lines.length;
  const minLines = (frags || []).length;
  for (let target = minLines; target <= maxLines; target++) {
    for (let size = max; size >= min; size -= 2) {
      if (linesAt(size) <= target) return { size, title: balance(frags, maxW, size) };
    }
  }
  return { size: min, title: balance(frags, maxW, min) };
}

/** fitTitle with the accent fragments held to their own (narrower) width. */
function fitMixed(frags, claimW, accentW, { min, max, maxLines }) {
  const widthOf = (f) => (f.dim ? accentW : claimW);
  const count = (size) => (frags || []).reduce((a, f) => a + wrap(f.text, widthOf(f), fontFor(f, size)).length, 0);
  const build = (size) => ({ size, title: (frags || []).flatMap((f) => balance([f], widthOf(f), size)) });
  for (let target = (frags || []).length; target <= maxLines; target++) {
    for (let size = max; size >= min; size -= 2) if (count(size) <= target) return build(size);
  }
  return build(min);
}

/** Logo top-left + "Live panel" format pill top-right. Returns the header bottom. */
function header(ctx) {
  const { s, F, T, theme, format } = ctx;
  const P = F.pad;
  const h = format === "portrait" ? CE.badgeH.portrait : CE.badgeH.square;
  const lg = logo(s, theme, { x: P, y: P - 6, h });
  const ph = Math.round(T.caption * 2.3);
  pill(s, theme, { x: F.w - P, y: lg.y + (h - ph) / 2, text: "Live panel", size: T.caption, align: "right", dot: true });
  return lg.y + lg.h;
}

/**
 * Floating registration row: the series registration unit on the left —
 * SIGNAL register pill (the post's one teal use) over a separate container
 * holding date/time beside the CE badge — with the QR on the right. No outer
 * card; the row floats on the ground. The badge's white plate is required by
 * the PACE mark; the plate is always drawn. Returns { x, y, w, h } (the
 * bounding row, used as a seal keep-out); `dryRun:true` measures only.
 */
function ctaBar(ctx, { dryRun = false } = {}) {
  const { s, cfg, F, T, theme, format, qr } = ctx;
  const P = F.pad;
  const x = P, w = F.w - P * 2;
  const size = T.caption + 2;
  const ctaFont = withSize(FONT.cta, size);
  const unit = registerUnit(s, theme, {
    x, y: 0, dir: "stack", cta: cfg.event?.cta || "Register now", ctaFont, size,
    date: cfg.event?.date, time: cfg.event?.time, dateSize: T.caption, paceH: 52, dryRun: true,
  });
  const qrBox = qrFrame(s, theme, { qr, dryRun: true });
  const h = Math.max(unit.h, qrBox.h);
  // QR cards ground on the otherwise empty bottom margin, preserving budget.
  const y = F.h - (qr ? SPACE.s : P) - h;
  if (dryRun) return { x, y, w, h };
  registerUnit(s, theme, {
    x, y: y + (h - unit.h), dir: "stack", cta: cfg.event?.cta || "Register now", ctaFont, size,
    date: cfg.event?.date, time: cfg.event?.time, dateSize: T.caption, paceH: 52,
  });
  qrFrame(s, theme, { qr, x: x + w - qrBox.w, y: y + (h - qrBox.h) / 2 });
  return { x, y, w, h };
}

/**
 * CE stamp placement — a sticker on the edge/corner of the post's dominant
 * visual (`anchor` box). Searches centres around the anchor's perimeter and
 * keeps the seal clear of every `keep` rect (headline lines, tags, faces,
 * names, logo, petal, CTA) and the canvas edge. Prefers the anchor's
 * top-right corner, then the other corners; shrinks r from rMax to rMin
 * before giving up. Returns the placement, or null when nothing is clear.
 */
function stampSpot(ctx, { anchor, keep, rMax, rMin, prefer = ["tr", "br", "tl", "bl"], bite = 0.4, extra = () => 0 }) {
  const { F } = ctx;
  const edge = SPACE.s, clear = 12; // breathing room around the seal's real footprint
  const hits = (cx, cy, r, b) => {
    const dx = Math.max(b.x - cx, 0, cx - (b.x + b.w));
    const dy = Math.max(b.y - cy, 0, cy - (b.y + b.h));
    return dx * dx + dy * dy < (r + clear) * (r + clear);
  };
  const corners = {
    tr: [anchor.x + anchor.w, anchor.y], br: [anchor.x + anchor.w, anchor.y + anchor.h],
    tl: [anchor.x, anchor.y], bl: [anchor.x, anchor.y + anchor.h],
    mr: [anchor.x + anchor.w, anchor.y + anchor.h / 2],
  };
  for (let r = rMax; r >= rMin; r -= 4) {
    let best = null;
    for (let cx = r + edge; cx <= F.w - r - edge; cx += 3) {
      for (let cy = r + edge; cy <= F.h - r - edge; cy += 3) {
        /* must bite into the anchor, but sit on its edge — not in its middle */
        const out = Math.hypot(Math.max(anchor.x - cx, 0, cx - (anchor.x + anchor.w)), Math.max(anchor.y - cy, 0, cy - (anchor.y + anchor.h)));
        const depth = Math.min(cx - anchor.x, anchor.x + anchor.w - cx, cy - anchor.y, anchor.y + anchor.h - cy);
        if (out > r * 0.9 || depth > r * bite) continue;
        if (keep.some((b) => b && hits(cx, cy, r, b))) continue;
        const score = Math.min(...prefer.map((k, i) => Math.hypot(cx - corners[k][0], cy - corners[k][1]) + i * 140)) + extra(cx, cy, r);
        if (!best || score < best.score) best = { cx, cy, r, score };
      }
    }
    if (best) return best;
  }
  if (process.env.LANE_DEBUG === "2") {
    const r = rMin, tally = new Map();
    for (let cx = r + edge; cx <= F.w - r - edge; cx += 3) for (let cy = r + edge; cy <= F.h - r - edge; cy += 3) {
      const out = Math.hypot(Math.max(anchor.x - cx, 0, cx - (anchor.x + anchor.w)), Math.max(anchor.y - cy, 0, cy - (anchor.y + anchor.h)));
      const depth = Math.min(cx - anchor.x, anchor.x + anchor.w - cx, cy - anchor.y, anchor.y + anchor.h - cy);
      if (out > r * 0.9 || depth > r * bite) continue;
      const bl = keep.map((b, i) => (b && hits(cx, cy, r, b) ? i : -1)).filter((i) => i >= 0);
      if (bl.length === 1) tally.set(bl[0], (tally.get(bl[0]) || 0) + 1);
    }
    console.error("stamp blockers (sole):", [...tally].map(([i, c]) => `${i}:${c} ${JSON.stringify(keep[i]).slice(0, 80)}`));
  }
  return null;
}

/** Arch (round top, flat bottom) as a path; `o` grows it outward (ring offset). */
function archPath({ x, y, w, h }, o = 0, open = false) {
  const r = w / 2 + o;
  const l = x - o, rt = x + w + o, top = y - o + r;
  const d = `M${l} ${y + h} V${top} A${r} ${r} 0 0 1 ${rt} ${top} V${y + h}`;
  return open ? d : `${d} Z`;
}

/**
 * One framing for a whole face row, relative to the frame top: every cutout
 * gets the same face size and eye line. The eye line drops (and, past
 * `maxTop`, the face grows) until even the shortest-cropped torso reaches the
 * frames' flat bottom — no photo ever stops short mid-frame.
 */
function seatRow(photos, { faceH, minTop, maxTop, bottom, maxFaceH }) {
  let h = faceH, top = minTop;
  const shortest = (hh) => Math.min(...photos.map((p) => { const f = faceOf(p); return ((p.bbox.bottom - f.y) * hh) / f.h; }));
  if (photos.length) {
    top = Math.max(minTop, Math.min(maxTop, bottom - shortest(h)));
    if (top + shortest(h) < bottom) {
      for (let hh = h; hh <= maxFaceH; hh += 2) { h = hh; if (top + shortest(hh) >= bottom) break; }
    }
  }
  const at = (p) => {
    const f = faceOf(p);
    const reach = top + ((p.bbox.bottom - f.y) * h) / f.h;
    return { faceH: h, faceTop: reach < bottom ? top + (bottom - reach) : top };
  };
  return { faceH: h, faceTop: top, at };
}

/** Monogram fallback inside an arch: tinted arch + initials, same weight as a photo. */
function archMonogram(s, theme, box, name, cy) {
  s.group("Monogram", () => {
    s.path({ d: archPath(box), fill: theme.tileFill, stroke: theme.line, name: "Monogram arch" });
    const size = Math.round(Math.min(box.w * 0.3, 96));
    const font = withSize(FONT.claimLight, size);
    s.text({ x: box.x + box.w / 2, top: cy - size * 0.7, lines: [initials(name) || "?"], font, lh: size * 1.4, fill: theme.fgMuted, anchor: "middle", name: "Initials" });
  });
}

/* Speech-bubble fills: one hue per speaker, all from the IU palette. Dark
   ground → mid blues under white ink; light ground → pale blues under ink. */
function tagFills(theme) {
  return theme.mode === "dark" ? [C.IU_BLUE, C.INDIGO] : [C.WHITE, C.POWDER];
}

/* ---------------- the_intro: headline sandwich ---------------- */

export async function theIntro(ctx) {
  /* trial runs on a scratch scene: the widest face row whose CE stamp still
     finds a clear spot (first centred at full width, then flush-left and a
     step narrower each time, which frees the right edge for the seal) */
  const scratch = () => ({ ...ctx, s: new Scene(ctx.F.w, ctx.F.h), background: async () => {} });
  let pick = {};
  if (ctx.cfg.event?.ce && ctx.panelists.length) {
    /* two ways to seat the seal; keep whichever leaves the bigger faces:
       "below" — full-width row, arches shortened so the seal hangs under the
       last chin; "beside" — row flush-left and narrowed until it clears */
    const tries = [];
    const below = await drawIntro(scratch(), { below: true });
    if (below.ok) tries.push({ opts: { below: true }, face: below.face });
    for (let w = below.archCap - 6; w >= 150; w -= 6) {
      const r = await drawIntro(scratch(), { archW: w });
      if (r.ok) { tries.push({ opts: { archW: w }, face: r.face }); break; }
    }
    if (tries.length) pick = tries.sort((a, b) => b.face - a.face)[0].opts;
  }
  await drawIntro(ctx, { ...pick, final: true });
}

async function drawIntro(ctx, { archW: forceW = null, below: stampBelow = false, final = false }) {
  const { s, cfg, F, T, theme, format, panelists } = ctx;
  await ctx.background();
  const P = F.pad, W = F.w, cw = W - P * 2;
  const portraitFmt = format === "portrait";

  const headBottom = header(ctx);
  const card = ctaBar(ctx, { dryRun: true });

  const ph = portraitFmt ? 64 : 56;
  const pw = ph * PETAL_ASPECT;
  const halves = sandwich(cfg.title);
  const n = Math.min(panelists.length, 6);
  const tight = n >= 5;
  const gap = n >= 3 ? SPACE.s : SPACE.m;
  /* CE stamp: a sticker on the face row's right edge — beside the last face
     when the row is narrowed for it, else below the last chin; either way the
     accent line (and its petal) stop short of where the seal hangs */
  const stampR = cfg.event?.ce && n ? stampRadius({ r: portraitFmt ? CE.stampBaseR.portrait : CE.stampBaseR.square, credits: cfg.event.ce }) : 0;
  const stampLeft = stampR ? W - SPACE.s - stampR * 2 : W;
  const belowW = stampR ? stampLeft - 12 - P : cw - pw - SPACE.l;
  const below = halves.below.length ? fitTitle(halves.below, belowW, { min: T.card + 4, max: T.display, maxLines: 2 }) : null;
  const belowTb = below ? titleBlock(null, null, { x: P, top: 0, maxW: belowW, title: below.title, size: below.size, dryRun: true }) : { h: 0, lines: [] };
  const archCap = n ? Math.min(portraitFmt ? 280 : 260, (cw - gap * (n - 1)) / n) : 0;
  const archMax = forceW ? Math.min(forceW, archCap) : archCap;
  /* names only: nameTag sets a role line at 0.72× — below the caption floor */
  const tagSize = tight ? T.caption : n >= 4 ? T.caption + 2 : Math.round(T.caption * 1.25);
  const withRole = false;
  /* tag footprint (bubble + tail) and how far it dips into the arch */
  const tail = Math.round(tagSize * 0.55);
  const tagH = Math.round(tagSize * 0.45) * 2 + Math.round(tagSize * 1.2) + tail;
  const lift = n >= 3 ? Math.round(tagSize * 0.5) : 0; // alternate tags ride higher

  /* vertical budget: kicker · claim · [tags + arches] · accent · CTA */
  const kickerH = Math.round(T.caption * 1.2);
  const g2 = SPACE.s; // kicker → claim
  const g3 = SPACE.m; // claim → tags
  const g4 = SPACE.m; // arches → accent
  const minTop = SPACE.m, minFoot = SPACE.l;
  const photos = panelists.slice(0, n).map((p) => p.photo).filter(Boolean);
  /* the faces lead: a tight head-and-shoulders crop, never past ~2× the
     smallest source face (low-res photos stay crisp) */
  const faceCap = photos.length ? Math.min(...photos.map((p) => faceOf(p).h * 2)) : Infinity;
  const kW = tight ? 0.5 : portraitFmt ? 0.62 : 0.52;
  const frameFor = (aw, h) => {
    const f0 = Math.min(aw * kW, h * 0.5, faceCap);
    const row = seatRow(photos, {
      faceH: f0,
      minTop: Math.max(f0 * 0.45 + aw * 0.05, h * 0.1),
      maxTop: h * 0.4,
      bottom: h + 2,
      maxFaceH: Math.min(aw * kW * 1.08, faceCap),
    });
    /* the tail tip just touches the hair; the bubble stays above the head */
    const hairTop = row.faceTop - row.faceH * 0.42;
    const dip = Math.round(Math.max(6, Math.min(aw * 0.12, hairTop + tail * 0.4)));
    return { row, dip };
  };
  /* claim → arch crown: the tags hang in this band; never tighter than l */
  const band = (dip) => Math.max(g3 + tagH + lift - dip, SPACE.l);
  const planFor = (above, aw) => {
    const aboveTb = titleBlock(null, null, { x: P, top: 0, maxW: cw, title: above.title, size: above.size, dryRun: true });
    const base = card.y - headBottom - minTop - minFoot - (kickerH + g2 + aboveTb.h + g4 + belowTb.h);
    const cap = (h) => (n ? Math.min(h, aw * (portraitFmt ? 1.9 : tight ? 1.75 : 1.5), portraitFmt ? 560 : 420) : 0);
    let archH = cap(base - band(Math.round(aw * 0.1))), fr = frameFor(aw, archH);
    for (let i = 0; i < 3; i++) { archH = cap(base - band(fr.dip)); fr = frameFor(aw, archH); }
    /* "below": shorten the arches until the last chin clears the seal's top */
    if (stampBelow) {
      const limit = card.y - SPACE.xs - 12 - stampR * 2 - 12 - 4; // 4 = search-grid tolerance
      const chin = (f) => headBottom + minTop + kickerH + g2 + aboveTb.h + band(f.dip) + f.row.faceTop + f.row.faceH * 1.05;
      while (chin(fr) > limit && archH > aw * 0.95) { archH -= 4; fr = frameFor(aw, archH); }
    }
    /* an arch shorter than ~0.95× its width stops reading as an arch */
    return { above, aboveTb, archW: aw, archH, fr, dip: fr.dip, fits: !n || archH >= aw * 0.95, slack: Math.max(0, base - band(fr.dip) - archH) };
  };
  /* one line of claim if it fits; portrait spends spare height on a bigger two-line claim */
  const claimFit = fitTitle(halves.above, cw, { min: T.display, max: T.displayMax, maxLines: 2 });
  let plan = planFor(claimFit, archMax);
  if (portraitFmt && plan.aboveTb.lines.length === 1) {
    const big = planFor(fitTitle(halves.above, cw, { min: T.displayMax, max: T.displayMax, maxLines: 2 }), archMax);
    if (big.fits && big.archH >= plan.archH - 4 && big.aboveTb.lines.length === 2) plan = big;
  }
  /* short on height: narrow the arches (never the type) until the row fits */
  for (let aw = archMax - 6; !plan.fits && aw >= 150; aw -= 6) plan = planFor(claimFit, aw);
  const { above, aboveTb, archW, archH, fr, dip, slack } = plan;

  /* keep-outs for the CE stamp: header, words, faces, tags, petal, CTA */
  const keep = [{ x: 0, y: 0, w: W, h: headBottom + SPACE.xs }, { x: card.x - SPACE.xs, y: card.y - SPACE.xs, w: card.w + SPACE.s, h: card.h + SPACE.s }];
  const lineBoxes = (tb) => tb.lines.map((l) => ({ x: P, y: l.top, w: l.w, h: l.lh }));

  let y = headBottom + minTop + (stampBelow ? 0 : slack * 0.5);
  const kk = kicker(s, theme, { x: P, y, text: cfg.category || cfg.eyebrow, size: T.caption });
  keep.push({ x: P, y, w: kk.w, h: kk.h });
  y += kickerH + g2;
  const aboveDrawn = titleBlock(s, theme, { x: P, top: y, maxW: cw, title: above.title, size: above.size });
  keep.push(...lineBoxes(aboveDrawn));
  y += aboveTb.h + g3;

  /* face row: arches on a shared baseline — centred, or flush-left with the
     headline when the right edge is left for the seal */
  const archTop = y - g3 + band(dip);
  const rowW = n * archW + (n - 1) * gap;
  const x0 = forceW ? P : P + (cw - rowW) / 2;
  const boxes = [];
  s.group("Face row", () => {
    panelists.slice(0, n).forEach((p, i) => {
      const box = { x: x0 + i * (archW + gap), y: archTop, w: archW, h: archH };
      boxes.push(box);
      const cx = box.x + archW / 2;
      s.path({ d: archPath(box, 9, true), stroke: theme.ring, sw: 1.5, strokeOpacity: 0.4, name: "Credibility ring" });
      if (p.photo) {
        s.path({
          d: archPath(box), name: "Arch ground",
          fill: { type: "linear", x1: 0, y1: 0, x2: 0, y2: 1, stops: [[theme.tileFill, 0], [theme.tileFill, 1, 0.5]] },
        });
        const seat = fr.row.at(p.photo);
        if (final && process.env.LANE_DEBUG === "3") console.error(`  [${cfg.name} ${format}] arch ${Math.round(archW)}x${Math.round(archH)} face ${Math.round(seat.faceH)} ${p.name}`);
        portrait(s, p.photo, { faceH: seat.faceH, faceTop: archTop + seat.faceTop, cx, clip: { d: archPath(box) }, name: `${p.name} portrait` });
        /* the head: hair to chin, a little wider than the face */
        keep.push({ x: cx - seat.faceH * 0.7, y: archTop + seat.faceTop - seat.faceH * 0.5, w: seat.faceH * 1.4, h: seat.faceH * 1.55 });
      } else {
        const my = archTop + fr.row.faceTop + fr.row.faceH * 0.55;
        archMonogram(s, theme, box, p.name, my);
        keep.push({ x: cx - archW * 0.3, y: my - archW * 0.2, w: archW * 0.6, h: archW * 0.4 });
      }
    });
  });

  /* speech-bubble name tags: bubble straddles the arch crown, tail drops
     toward the face; one tag is tilted a few degrees (#14). */
  const fills = tagFills(theme);
  const pitch = archW + gap;
  const tilted = n > 1 ? (n > 2 ? 1 : 0) : -1;
  const lo = P - SPACE.s, hi = forceW ? x0 + rowW + SPACE.s : W - P + SPACE.s;
  const tags = panelists.slice(0, n).map((p, i) => {
    const cx = boxes[i].x + boxes[i].w / 2;
    const maxW = n === 1 ? cw : Math.max(pitch - SPACE.s, 150);
    /* one line per tag: full name, else the short form, else the first name */
    const first = p.name.replace(/^(dr|mr|ms|mrs)\.?\s+/i, "").split(" ")[0];
    const fits = (t) => measure(t, withSize(FONT.name, tagSize)) + Math.round(tagSize * 0.7) * 2 <= maxW;
    const label = tight ? first : [p.name, p.short, first].find((t) => t && fits(t)) || first;
    const role = withRole ? p.role || "" : "";
    const probe = nameTag({ group() {} }, theme, { x: 0, y: 0, name: label, role, size: tagSize, maxW });
    const inset = RADIUS.soft + 6 + tail / 2; // tail centre from the bubble's left edge
    const tx = n === 1 ? cx - probe.w / 2 : cx - inset - archW * 0.06;
    return { label, role, maxW, w: probe.w, h: probe.h, tx, ty: archTop + dip - probe.h - (i % 2 ? lift : 0) };
  });
  /* keep neighbours a clear gap apart: push right, then pull back from the edge */
  const clear = SPACE.s;
  for (let i = 0; i < tags.length; i++) {
    tags[i].tx = Math.max(lo, tags[i].tx, i ? tags[i - 1].tx + tags[i - 1].w + clear : lo);
  }
  for (let i = tags.length - 1; i >= 0; i--) {
    tags[i].tx = Math.min(tags[i].tx, (i < tags.length - 1 ? tags[i + 1].tx - clear : hi) - tags[i].w);
  }
  keep.push(...tags.map((t) => ({ x: t.tx, y: t.ty, w: t.w, h: t.h })));
  s.group("Name tags", () => {
    tags.forEach((t, i) => {
      const draw = () => nameTag(s, theme, { x: t.tx, y: t.ty, name: t.label, role: t.role, size: tagSize, side: "left", fill: fills[i % fills.length], maxW: t.maxW });
      if (i === tilted) s.group("Tilted tag", draw, { transform: `rotate(-3.5 ${t.tx + t.w / 2} ${t.ty + t.h / 2})` });
      else draw();
    });
  });

  y = archTop + archH + g4;
  const belowDrawn = below ? titleBlock(s, theme, { x: P, top: y, maxW: belowW, title: below.title, size: below.size }) : null;
  if (belowDrawn) keep.push(...lineBoxes(belowDrawn));

  /* petal sign-off: hangs off the accent row's right end; with a stamp it
     closes the claim instead */
  const last = belowDrawn?.lines.at(-1);
  const claimLast = aboveDrawn.lines.at(-1);
  const petalAt = stampR
    ? claimLast && P + claimLast.w + SPACE.m + pw <= W - P
      ? { x: P + claimLast.w + SPACE.m, y: claimLast.top + claimLast.lh * 0.8 }
      : { x: W - P - pw, y: aboveDrawn.lines[0].top - SPACE.s }
    : last && last.w + SPACE.l + pw <= belowW + pw + SPACE.l
      ? { x: Math.min(W - P - pw, P + last.w + SPACE.m), y: last.top + last.lh * 0.8 }
      : { x: W - P - pw, y: card.y - SPACE.m };
  petal(s, theme, { ...petalAt, h: ph });
  keep.push({ x: petalAt.x, y: petalAt.y - ph, w: pw, h: ph });

  /* CE stamp: a sticker on the face row's right edge — the row is the dominant visual */
  let spot = null;
  if (stampR) {
    spot = stampSpot(ctx, { anchor: { x: x0, y: archTop, w: rowW, h: archH }, keep, rMax: stampR, rMin: stampR, prefer: ["br", "tr"], bite: 0.5 });
    if (spot) ceStamp(s, theme, { cx: spot.cx, cy: spot.cy, r: spot.r, credits: cfg.event?.ce });
    else if (final && process.env.LANE_DEBUG) console.error(`  [${cfg.name} ${format}] no clear spot for the CE stamp`);
  }

  ctaBar(ctx);
  return { ok: !stampR || Boolean(spot), archW, archCap, face: fr.row.faceH };
}

/* ---------------- panel: the roster ---------------- */

export async function panel(ctx) {
  /* trial run on a scratch scene: level 0 as designed; 1 = the headline wraps
     short of the seal so it always has a clear spot beside the words */
  const ok = await drawPanel({ ...ctx, s: new Scene(ctx.F.w, ctx.F.h), background: async () => {} }, { narrow: 0 });
  await drawPanel(ctx, { narrow: ok ? 0 : 1, final: true });
}

async function drawPanel(ctx, { narrow, final = false }) {
  const { s, cfg, F, T, theme, format, panelists } = ctx;
  await ctx.background();
  const P = F.pad, W = F.w, cw = W - P * 2;
  const portraitFmt = format === "portrait";

  const headBottom = header(ctx);
  const card = ctaBar(ctx, { dryRun: true });
  const ph = portraitFmt ? 64 : 56;
  const pw = ph * PETAL_ASPECT;

  const n = Math.min(panelists.length, 6);
  const listMode = n >= 5; // two columns of face + name rows
  const cols = listMode ? 2 : Math.max(n, 1);
  const rows = listMode ? Math.ceil(n / 2) : 1;

  /* CE stamp: a seal hung beside the headline block, on its right edge */
  const stampR = cfg.event?.ce ? stampRadius({ r: portraitFmt ? CE.stampBaseR.portrait : CE.stampBaseR.square, credits: cfg.event.ce }) : 0;
  const clear = 12;
  const lineW = narrow && stampR ? W - SPACE.s - Math.round(stampR * 2) - clear - P : cw;
  const fit = fitMixed(cfg.title, lineW, lineW, { min: T.display, max: T.display, maxLines: 5 });

  /* the credit row: face above name above role, one column per speaker */
  const colsGap = listMode ? SPACE.xl : SPACE.m;
  const colW = (cw - colsGap * (cols - 1)) / cols;
  let nameSize = listMode ? T.body : T.card - 4;
  while (!listMode && nameSize > T.body + 2 && panelists.slice(0, n).some((p) => measure(p.name, withSize(FONT.name, nameSize)) > colW)) nameSize -= 2;
  const nameFont = withSize(FONT.name, nameSize), nlh = Math.round(nameSize * 1.12);
  /* roles break at their " · " and step down to the caption tier rather than orphan a word */
  const partsFit = (f) => panelists.slice(0, n).every((p) => [p.role, p.company].filter(Boolean).every((t) => measure(t, f) <= colW));
  const roleFont = partsFit(withSize(FONT.body, T.caption + 2)) ? withSize(FONT.body, T.caption + 2) : withSize(FONT.body, T.caption);
  const rlh = Math.round(roleFont.size * 1.35);
  const credit = (p) => {
    const nameLines = wrapEven(p.name, colW, nameFont).slice(0, 2);
    const role = listMode ? "" : roleOf(p);
    let roleLines = role ? wrap(role, colW, roleFont) : [];
    if (roleLines.length > 1) roleLines = [p.role, p.company].filter(Boolean).flatMap((t) => wrapEven(t, colW, roleFont));
    return { nameLines, roleLines, h: nameLines.length * nlh + (roleLines.length ? SPACE.xs + roleLines.length * rlh : 0) };
  };
  const creditH = n ? Math.max(...panelists.slice(0, n).map((p) => credit(p).h)) : 0;

  const kh = Math.round(T.caption * 1.2);
  /* tightened fixed overhead so the discs take the freed room: headline sits
     closer above the roster and the roster closer above the footer */
  const topGap = SPACE.m, gapTL = portraitFmt ? SPACE.m : SPACE.s + 4, footGap = SPACE.s, ring = 6;
  const dCap = listMode ? (portraitFmt ? 150 : 120) : Math.min(colW - 16, portraitFmt ? 330 : 270);
  const dMin = listMode ? 0 : portraitFmt ? 230 : 190;
  const photos = panelists.slice(0, n).map((p) => p.photo).filter(Boolean);
  const faceCap = photos.length ? Math.min(...photos.map((p) => faceOf(p).h * 2)) : Infinity;

  /* dry layout: headline, seal, then the largest disc the room allows */
  const lay = (withKicker, shift = 0) => {
    const kTop = headBottom + topGap + shift;
    const titleTop = withKicker ? kTop + kh + SPACE.s : kTop;
    /* the accent is the supporting instruction (hook leads): set smaller so
       the faces take the freed room — same voice as the countdown cards */
    const tb = titleBlock(null, null, { x: P, top: titleTop, maxW: lineW, title: fit.title, size: fit.size, dryRun: true, accentScale: 0.64 });
    const keep = [{ x: 0, y: 0, w: W, h: headBottom + SPACE.xs }, { x: card.x - SPACE.xs, y: card.y - SPACE.xs, w: card.w + SPACE.s, h: card.h + SPACE.s }];
    if (withKicker) keep.push({ x: P, y: kTop, w: kicker({ rect() {}, text() {} }, theme, { x: P, y: kTop, text: cfg.category || cfg.eyebrow, size: T.caption }).w, h: kh });
    keep.push(...tb.lines.map((l) => ({ x: P, y: l.top, w: l.w, h: l.lh })));
    /* petal sign-off: hangs off the headline's last line, else closes the kicker row */
    const last = tb.lines.at(-1);
    const petalAt = last && P + last.w + SPACE.m + pw <= W - P
      ? { x: P + last.w + SPACE.m, y: last.top + last.lh * 0.8, h: ph }
      : { x: W - P - pw * 0.8, y: kTop + kh, h: Math.round(ph * 0.8) };
    keep.push({ x: petalAt.x, y: petalAt.y - petalAt.h, w: petalAt.h * PETAL_ASPECT, h: petalAt.h });
    const titleBottom = titleTop + tb.h;
    const spot = stampR
      ? stampSpot(ctx, {
          anchor: { x: P, y: titleTop, w: cw, h: tb.h }, keep, rMax: stampR, rMin: stampR, prefer: ["mr"], bite: 0.7,
          /* rather beside the words than hanging into the roster */
          extra: (cx, cy, r) => Math.max(0, cy + r - titleBottom) * 3,
        })
      : null;
    const rosterTop = Math.max(titleBottom + gapTL, spot ? spot.cy + spot.r + clear : 0);
    const room = card.y - footGap - rosterTop;
    const d = listMode
      ? Math.min(dCap, room / rows - SPACE.s * 2)
      : Math.min(dCap, room - ring * 2 - SPACE.s - creditH);
    return { withKicker, kTop, titleTop, tb, keep, petalAt, spot, rosterTop, room, d: Math.floor(d) };
  };
  /* the faces lead: when the kicker costs the roster its minimum disc, the kicker goes */
  let L = lay(true);
  if (L.d < dMin && cfg.category) { const L2 = lay(false); if (L2.d > L.d) L = L2; }
  /* spare height: centre the stack a little high between header and card */
  const used = listMode ? rows * (L.d + SPACE.s * 2) : L.d + ring * 2 + SPACE.s + creditH;
  const slack = Math.max(0, L.room - used);
  if (slack > 1) L = lay(L.withKicker, slack * 0.4);
  const { kTop, titleTop, keep, petalAt, spot, rosterTop, d } = L;

  if (L.withKicker) kicker(s, theme, { x: P, y: kTop, text: cfg.category || cfg.eyebrow, size: T.caption });
  const tb = titleBlock(s, theme, { x: P, top: titleTop, maxW: lineW, title: fit.title, size: fit.size, accentScale: 0.64 });
  petal(s, theme, petalAt);

  const face = (p, cx, cy, dd) => {
    if (final && process.env.LANE_DEBUG === "3") console.error(`  [${cfg.name} ${format}] disc ${Math.round(dd)} face ${Math.round(Math.min(dd * 0.48, faceCap))} ${p.name}`);
    const clip = { cx, cy, r: dd / 2 };
    if (p.photo) {
      /* deep navy disc, both themes: B&W faces pop off it, and it echoes the
         dark logistics chip — never the pale tile that washed out on light */
      s.circle({ cx, cy, r: dd / 2, fill: C.IU_NAVY, name: "Face ground" });
      /* face ≈ half the disc, eyes a touch above centre, hair clear of the rim */
      const fh = Math.min(dd * 0.48, faceCap);
      portrait(s, p.photo, { faceH: fh, cx, faceTop: cy - fh * 0.52, clip, name: `${p.name} portrait` });
    } else {
      s.circle({ cx, cy, r: dd / 2, fill: C.IU_NAVY, stroke: theme.line, name: "Monogram disc" });
      const mf = withSize(FONT.claimLight, Math.round(dd * 0.32));
      s.text({ x: cx, top: cy - dd / 2, lines: [initials(p.name) || "?"], font: mf, lh: dd, fill: C.WHITE, anchor: "middle", name: "Initials" });
    }
    s.circle({ cx, cy, r: dd / 2 + ring, stroke: theme.ring, sw: 1.5, strokeOpacity: 0.5, name: "Credibility ring" });
  };
  const drawCredit = (c, tx, top) => {
    s.text({ x: tx, top, lines: c.nameLines, font: nameFont, lh: nlh, fill: theme.fg, name: "Panelist name" });
    if (c.roleLines.length) s.text({ x: tx, top: top + c.nameLines.length * nlh + SPACE.xs, lines: c.roleLines, font: roleFont, lh: rlh, fill: theme.fgMuted, name: "Panelist role" });
  };

  if (n) s.group("Roster", () => {
    panelists.slice(0, n).forEach((p, i) => {
      if (listMode) {
        /* ≥5: two columns of face + name rows, hairlines between entries */
        const c = i % 2, r = Math.floor(i / 2);
        const x = P + c * (colW + colsGap);
        const rowH = d + SPACE.s * 2, ry = rosterTop + r * rowH;
        s.rect({ x, y: ry, w: colW, h: 1, fill: theme.line, name: "Roster rule" });
        if (r === rows - 1 || i + 2 >= n) s.rect({ x, y: ry + rowH, w: colW, h: 1, fill: theme.line, name: "Roster rule" });
        const cx = x + d / 2 + 8, cy = ry + rowH / 2;
        face(p, cx, cy, d);
        const c2 = credit(p), tx = cx + d / 2 + SPACE.l;
        drawCredit(c2, tx, cy - c2.h / 2);
      } else {
        /* the credit row: face, then name and role · company beneath, one top line */
        const x = P + i * (colW + colsGap);
        face(p, x + ring + 1 + d / 2, rosterTop + ring + d / 2, d);
        drawCredit(credit(p), x, rosterTop + ring * 2 + d + SPACE.s);
      }
    });
  });

  if (spot) ceStamp(s, theme, { cx: spot.cx, cy: spot.cy, r: spot.r, credits: cfg.event.ce });
  else if (stampR && narrow && process.env.LANE_DEBUG) console.error(`  [${cfg.name} ${format}] no clear spot for the CE stamp`);
  ctaBar(ctx);
  return !stampR || Boolean(spot);
}

/** Balanced wrap for supporting copy: the narrowest width keeping the line count. */
function wrapEven(text, maxW, font) {
  const count = wrap(text, maxW, font).length;
  let lo = 0, hi = maxW;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const ls = wrap(text, mid, font);
    if (ls.length <= count && ls.every((l) => measure(l, font) <= mid)) hi = mid;
    else lo = mid;
  }
  return wrap(text, hi, font);
}
