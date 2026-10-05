/**
 * Lane C — the IU "Signal" social mode (guidelines §8): timely, higher
 * contrast, directional. Two post types share one grammar:
 *
 *   figure lockup   one huge Inter Display figure (the post's ONE loud element)
 *                   with a short label stack beside it
 *   Noise → Signal  (§6) the arc field is the noise; ONE arc of it is lit and
 *                   lands on a single point, which resolves into a straight
 *                   hairline route — the day / the hour that matters
 *   people          a small ringed faces row (countdown: standing on the
 *                   route under the label; live: its own band)
 *   CTA + CE        frosted CTA card: [Register now →] + PACE logo badge as an
 *                   adjacent pair (series standard), date beneath the pair
 *   CE stamp        one tilted seal, stuck over the edge of the big figure
 *                   like a sticker — second read after the headline
 *
 *   one_more_day     countdown: numeral + "More day to go"; point at its foot,
 *                    route runs out to the petal sign-off
 *   happening_today  live today: "Live tonight" pill, the time set large; the
 *                    lit arc drops in from the top edge onto the cap line
 */
import { FONT, LH, SPACE, RADIUS, CE } from "../tokens.mjs";
import { measure, wrap, withSize, METRICS } from "../text.mjs";
import { logo, pill, kicker, titleBlock, dateLine, ceBadge, ceStamp, stampRadius, portrait, ring, monogram, registerUnit, buttonLabel, buttonContentW } from "../components.mjs";
import { qrFrame } from "../qr.mjs";
import { petal, PETAL_ASPECT } from "../atmosphere.mjs";

/* ---------------- lane helpers ---------------- */

/** Top of a text line box so the glyphs' cap line lands at `capTop`. */
function topForCap(font, capTop) {
  const m = METRICS[font.role];
  return capTop - (m.asc - m.cap) * font.size;
}

/** Draw one line so its cap line sits at capTop; returns { w, baseline }. */
function capText(s, { x, capTop, text, font, fill, name }) {
  const m = METRICS[font.role];
  s.text({ x, top: topForCap(font, capTop), lines: [text], font, lh: (m.asc + m.desc) * font.size, fill, name });
  return { w: measure(text, font), baseline: capTop + m.cap * font.size };
}

/** Round face chip: backing disc, B&W cutout (or monogram), hairline ring. */
function faceChip(s, theme, p, { cx, cy, d, ringGap = 6, faceK = 0.44 }) {
  const r = d / 2;
  const clip = { cx, cy, r };
  s.group(`Face · ${p.name}`, () => {
    if (p.photo) {
      s.circle({ cx, cy, r, fill: theme.tileFill, name: "Face disc" });
      portrait(s, p.photo, { faceH: d * faceK, cx, faceTop: cy - r + d * 0.2, clip });
    } else {
      monogram(s, theme, { name: p.name, clip, size: d * 0.34 });
    }
    ring(s, theme, { cx, cy, r: r + ringGap, sw: 1.5 });
  });
}

/** "Dr. Njo", "Manjali" — the short credit used under small faces. */
function shortName(name) {
  const n = String(name || "").trim();
  const dr = /^dr\.?\s+/i.test(n);
  const parts = n.replace(/^(dr|mr|ms|mrs)\.?\s+/i, "").replace(/,.*$/, "").split(/\s+/);
  return dr ? `Dr. ${parts[parts.length - 1]}` : parts[0];
}

/**
 * CE stamp placement: the free centre nearest `prefer` whose whole seal (true
 * radius R, from stampRadius) keeps `clear` px off every protected box and
 * stays inside the canvas inset and above `bottom` (the headline's kicker).
 * Returns { cx, cy } or null when nothing fits.
 */
function findStampSpot({ R, boxes, W, bottom, prefer, clear = 12, inset = SPACE.l }) {
  const dist = (b, x, y) => Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));
  let best = null;
  for (let cy = inset + R; cy <= bottom - clear - R; cy += 6) {
    for (let cx = inset + R; cx <= W - inset - R; cx += 6) {
      if (boxes.some((b) => dist(b, cx, cy) < R + clear)) continue;
      const dd = Math.hypot(cx - prefer.x, cy - prefer.y);
      if (!best || dd < best.dd) best = { cx, cy, dd };
    }
  }
  return best;
}

/** Protected boxes every post shares: logo and the status pill. */
function chromeBoxes(lg, pl) {
  return [{ x: lg.x, y: lg.y, w: lg.w, h: lg.h }, { x: pl.x, y: pl.y, w: pl.w, h: pl.h }];
}

/** Break a short label into two balanced lines. */
function twoLines(text) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words.join(" ")];
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const cost = Math.max(a.length, b.length);
    if (!best || cost < best.cost) best = { cost, lines: [a, b] };
  }
  return best.lines;
}

/**
 * Parse "8:00 – 9:00 PM EST" into a clean urgency lockup: main "TONIGHT AT 8 PM"
 * plus a single-line sub "8–9 PM EST". Falls back to the raw clock/zone when
 * the pattern doesn't match, so no post ever loses its time.
 */
function parseTimeRange(timeStr, urgency) {
  const raw = String(timeStr || "8:00 PM EST");
  const m = raw.match(/(\d{1,2})(?::\d{2})?\s*[–—-]\s*(\d{1,2})(?::\d{2})?\s*([AP]M)?\s*([A-Z]{2,4})?/i);
  if (m) {
    const mer = (m[3] || "PM").toUpperCase();
    const tz = m[4] ? ` ${m[4].toUpperCase()}` : "";
    return { main: `${String(urgency || "Tonight").toUpperCase()} AT ${m[1]} ${mer}`, sub: `${m[1]}–${m[2]} ${mer}${tz}` };
  }
  const [clock, ...zone] = raw.split(/\s+/);
  return { main: `${String(urgency || "Tonight").toUpperCase()} AT ${clock}`, sub: zone.join(" ") || raw };
}

/**
 * Split the title fragments into the hook (non-dim, the reason to attend) and
 * the supporting instruction (dim "~" lines). The hook leads with the topic;
 * the instruction follows the speakers at a clearly smaller size.
 */
function splitTitle(title) {
  const hook = (title || []).filter((f) => !f.dim);
  const instruction = (title || []).filter((f) => f.dim);
  return { hook, instruction };
}

/** Short credibility line under a multi-speaker face: role first, then company. */
function creditLine(p) {
  return [p.role, p.company].filter(Boolean).join(" · ");
}

/**
 * Floating registration row: Register pill beside the date/PACE container,
 * with a compact accreditation seal docked at the row's right end. No outer
 * card and no QR here — the QR rides a top-corner rail drawn by the caller.
 * Portrait stacks the date over the time inside the container so the seal
 * keeps its slot on the narrower row. Returns { x, y, w, h, pair, info }.
 * `dryRun:true` returns the footprint only.
 */
function ctaWithCe(s, theme, { x, y, w, cfg, T, size, tall, qr, dryRun = false, withCta = true }) {
  const cta = withCta ? cfg.event?.cta || "Register now" : null;
  const ctaFont = withSize(FONT.cta, size);
  const stacked = !!tall;
  const unit = registerUnit(s, theme, {
    x, y: 0, dir: "row", cta, ctaFont, size,
    date: cfg.event?.date, time: cfg.event?.time, dateSize: T.caption,
    dateStack: stacked, paceH: 52, dryRun: true,
  });
  /* compact in-row seal, sized to sit inside the row height exactly.
     When the row has no room the seal floats outside it (undocked) and the
     footer stays compact so the faces above keep their vertical room. */
  const R = stampRadius({ r: 64, credits: cfg.event?.ce, minSize: 9 });
  const sealCx = x + w - SPACE.s - R;
  const sealOk = sealCx - R >= x + unit.w + 12;
  const h = sealOk ? Math.max(unit.h, R * 2 + 4) : unit.h;
  const unitY = y + (h - unit.h);
  const seal = sealOk ? { cx: sealCx, cy: y + h / 2, r: R, minSize: 9 } : null;
  const pair = { x, y: unitY, w: unit.w, h: unit.h };
  const info = unit.info ? { ...unit.info, y: unitY + unit.info.y } : null;
  if (dryRun) return { x, y, w, h, pair, qrKeep: null, info, seal, sealR: R };
  registerUnit(s, theme, {
    x, y: unitY, dir: "row", cta, ctaFont, size,
    date: cfg.event?.date, time: cfg.event?.time, dateSize: T.caption,
    dateStack: stacked, paceH: 52,
  });
  return { x, y, w, h, pair, qrKeep: null, info, seal, sealR: R };
}
// NOTE: withCta=false drops the pill (its CTA lives in the corner rail);
// the container then starts at x and the seal keeps its right-end slot.

/**
 * Per-face credit geometry: long roles wrap to the slot instead of forcing
 * the whole row wider (Ben's full credit stays on one or two lines while
 * faces keep growing). Returns [{ slot, rlines }] plus the max role lines.
 */
function creditsFor(T, people, d, roles) {
  const nameF = withSize(FONT.meta, T.caption);
  const roleF = withSize(FONT.meta, Math.max(15, T.caption - 4));
  const roleLh = Math.round(roleF.size * 1.3);
  const rows = people.map((p) => {
    const role = people.length === 1 || !roles ? "" : creditLine(p);
    const base = Math.max(d + 12, measure(p.name, nameF));
    /* a role that must wrap breaks balanced (never orphaned): "Founder ·
       Veritas" over "Dental Resources", not a dangling last word */
    let rlines = role ? wrap(role, base, roleF) : [];
    if (rlines.length > 1) rlines = twoLines(role);
    const slot = Math.max(base, ...rlines.map((l) => measure(l, roleF)));
    return { slot, rlines };
  });
  return { rows, maxR: Math.max(0, ...rows.map((r) => r.rlines.length)), roleLh };
}

/** Height of a panel row: faces (+ ring) with full names and wrapped role lines. */
function panelRowH(T, n, d, beside = true, roles = true, people = null) {
  if (n === 1 && beside) return d + 12;
  if (!n) return 0;
  const nameLh = Math.round(T.caption * 1.3);
  if (!roles) return d + 12 + SPACE.s + nameLh;
  const roleLh = Math.round(Math.max(15, T.caption - 4) * 1.3);
  const lines = people ? creditsFor(T, people, d, true).maxR : 2;
  return d + 12 + SPACE.s + nameLh + (lines ? 6 + roleLh * lines : 0);
}

/** Width a panel row needs at face size d (slot = face, name or widest role line). */
function panelRowW(T, people, d, gap, beside = true, roles = true) {
  if (people.length === 1 && beside) return d + 12;
  return people.reduce((a, _, i) => a + creditsFor(T, people, d, roles).rows[i].slot + gap, -gap);
}

/** Full drawn width of panelRow, including a lone panelist's credit text. */
function panelRowFullW(T, people, d, gap) {
  if (people.length !== 1) return panelRowW(T, people, d, gap);
  const p = people[0];
  const role = [p.role, p.company].filter(Boolean).join(" · ");
  const tw = Math.max(measure(p.name, withSize(FONT.name, Math.round(T.card * 0.8))), role ? measure(role, withSize(FONT.meta, Math.max(15, T.caption - 4))) : 0);
  return d + 12 + SPACE.l + tw;
}

/**
 * Small ringed faces row from (x, top). One panelist gets a name/role credit
 * beside the face (or, with `beside:false`, the full name under it); 2+ get
 * short names under each face.
 */
function panelRow(s, theme, T, people, { x, top, d, gap, beside = true, roles = true }) {
  const n = people.length;
  if (!n) return;
  const cy = top + 6 + d / 2;
  s.group("Panel row", () => {
    if (n === 1 && beside) {
      const p = people[0];
      faceChip(s, theme, p, { cx: x + 6 + d / 2, cy, d });
      const nf = withSize(FONT.name, Math.round(T.card * 0.8));
      const rf = withSize(FONT.meta, Math.max(15, T.caption - 4));
      const role = [p.role, p.company].filter(Boolean).join(" · ");
      const nlh = Math.round(nf.size * 1.2), rlh = Math.round(rf.size * 1.4);
      const ty = cy - (nlh + (role ? rlh : 0)) / 2;
      const tx = x + d + 12 + SPACE.l;
      s.text({ x: tx, top: ty, lines: [p.name], font: nf, lh: nlh, fill: theme.fg, name: "Panelist name" });
      if (role) s.text({ x: tx, top: ty + nlh, lines: [role], font: rf, lh: rlh, fill: theme.fgMuted, name: "Panelist role" });
      return;
    }
    const isSingle = n === 1;
    const nameF = withSize(isSingle ? FONT.name : FONT.meta, isSingle ? Math.round(T.card * 0.7) : T.caption);
    const nameLh = Math.round(nameF.size * (isSingle ? 1.15 : 1.3));
    const roleF = withSize(FONT.meta, Math.max(15, T.caption - 4));
    const roleLh = Math.round(roleF.size * 1.3);
    const creds = isSingle || !roles ? null : creditsFor(T, people, d, true);
    let sx = x;
    people.forEach((p, i) => {
      const nm = p.name;
      const rlines = creds ? creds.rows[i].rlines : [];
      const slot = creds ? creds.rows[i].slot : Math.max(d + 12, measure(nm, nameF));
      const cx = sx + slot / 2;
      faceChip(s, theme, p, { cx, cy, d });
      s.text({ x: cx, top: cy + d / 2 + 6 + SPACE.s, lines: [nm], font: nameF, lh: nameLh, fill: theme.fg, anchor: "middle", name: "Panelist name" });
      if (rlines.length) s.text({ x: cx, top: cy + d / 2 + 6 + SPACE.s + nameLh + 6, lines: rlines, font: roleF, lh: roleLh, fill: theme.fgMuted, anchor: "middle", name: "Panelist role" });
      sx += slot + gap;
    });
  });
}

/**
 * Noise → Signal. Re-strokes ONE arc of the background field (same centre) in
 * the foreground ink, from where it enters the canvas (left edge, else top
 * edge) to the point (px, py), which gets a solid dot + halo. `run` extends a
 * straight hairline route from the point to x = run; `sign` (px) stands the
 * petal sign-off at the route's far end. `hole` {x,y,w,h} hides the arc
 * behind a figure whose counters would otherwise show it (a slashed "0").
 */
function signalArc(s, theme, origin, { px, py, run, sign, hole, sw = 2.5, opacity = 0.72, dot = 8 }) {
  const { cx, cy } = origin;
  const r = Math.hypot(px - cx, py - cy);
  const dx0 = 0 - cx;
  if (r <= Math.abs(dx0)) return;
  let sx = 0, sy = cy - Math.sqrt(r * r - dx0 * dx0);
  if (sy < 0) { sy = 0; sx = cx + Math.sqrt(r * r - cy * cy); }
  const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${px.toFixed(1)} ${py.toFixed(1)}`;
  s.group("Signal", () => {
    if (hole) {
      /* canvas minus the hole, wound opposite ways so nonzero leaves it empty */
      const clip = { d: `M0 0 H${s.w} V${s.h} H0 Z M${hole.x} ${hole.y} V${hole.y + hole.h} H${hole.x + hole.w} V${hole.y} Z` };
      s.group("Signal arc", () => s.path({ d, stroke: theme.fg, sw, strokeOpacity: opacity, name: "Arc" }), { clip });
    } else s.path({ d, stroke: theme.fg, sw, strokeOpacity: opacity, name: "Signal arc" });
    if (run) {
      const pw = sign ? sign * PETAL_ASPECT : 0;
      const x0 = px + dot * 2.2 + 8;
      const end = sign ? run - pw - SPACE.s : run;
      s.rect({ x: x0, y: py - 0.75, w: end - x0, h: 1.5, fill: theme.fg, opacity: 0.3, name: "Signal route" });
      if (sign) petal(s, theme, { x: run - pw, y: py + sign * 0.12, h: sign });
    }
    s.circle({ cx: px, cy: py, r: dot * 2.2, stroke: theme.fg, sw: 1.5, strokeOpacity: 0.35, name: "Signal halo" });
    s.circle({ cx: px, cy: py, r: dot, fill: theme.fg, name: "Signal point" });
  });
}

/**
 * Claim size: the largest size in [T.card, 0.8 × T.display] whose headline
 * block fits `maxH` and wraps cleanly — no line that is a lone word or under
 * ~45% of the line above it (a ragged orphan). The claim stays a clear second
 * voice to the figure. Falls back to the largest size that merely fits.
 */
function fitClaim(s, theme, { title, maxW, maxH, T }) {
  const ragged = (lines) => lines.some((l, i) => {
    const prev = lines[i - 1];
    return i > 0 && prev.accent === l.accent && (!/\s/.test(l.text.trim()) || l.w < prev.w * 0.45);
  });
  const top = Math.round(T.display * 0.8);
  let fits = null;
  for (let size = top; size >= T.card; size -= 2) {
    const tb = titleBlock(s, theme, { x: 0, top: 0, maxW, title, size, dryRun: true });
    if (tb.h > maxH) continue;
    if (!ragged(tb.lines)) return size;
    fits ??= size;
  }
  return fits ?? T.card;
}

/**
 * Shared foot: kicker + claim/accent above the card; optional petal sign-off.
 * `maxH` is the headline budget left after the figure took its minimum.
 */
function claimAboveCard(s, theme, { cfg, P, W, H, T, cardY, maxH, sign = true, dryRun = false }) {
  const claimSize = fitClaim(s, theme, { title: cfg.title, maxW: W - 2 * P, maxH: Math.min(maxH, H * 0.22), T });
  const tbDry = titleBlock(s, theme, { x: P, top: 0, maxW: W - 2 * P, title: cfg.title, size: claimSize, dryRun: true });
  const kH = Math.round(T.caption * LH.label);
  const claimTop = cardY - SPACE.xl - tbDry.h;
  const kY = claimTop - SPACE.m - kH;
  /* petal at the right margin beside the last line — only if every line it
     sits alongside leaves it room */
  const pBot = claimTop + tbDry.h - 6, pTop = pBot - 60;
  const beside = tbDry.lines.filter((l) => claimTop + l.top + l.lh > pTop);
  const hasPetal = sign && beside.length && beside.every((l) => P + l.w + 90 < W - P);
  /* protected ground for the CE stamp: kicker row, each claim line, the petal */
  const boxes = [
    { x: P, y: kY, w: W - 2 * P, h: kH, name: "kicker" },
    ...tbDry.lines.map((l) => ({ x: P, y: claimTop + l.top, w: l.w, h: l.lh, name: "claim line" })),
    ...(hasPetal ? [{ x: W - P - 24, y: pTop, w: 60 * PETAL_ASPECT, h: 60, name: "petal" }] : []),
  ];
  if (dryRun) return { kY, claimSize, boxes };
  kicker(s, theme, { x: P, y: kY, text: cfg.category || cfg.eyebrow, size: T.caption });
  titleBlock(s, theme, { x: P, top: claimTop, maxW: W - 2 * P, title: cfg.title, size: claimSize });
  if (hasPetal) petal(s, theme, { x: W - P - 24, y: pBot, h: 60 });
  return { kY, claimSize, boxes };
}

/** Height the kicker + its gap take above the headline. */
const kickerBlock = (T) => Math.round(T.caption * LH.label) + SPACE.m;

/* ---------------- one_more_day ---------------- */

/**
 * Promo 04 split (single-panelist countdown): the left half carries the copy —
 * urgency lockup, kicker, hook claim and instruction, then date/time — while
 * the right half holds the panelist in the round container, as large as the
 * half allows. Register + QR + CE share one row at the bottom of the left
 * half. The PACE plate docks beside the date (accreditation rule).
 */
async function qrCountdownSplit(ctx) {
  const { s, cfg, F, T, theme, panelists, format, qr } = ctx;
  await ctx.background();
  const P = F.pad, W = F.w, H = F.h;
  const tall = format === "portrait";
  const p = panelists[0] || { name: "" };

  const lg = logo(s, theme, { x: P, y: P - 6, h: 84 });

  /* split: copy lives left of the seam, the panelist owns the right half */
  const midX = Math.round(P + (W - 2 * P) * (tall ? 0.54 : 0.58));
  const leftW = midX - P - SPACE.s;
  const rightW = W - midX;

  /* right half: the panelist in the round container, as large as the half allows */
  const logoBottom = lg.y + lg.h;
  const discCx = midX + Math.round(rightW / 2);
  const nameF = withSize(FONT.meta, T.caption + 2);
  const nameLh = Math.round((T.caption + 2) * 1.3);
  const zoneTop = logoBottom + SPACE.m;
  const zoneBot = H - P - SPACE.l;
  const nameReserve = p.name ? SPACE.s + nameLh : 0;
  const discD = Math.max(160, Math.min(rightW - 32, zoneBot - zoneTop - nameReserve));
  const discCy = zoneTop + (zoneBot - zoneTop - nameReserve - discD) / 2 + discD / 2;
  faceChip(s, theme, p, { cx: discCx, cy: discCy, d: discD, faceK: 0.52 });
  if (p.name) {
    s.text({ x: discCx, top: discCy + discD / 2 + 6 + (SPACE.s - 6), lines: [p.name], font: nameF, lh: nameLh, fill: theme.fg, anchor: "middle", name: "Panelist name" });
  }

  /* numeral + label as one unit: the numeral is the loudest mark on the canvas */
  const num = String(cfg.countdown?.number || "1");
  const label = cfg.countdown?.label || "More day to go";
  const bandTop = lg.y + lg.h + SPACE.xl;
  const nf0 = { ...FONT.claim, tracking: -0.055 };
  const lf = withSize({ ...FONT.claim, tracking: -0.025 }, T.card + 10);
  const lLh = Math.round((T.card + 10) * 1.14);
  const lines = measure(label, lf) <= leftW * 0.52 ? [label] : twoLines(label);
  const labelW = Math.max(...lines.map((l) => measure(l, lf)));
  let numSize = Math.floor((H * (tall ? 0.18 : 0.19)) / METRICS.display.cap);
  const perNum = measure(num, withSize(nf0, 100)) / 100;
  while (numSize > T.display && numSize * perNum + SPACE.m + labelW > leftW) numSize -= 4;
  const numFont = withSize(nf0, numSize);
  const capH = METRICS.display.cap * numSize;
  const numW = measure(num, numFont);
  const colX = P + numW + SPACE.m;
  capText(s, { x: P, capTop: bandTop, text: num, font: numFont, fill: theme.fg, name: "Countdown numeral" });
  s.text({ x: colX, top: bandTop + capH - lines.length * lLh, lines, font: lf, lh: lLh, fill: theme.fg, name: "Countdown label" });

  /* topic group constrained to the left half: kicker, hook claim, instruction */
  const { hook, instruction } = splitTitle(cfg.title);
  const kH = Math.round(T.caption * LH.label);
  const cat = String(cfg.category || cfg.eyebrow || "");
  const kLines = cat.includes(" · ")
    ? [cat.slice(0, cat.indexOf(" · ")), cat.slice(cat.indexOf(" · ") + 3)]
    : [cat];
  const topicTop = Math.round(bandTop + capH + SPACE.l);
  kLines.forEach((t, i) => kicker(s, theme, { x: P, y: topicTop + i * kH, text: t, size: T.caption }));
  const hookTop = topicTop + kLines.length * kH + SPACE.m;
  let hookSize = fitClaim(s, theme, { title: hook.length ? hook : cfg.title, maxW: leftW, maxH: H * 0.3, T });
  hookSize = Math.min(hookSize, T.card + 6);
  const hookDry = titleBlock(s, theme, { x: P, top: hookTop, maxW: leftW, title: hook.length ? hook : cfg.title, size: hookSize });
  const insFont = withSize(FONT.accent, T.body);
  const insLh = Math.round(T.body * 1.3);
  const insLines = instruction.flatMap((f) => wrap(String(f.text || "").replace(/^~\s*/, ""), leftW, insFont));
  const insTop = hookTop + hookDry.h + (insLines.length ? SPACE.l : 0);
  if (insLines.length) {
    s.text({ x: P, top: insTop, lines: insLines, font: insFont, lh: insLh, fill: theme.fgMuted, name: "Supporting instruction" });
  }
  const dateTop = insTop + (insLines.length ? insLines.length * insLh + SPACE.l : 0);
  let dateSize = T.caption + 2;
  const dateText = [cfg.event?.date, cfg.event?.time].filter(Boolean).join(" · ");
  const paceFor = (h) => ceBadge(s, theme, { x: 0, y: 0, h, dryRun: true });
  let paceH = 36, dateFont = withSize(FONT.meta, dateSize);
  while (dateSize > 17 && measure(dateText, withSize(FONT.meta, dateSize)) + SPACE.s + paceFor(paceH).w > leftW) dateSize -= 1;
  dateFont = withSize(FONT.meta, dateSize);
  const dateLh = Math.round(dateSize * 1.4);
  if (dateText) {
    s.text({ x: P, top: dateTop, lines: [dateText], font: dateFont, lh: dateLh, fill: theme.fg, name: "Date + time" });
    const pace = paceFor(paceH);
    ceBadge(s, theme, { x: P + measure(dateText, dateFont) + SPACE.s, y: dateTop + (dateLh - paceH) / 2, h: paceH });
  }

  /* bottom of the left half: Register + QR + CE share one row (square);
     portrait stacks the pill over the QR + stamp pair (same elements, room) */
  const cta = cfg.event?.cta || "Register now";
  let ctaSize = T.caption + 2;
  const ctaFont = withSize(FONT.cta, ctaSize);
  const pillWFor = (sz) => {
    const f = withSize(FONT.cta, sz);
    return Math.round(buttonContentW(cta, f, sz) + sz * 1.8);
  };
  if (tall) {
    const pillW = pillWFor(ctaSize);
    const pillH = Math.round(ctaSize * 2.6);
    const qrEdge = 132;
    let stampR = 70;
    if (cfg.event?.ce) stampR = Math.max(70, stampRadius({ r: 70, credits: cfg.event.ce }));
    const row2H = Math.max(qrEdge, stampR * 2);
    const blockH = pillH + SPACE.s + row2H;
    const rowY = H - P - blockH;
    s.rect({ x: P, y: rowY, w: pillW, h: pillH, rx: pillH / 2, fill: theme.signal, name: "Register button" });
    buttonLabel(s, { cx: P + pillW / 2, top: rowY, lh: pillH, label: cta, font: ctaFont, size: ctaSize, color: theme.onSignal });
    const y2 = rowY + pillH + SPACE.s;
    if (qr) qrFrame(s, theme, { qr, x: P, y: y2 + (row2H - qrEdge) / 2, edge: qrEdge, labels: "none" });
    if (cfg.event?.ce) ceStamp(s, theme, { cx: P + qrEdge + SPACE.s + stampR, cy: y2 + row2H / 2, r: stampR, credits: cfg.event.ce, minSize: 15 });
  } else {
  let pillW = pillWFor(ctaSize);
  let qrEdge = 116, stampR = 64;
  if (cfg.event?.ce) stampR = stampRadius({ r: 62, credits: cfg.event.ce });
  while (pillW + SPACE.s + qrEdge + SPACE.s + stampR * 2 > leftW && qrEdge > 96) { qrEdge -= 4; stampR -= 1; }
  while (pillW + SPACE.s + qrEdge + SPACE.s + stampR * 2 > leftW && ctaSize > 19) { ctaSize -= 1; pillW = pillWFor(ctaSize); }
  const ctaFont = withSize(FONT.cta, ctaSize);
  const pillH = Math.round(ctaSize * 2.6);
  const rowH = Math.max(pillH, qrEdge, stampR * 2);
  const rowY = H - P - rowH;
  let rx = P;
  const pillY = rowY + (rowH - pillH) / 2;
  s.rect({ x: rx, y: pillY, w: pillW, h: pillH, rx: pillH / 2, fill: theme.signal, name: "Register button" });
  buttonLabel(s, { cx: rx + pillW / 2, top: pillY, lh: pillH, label: cta, font: ctaFont, size: ctaSize, color: theme.onSignal });
  rx += pillW + SPACE.s;
  if (qr) qrFrame(s, theme, { qr, x: rx, y: rowY + (rowH - qrEdge) / 2, edge: qrEdge, labels: "none" });
  rx += qrEdge + SPACE.s;
  if (cfg.event?.ce) ceStamp(s, theme, { cx: rx + stampR, cy: rowY + rowH / 2, r: stampR, credits: cfg.event.ce, minSize: 15 });
  }
}

/**
 * QR signal cards (04 one-more-day, 05 live-tonight) read top to bottom:
 * brand header → urgency + topic → speaker row → supporting instruction →
 * registration footer. The QR rides a bare top-corner rail (the urgency
 * lockup already carries the status, so no pill); the footer row floats free
 * — Register pill beside the date/PACE container with a compact seal docked
 * at its right end. Faces take every spare pixel up to panel-disc size.
 * Sections separate by space, not rules. No arc, route, dot or petal.
 */
async function qrSignal(ctx, live) {
  const { s, cfg, F, T, theme, panelists, format, qr } = ctx;
  /* single-panelist countdown (Promo 04) gets the split layout: copy left,
     panelist bleeding down the right half */
  if (!live && panelists.slice(0, 6).length === 1) return qrCountdownSplit(ctx);
  await ctx.background();
  const P = F.pad, W = F.w, H = F.h;
  const tall = format === "portrait";
  const usable = W - P * 2;
  const lg = logo(s, theme, { x: P, y: P - 6, h: 84 });
  const size = T.caption + 2;
  /* corner rail: live cards stack a smaller QR over a compact Register pill
     (tighter padding than footer pills so the time lockup keeps its size);
     countdown rides a bare code. The footer row keeps its own button. */
  const railEdge = 160;
  const railTop = P - 6;
  const railQrW = railEdge;
  let railX = W - P - railEdge, railBottom = railTop + railEdge, railPill = null;
  if (live) {
    const rctaFont = withSize(FONT.cta, size);
    const pillW = Math.round(buttonContentW(cfg.event?.cta || "Register now", rctaFont, size) + size * 1.4);
    const pillH = Math.round(size * 2.6);
    const pillX = W - P - pillW, pillY = railTop + railEdge + SPACE.s;
    railX = Math.min(W - P - railEdge, pillX);
    railBottom = pillY + pillH;
    railPill = { x: pillX, y: pillY, w: pillW, h: pillH };
  }
  const cardOpts = { x: P, w: usable, cfg, T, size, tall, qr };
  const card = ctaWithCe(s, theme, { ...cardOpts, y: 0, dryRun: true });
  const cardY = H - P - card.h;
  const top = lg.y + lg.h + SPACE.xl;
  /* accreditation docks in the footer row; only if the row has no room does
     it straddle the row's top-right instead (faces already clear that zone
     by construction, so the fallback never covers a chin) */
  const docked = !!card.seal;
  const sealCx = docked ? card.seal.cx : W - P - card.sealR - SPACE.s;
  const sealCy = docked ? cardY + card.seal.cy : cardY;
  const sealR = docked ? card.seal.r : card.sealR;
  const sealMin = docked ? card.seal.minSize : 8;
  const upperW = railX - P;
  const railBox = { x: railX, y: railTop, w: W - P - railX, h: railBottom - railTop };

  /* ---------- urgency row (left of the seal) ---------- */
  const figureRecipe = { ...FONT.claim, tracking: -0.055 };
  let urgencyH = 0;
  if (live) {
    const { main, sub } = parseTimeRange(cfg.event?.time, cfg.urgency || "Tonight");
    const perMain = measure(main, withSize(figureRecipe, 100)) / 100;
    const mainSize = Math.max(T.card, Math.floor(Math.min(Math.round(T.display * 1.1), upperW / perMain)));
    const mainFont = withSize(figureRecipe, mainSize);
    const subFont = withSize(FONT.meta, T.caption);
    const subH = Math.round(T.caption * 1.4);
    capText(s, { x: P, capTop: top, text: main, font: mainFont, fill: theme.fg, name: "Live time" });
    s.text({ x: P, top: top + METRICS.display.cap * mainSize + SPACE.s, lines: [sub], font: subFont, lh: subH, fill: theme.fgMuted, name: "Time range" });
    urgencyH = METRICS.display.cap * mainSize + SPACE.s + subH;
  } else {
    const num = String(cfg.countdown?.number || "1");
    const label = cfg.countdown?.label || "More day to go";
    const perNum = measure(num, withSize(figureRecipe, 100)) / 100;
    const labelW = Math.max(...twoLines(label).map((l) => measure(l, withSize({ ...FONT.claim, tracking: -0.025 }, T.card))));
    const figSize = Math.max(T.display, Math.floor(Math.min(T.display * 2.7, (upperW - labelW - SPACE.m) / perNum)));
    const numFont = withSize(figureRecipe, figSize);
    const numW = measure(num, numFont);
    const capH = METRICS.display.cap * figSize;
    const lf = withSize({ ...FONT.claim, tracking: -0.025 }, T.card);
    const lLh = Math.round(T.card * 1.04);
    const colX = P + numW + SPACE.m;
    const lines = measure(label, lf) <= W - P - colX ? [label] : twoLines(label);
    capText(s, { x: P, capTop: top, text: num, font: numFont, fill: theme.fg, name: "Countdown numeral" });
    /* the label hangs at the numeral's foot, bottom-aligned to its cap line */
    s.text({ x: colX, top: top + capH - lines.length * lLh, lines, font: lf, lh: lLh, fill: theme.fg, name: "Countdown label" });
    urgencyH = capH;
  }

  /* ---------- topic group (full width, directly beneath urgency) ---------- */
  const { hook, instruction } = splitTitle(cfg.title);
  const kH = Math.round(T.caption * LH.label);
  const topicTop = Math.max(top + urgencyH + SPACE.m, railBox.y + railBox.h + SPACE.s);
  const people = panelists.slice(0, 6);
  const n = people.length;
  /* countdown single: the face gets a column right of the hook's widest line,
     so faces reach panel-disc size instead of stacking small below the topic */
  const side = n === 1 && !live;
  // side column yields hook width so the single face can run larger
  const hookMaxW = Math.round(usable * (side ? 0.54 : 0.66)); // narrow measure: long hooks take an intentional two-line break
  /* stacked rows budget faces below the topic; the side column shares the
     band with the hook, so it reserves nothing from the hook's budget */
  const speakReserve = side ? 0 : n <= 1 ? 96 + 12 : panelRowH(T, n, 96, false, true, people);
  const insFont = withSize(FONT.accent, T.body);
  const insLh = Math.round(T.body * LH.accent);
  const insLines = instruction.flatMap((f) => wrap(String(f.text || "").replace(/^~\s*/, ""), usable, insFont));
  const insExact = insLines.length ? insLines.length * insLh + SPACE.m : 0;
  /* countdown kicker breaks at its middle dot so the year rides its own line */
  const kText = cfg.category || cfg.eyebrow || "";
  const kLines = side && kText.includes(" · ")
    ? [kText.slice(0, kText.indexOf(" · ")), kText.slice(kText.indexOf(" · ") + 3)]
    : [kText];
  const kickerBlockH = kLines.length * kH + SPACE.m;
  let hookBudget = Math.min(H * 0.2, cardY - SPACE.xl - (side ? kickerBlockH : kickerBlock(T)) - topicTop - speakReserve - SPACE.m * 4 - insExact);
  /* square multi-face cards: hold the hook to two lines at card size so the
     row below reaches panel-disc size — the urgency figure already leads */
  if (!tall && !side && n > 1) hookBudget = Math.min(hookBudget, Math.round((T.card + 6) * 1.04) * 2 + 8);
  let hookSize = fitClaim(s, theme, { title: hook.length ? hook : cfg.title, maxW: hookMaxW, maxH: Math.max(hookBudget, T.card * 2.4), T });
  let hookDry = titleBlock(s, theme, { x: P, top: 0, maxW: hookMaxW, title: hook.length ? hook : cfg.title, size: hookSize, dryRun: true });
  /* side column needs a two-line hook: cap the size so the widest line leaves
     the face column room (smaller size only ever merges lines, never adds) */
  if (side) {
    const capped = Math.min(hookSize, T.card + 6);
    if (capped < hookSize) {
      hookSize = capped;
      hookDry = titleBlock(s, theme, { x: P, top: 0, maxW: hookMaxW, title: hook.length ? hook : cfg.title, size: hookSize, dryRun: true });
    }
  }
  /* side countdown with a single hook fragment takes an exact balanced break
     ("Pull your write-offs" over "by plan tonight."), sized to the column */
  let forcedLines = null;
  if (side && hook.length === 1) {
    const text = String(hook[0].text || "").replace(/^~\s*/, "");
    const fl = twoLines(text);
    let fs = hookSize;
    const fw = (t) => measure(t, withSize(FONT.claim, fs));
    while (fs > T.card && fl.some((l) => fw(l) > hookMaxW)) fs -= 2;
    forcedLines = { lines: fl, size: fs };
    hookSize = fs;
    hookDry = { h: fl.length * Math.round(fs * LH.claim), lines: fl.map((t) => ({ text: t, w: fw(t) })) };
  }
  kLines.forEach((t, i) => kicker(s, theme, { x: P, y: topicTop + i * kH, text: t, size: T.caption }));
  const hookTop = topicTop + kLines.length * kH + SPACE.s;
  if (forcedLines) {
    const ff = withSize(FONT.claim, forcedLines.size);
    const flh = Math.round(forcedLines.size * LH.claim);
    s.text({ x: P, top: hookTop, lines: forcedLines.lines, font: ff, lh: flh, fill: theme.fg, name: "Claim" });
  } else {
    titleBlock(s, theme, { x: P, top: hookTop, maxW: hookMaxW, title: hook.length ? hook : cfg.title, size: hookSize });
  }
  const topicBottom = hookTop + hookDry.h;

  /* sections separate by air, not rules: the gap doubles as negative space
     around the larger faces */
  const gap = n >= 5 ? SPACE.s : SPACE.l;
  const insReserve = insExact;
  let insTop;
  if (side) {
    /* face column right of the hook's widest drawn line: a large disc with
       the name below it (the role line is dropped here — it is what pinned
       the size — the full credit already appears on every other promo).
       The closing instruction sits under the hook in the left column (clear
       of the face), so the face may run down to the footer instead of
       stopping above the instruction. */
    const p = people[0];
    const hookW = Math.max(0, ...hookDry.lines.map((l) => l.w));
    const faceColX = P + hookW + SPACE.l;
    const faceColW = W - P - faceColX;
    const faceTop = topicTop + kLines.length * kH + SPACE.s;
    const sNameF = withSize(FONT.meta, T.caption);
    const sNameLh = Math.round(T.caption * 1.3);
    const nameW = measure(p.name, sNameF);
    const colH = (dd) => dd + 12 + (SPACE.s - 6) + sNameLh;
    const need = (dd) => Math.max(dd + 12, nameW);
    const roomSide = cardY - SPACE.l - faceTop;
    const faceCx = faceColX + faceColW / 2;
    let d = Math.min(480, faceColW - 12);
    while (d > 84 && (colH(d) > roomSide || need(d) > faceColW)) d -= 2;
    /* the undocked CE stamp floats right of the footer: the disc stays clear
       of its box (backstop — the caption nudge below handles the rest) */
    const stampR = card.sealR || 0;
    const stampTop = cardY - stampR;
    const stampLeft = W - P - stampR * 2 - SPACE.s;
    while (d > 84 && faceCx + d / 2 > stampLeft && faceTop + 6 + d > stampTop - 8) d -= 2;
    const cy = faceTop + 6 + d / 2;
    faceChip(s, theme, p, { cx: faceCx, cy, d, faceK: 0.52 });
    const ny = cy + d / 2 + 6 + (SPACE.s - 6);
    /* nudge the name left only when it would otherwise graze the stamp */
    let nx = faceCx;
    if (nx + nameW / 2 > stampLeft && ny + sNameLh > stampTop - 8 && ny < stampTop + stampR * 2) {
      nx = stampLeft - nameW / 2 - 8;
    }
    s.text({ x: nx, top: ny, lines: [p.name], font: sNameF, lh: sNameLh, fill: theme.fg, anchor: "middle", name: "Panelist name" });
    /* closing instruction stays in the left column under the hook, where it
       cannot collide with the enlarged face; re-wrap it to that column */
    const sideIns = instruction.flatMap((f) => wrap(String(f.text || "").replace(/^~\s*/, ""), Math.max(240, faceColX - P - SPACE.s), insFont));
    insLines.splice(0, insLines.length, ...sideIns);
    insTop = topicBottom + SPACE.m;
  } else {
    const speakTop = topicBottom + SPACE.l;

    /* ---------- speaker row (full width, centred, compact) ---------- */
    const room = cardY - SPACE.l - insReserve - speakTop;
    /* role lines ride along when space permits; otherwise names alone carry the row */
  let roles = true;
  let d = Math.min(tall ? 280 : 240, upperW);
    while (d > 96 && n > 1 && (panelRowH(T, n, d, false, true, people) > room || panelRowW(T, people, d, gap, false, true) > usable)) d -= 2;
    if (n > 1 && (panelRowH(T, n, d, false, true, people) > room || panelRowW(T, people, d, gap, false, true) > usable)) {
    roles = false;
    d = Math.min(tall ? 280 : 240, upperW);
      while (d > 84 && n > 1 && (panelRowH(T, n, d, false, false) > room || panelRowW(T, people, d, gap, false, false) > usable)) d -= 2;
    }
    if (n === 1) {
      while (d > 84 && d + 12 > room) d -= 2;
    }
    const rowH = n === 1 ? d + 12 : n ? panelRowH(T, n, d, false, roles, people) : 0;
    const rowW = n > 1 ? panelRowW(T, people, d, gap, false, roles) : 0;
    /* single speaker: face + full name + full role beside it; 2+: faces spread
       evenly across the full width with full names and one short role line. */
    if (n === 1) {
      const p = people[0];
      const cy = speakTop + 6 + d / 2;
      faceChip(s, theme, p, { cx: P + 6 + d / 2, cy, d });
      const nf = withSize(FONT.name, Math.round(T.card * 0.8));
      const rf = withSize(FONT.meta, Math.max(15, T.caption - 4));
      const role = creditLine(p);
      const nlh = Math.round(nf.size * 1.2), rlh = Math.round(rf.size * 1.4);
      const ty = cy - (nlh + (role ? rlh : 0)) / 2;
      s.text({ x: P + d + 12 + SPACE.l, top: ty, lines: [p.name], font: nf, lh: nlh, fill: theme.fg, name: "Panelist name" });
      if (role) s.text({ x: P + d + 12 + SPACE.l, top: ty + nlh, lines: [role], font: rf, lh: rlh, fill: theme.fgMuted, name: "Panelist role" });
    } else if (n) {
      const startX = P + Math.max(0, (usable - rowW) / 2);
      panelRow(s, theme, T, people, { x: startX, top: speakTop + Math.max(0, (room - rowH) / 2), d, gap, beside: false, roles });
    }
    insTop = speakTop + rowH + SPACE.m;
  }

  /* ---------- supporting instruction (clearly smaller than the hook) ---------- */
  if (insLines.length) {
    s.text({ x: P, top: insTop, lines: insLines, font: insFont, lh: insLh, fill: theme.fgMuted, name: "Supporting instruction" });
  }

  ctaWithCe(s, theme, { ...cardOpts, y: cardY });
  qrFrame(s, theme, { qr, edge: railEdge, labels: "none", x: W - P - railEdge, y: railTop });
  if (railPill) {
    s.rect({ x: railPill.x, y: railPill.y, w: railPill.w, h: railPill.h, rx: railPill.h / 2, fill: theme.signal, name: "Register button" });
    buttonLabel(s, { cx: railPill.x + railPill.w / 2, top: railPill.y, lh: railPill.h, label: cfg.event?.cta || "Register now", font: withSize(FONT.cta, size), size, color: theme.onSignal });
  }
  ceStamp(s, theme, { cx: sealCx, cy: sealCy, r: sealR, credits: cfg.event?.ce, minSize: sealMin });
}

export async function oneMoreDay(ctx) {
  if (ctx.qr) return qrSignal(ctx, false);
  const { s, cfg, F, T, theme, panelists, format } = ctx;
  const origin = await ctx.background();
  const P = F.pad, W = F.w, H = F.h;
  const tall = format === "portrait";

  const lg = logo(s, theme, { x: P, y: P - 6, h: 84 });
  const pl = pill(s, theme, { x: W - P, y: P + 14, text: "Live panel", size: T.caption, align: "right", dot: true });

  /* the foot is fixed first: CTA card, claim above it */
  const size = T.caption + 2;
  const card = ctaWithCe(s, theme, { x: P, y: 0, w: W - 2 * P, cfg, T, size, tall, qr: ctx.qr, dryRun: true });
  const cardY = H - P - card.h;
  /* the numeral keeps a guaranteed minimum band; the headline gets the rest */
  const bandTop = lg.y + lg.h + (tall ? SPACE.xxl : SPACE.xl);
  const bandGap = tall ? SPACE.xxl : SPACE.xl;
  const minCap = H * (tall ? 0.28 : 0.24); // yield vertical to the substantive hook/why
  const claimOpts = {
    cfg, P, W, H, T, cardY, sign: false,
    maxH: cardY - SPACE.xl - kickerBlock(T) - bandGap - minCap - bandTop,
  };
  const claim = claimAboveCard(s, theme, { ...claimOpts, dryRun: true });
  const { kY, claimSize } = claim;

  /* the one loud element: the numeral, as big as the band allows — capped in
     width so the label column never starves ("10" stays legible) */
  const num = String(cfg.countdown?.number || "1");
  const label = cfg.countdown?.label || "More day to go";
  const bandH = kY - bandGap - bandTop;
  const nf0 = { ...FONT.claim, tracking: -0.04 };
  const perNum = measure(num, withSize(nf0, 100)) / 100;
  const numMax = Math.floor(Math.min(bandH / METRICS.display.cap, ((W - 2 * P) * 0.58) / perNum));

  /* label hung off the cap line, right of the figure — sized (once, against
     the full-size numeral) for a balanced two-line stack, set on ONE line
     when the column has room so the faces get the height */
  const lf0 = { ...FONT.claim, tracking: -0.025 };
  const per = Math.max(...twoLines(label).map((l) => measure(l, withSize(lf0, 100)))) / 100;
  const colW0 = W - P - (P + measure(num, withSize(nf0, numMax)) + SPACE.l);
  /* the label belongs to the lockup, so it never reads smaller than the claim */
  const lSize = Math.max(T.card, Math.round(Math.min(colW0 / per, Math.max(METRICS.display.cap * numMax * 0.2, claimSize * 1.15))));
  const lf = withSize(lf0, lSize);
  const lLh = Math.round(lSize * 1.02);

  /* the panel is the second read: faces as large as the column allows between
     the label and the point's halo on the route, standing on the route. Below
     the target size the numeral gives up width (down to 85%) to widen the
     column. */
  const people = panelists.slice(0, 4);
  const n = people.length;
  const gap = SPACE.m;
  const dMin = tall ? 180 : 150;
  const lock = (numSize) => {
    const numFont = withSize(nf0, numSize);
    const capH = METRICS.display.cap * numSize;
    const capTop = bandTop + (bandH - capH) / 2;
    const baseY = capTop + capH;
    const numW = measure(num, numFont);
    const colX = P + numW + SPACE.l;
    const colW = W - P - colX;
    const lines = measure(label, lf) <= colW ? [label] : twoLines(label);
    const labelBot = capTop + (lines.length - 1) * lLh + (METRICS.display.cap + 0.24) * lSize;
    const routeY = baseY - 10;
    const zoneTop = labelBot + SPACE.m;
    const zoneBot = routeY - 8 * 2.2 - SPACE.s;
    let d = tall ? 260 : 220;
    while (n && d > 100 && (panelRowH(T, n, d, false) > zoneBot - zoneTop || colX + panelRowW(T, people, d, gap, false) > W - P)) d -= 2;
    return { numFont, capH, capTop, baseY, numW, colX, lines, labelBot, routeY, zoneBot, d };
  };
  let L = lock(numMax);
  for (let t = numMax; n && L.d < dMin && t - 4 >= numMax * 0.85; ) L = lock((t -= 4));
  const { numFont, capH, capTop, baseY, numW, colX, lines, labelBot, routeY, zoneBot, d } = L;
  const numX = P;
  const labelTop = capTop;
  const labelRight = colX + Math.max(...lines.map((l) => measure(l, lf)));
  const rowTop = zoneBot - panelRowH(T, n, d, false);
  const rowRight = n ? colX + panelRowW(T, people, d, gap, false) : colX;
  const petalH = 64, petalW = petalH * PETAL_ASPECT;

  /* CE stamp (true radius from stampRadius): the free ground nearest the CTA
     card's right end — a sticker on the ticket, clear of the pair, the claim,
     the lockup and the faces */
  const R = cfg.event?.ce ? stampRadius({ r: tall ? CE.stampBaseR.portrait : CE.stampBaseR.square, credits: cfg.event.ce }) : 0;
  const spot = R && findStampSpot({
    R, W, bottom: H,
    prefer: { x: W - P - R * 0.6, y: cardY },
    boxes: [
      ...chromeBoxes(lg, pl),
      { x: numX, y: capTop, w: numW, h: capH, name: "numeral" },
      { x: colX, y: labelTop, w: labelRight - colX, h: labelBot - labelTop, name: "label" },
      { x: colX + 10 - 18, y: routeY - 18, w: 36, h: 36, name: "signal point" },
      { x: W - P - petalW, y: routeY - petalH, w: petalW, h: petalH + 8, name: "petal" },
      ...(n ? [{ x: colX, y: rowTop, w: rowRight - colX, h: zoneBot - rowTop, name: "panel" }] : []),
      ...claim.boxes,
      card.pair && { ...card.pair, y: cardY + (card.pair.y - card.y) },
      ...(card.qrKeep ? [{ ...card.qrKeep, y: cardY + (card.qrKeep.y - card.y) }] : []),
    ].filter(Boolean),
  });

  /* Noise → Signal: one arc of the field lit, passing behind the figure and
     landing on a single point at its foot; the route runs on to the petal.
     Closed counters would show the arc as a slash: hide it from the edge to
     the figure's far side so it only emerges from behind the numeral. */
  const hole = /[04689]/.test(num) ? { x: 0, y: 0, w: numX + numW, h: baseY + 8 } : null;
  signalArc(s, theme, origin, { px: colX + 10, py: routeY, run: W - P, sign: petalH, hole });
  capText(s, { x: numX, capTop, text: num, font: numFont, fill: theme.fg, name: "Countdown numeral" });
  s.text({ x: colX, top: topForCap(lf, capTop), lines, font: lf, lh: lLh, fill: theme.fg, name: "Countdown label" });
  if (n) panelRow(s, theme, T, people, { x: colX, top: rowTop, d, gap, beside: false });
  claimAboveCard(s, theme, claimOpts);
  ctaWithCe(s, theme, { x: P, y: cardY, w: W - 2 * P, cfg, T, size, tall, qr: ctx.qr });
  /* the footer row's own seal slot first (deterministic); free search fallback */
  if (card.seal) ceStamp(s, theme, { cx: card.seal.cx, cy: cardY + card.seal.cy, r: card.seal.r, credits: cfg.event?.ce, minSize: card.seal.minSize });
  else if (spot) ceStamp(s, theme, { cx: spot.cx, cy: spot.cy, r: R, credits: cfg.event?.ce });
}

/* ---------------- happening_today ---------------- */

export async function happeningToday(ctx) {
  if (ctx.qr) return qrSignal(ctx, true);
  const { s, cfg, F, T, theme, panelists, format } = ctx;
  const origin = await ctx.background();
  const P = F.pad, W = F.w, H = F.h;
  const tall = format === "portrait";

  const lg = logo(s, theme, { x: P, y: P - 6, h: 84 });
  const pl = pill(s, theme, { x: W - P, y: P + 14, text: cfg.urgency || "Live today", size: T.caption, align: "right", dot: true, variant: "glass" });

  const size = T.caption + 2;
  const card = ctaWithCe(s, theme, { x: P, y: 0, w: W - 2 * P, cfg, T, size, tall, qr: ctx.qr, dryRun: true });
  const cardY = H - P - card.h;
  const people = panelists.slice(0, 6);
  const n = people.length;
  const gap = n >= 5 ? SPACE.m : SPACE.l;
  /* the headline and the time's reserve are budgeted against a compact faces
     row, so type sizes don't depend on how large the faces end up */
  let dB = n >= 5 ? (tall ? 104 : 80) : (tall ? 132 : 88);
  while (n > 1 && dB > 64 && panelRowW(T, people, dB, gap) > W - 2 * P) dB -= 4;
  const rowBand = n ? panelRowH(T, n, dB) + SPACE.xl * 2 : SPACE.xl;

  /* time lockup: "8:00" huge, "PM EST" stacked beside it. Its width-driven
     size is reserved (it may give up 20%) before the headline is fitted. */
  const [clock, ...rest] = String(cfg.event?.time || "8:00 PM EST").split(/\s+/);
  const capTop = lg.y + lg.h + (tall ? SPACE.xxl : SPACE.xl);
  const tf0 = { ...FONT.claim, tracking: -0.045 };
  const sideW = 120; // tighter for compact time unit
  const tWide = (W - 2 * P - sideW) / (measure(clock, withSize(tf0, 100)) / 100) * 0.72; // time yields more to the hook/why
  const claimOpts = {
    cfg, P, W, H, T, cardY,
    maxH: cardY - SPACE.xl - kickerBlock(T) - rowBand - METRICS.display.cap * tWide * 0.7 - capTop,
  };
  const claim = claimAboveCard(s, theme, { ...claimOpts, dryRun: true });
  const { kY } = claim;
  const zone = rest.length ? rest : ["Today"];
  const tMax = Math.floor(Math.min(tWide, (kY - capTop - rowBand) / METRICS.display.cap));
  const sf = withSize({ ...FONT.claim, tracking: -0.02 }, Math.max(T.card + 6, Math.round(tMax * 0.32)));
  const zLh = Math.round(sf.size * 1.02);
  const zoneW = Math.max(...zone.map((z) => measure(z, sf)));

  /* The faces are the second read: they get their own full-width band between
     the time and the claim, as large as it allows. When that falls short of
     the target, the time gives up size (down to 85%) to hand the band room. */
  const dCap = n >= 5 ? (tall ? 150 : 120) : (tall ? 200 : 170);
  const dMin = n >= 5 ? dCap : (tall ? 180 : 150);
  const geo = (tSize) => {
    const tf = withSize(tf0, tSize);
    const tX = P - tSize * 0.02;
    const tW = measure(clock, tf);
    const baseY = capTop + METRICS.display.cap * tSize;
    const colX = tX + tW + SPACE.m;
    const zCap = baseY - METRICS.display.cap * sf.size * 0.6 - (zone.length - 1) * zLh; // attach zone tighter to time figure
    const bandTop = baseY + SPACE.m, bandBot = kY - SPACE.l;
    let d = dCap;
    while (n && d > 64 && (panelRowH(T, n, d) > bandBot - bandTop || panelRowW(T, people, d, gap) > W - 2 * P)) d -= 2;
    const rowTop = bandTop + Math.max(0, (bandBot - bandTop - panelRowH(T, n, d)) / 2);
    return { tf, tX, tW, baseY, colX, zCap, d, rowTop };
  };
  let g = geo(tMax);
  for (let t = tMax; n && g.d < dMin && t - 2 >= tMax * 0.85; ) g = geo((t -= 2));
  const { tf, tX, tW, baseY, colX, zCap, d, rowTop } = g;
  const rowH = panelRowH(T, n, d);
  const rowW = panelRowFullW(T, people, d, gap);

  /* CE stamp (true radius from stampRadius): the free ground nearest the CTA
     card's right end — a sticker on the ticket, clear of the pair, the claim,
     the lockup and the faces */
  const R = cfg.event?.ce ? stampRadius({ r: tall ? CE.stampBaseR.portrait : CE.stampBaseR.square, credits: cfg.event.ce }) : 0;
  const spot = R && findStampSpot({
    R, W, bottom: H,
    prefer: { x: W - P - R * 0.6, y: cardY },
    boxes: [
      ...chromeBoxes(lg, pl),
      { x: tX, y: capTop, w: tW, h: baseY - capTop, name: "time" },
      { x: colX, y: zCap, w: zoneW, h: baseY - zCap, name: "zone" },
      { x: colX + 10 - 18, y: capTop + 10 - 18, w: 36, h: 36, name: "signal point" },
      ...(n ? [{ x: P, y: rowTop, w: rowW, h: rowH, name: "panel" }] : []),
      ...claim.boxes,
      { ...card.pair, y: cardY + (card.pair.y - card.y) },
      ...(card.qrKeep ? [{ ...card.qrKeep, y: cardY + (card.qrKeep.y - card.y) }] : []),
    ],
  });

  /* Noise → Signal: the lit arc drops in from the top edge, skims past the
     figure and lands on the cap line; the route runs on to the margin and the
     zone ("PM EST") hangs beneath it, bottom-aligned to the figure */
  signalArc(s, theme, origin, { px: colX + 10, py: capTop + 10, run: W - P });
  capText(s, { x: tX, capTop, text: clock, font: tf, fill: theme.fg, name: "Live time" });
  s.text({ x: colX, top: topForCap(sf, zCap), lines: zone, font: sf, lh: zLh, fill: theme.fg, name: "Time zone" });

  /* faces row: its own band, centred between the lockup and the claim */
  panelRow(s, theme, T, people, { x: P, top: rowTop, d, gap });
  claimAboveCard(s, theme, claimOpts);
  ctaWithCe(s, theme, { x: P, y: cardY, w: W - 2 * P, cfg, T, size, tall, qr: ctx.qr });
  /* the footer row's own seal slot first (deterministic); free search fallback */
  if (card.seal) ceStamp(s, theme, { cx: card.seal.cx, cy: cardY + card.seal.cy, r: card.seal.r, credits: cfg.event?.ce, minSize: card.seal.minSize });
  else if (spot) ceStamp(s, theme, { cx: spot.cx, cy: spot.cy, r: R, credits: cfg.event?.ce });
}
