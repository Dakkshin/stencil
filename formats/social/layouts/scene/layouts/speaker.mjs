/**
 * Lane B — single-speaker layouts.
 *
 *   speakerPromo   the editorial speaker card (ElevenLabs Summit / ApolloNext
 *                  refs): the NAME is the loud element, two lines top-left;
 *                  role · company muted beneath; the topic
 *                  (kicker + claim/accent) sits quietly above a slim CTA strip.
 *                  A large B&W cutout bleeds off the bottom-right; its lower-left
 *                  edge is tucked behind one arc of the field. Date + time in the
 *                  footer.
 *   introPanelist  "Meet the panel" spotlight (intro_panel_one/two): the
 *                  claim/accent HEADLINE leads full-width; the person supports
 *                  from an arched window that bleeds off the foot, with a
 *                  speech-bubble name tag and the frosted CTA card beside it.
 */
import { createRequire } from "node:module";
import { FONT, LH, SPACE, CE } from "../tokens.mjs";
import { measure, wrap, withSize } from "../text.mjs";
import { logo, pill, kicker, titleBlock, ceBadge, ceStamp, stampRadius, portrait, nameTag, monogram, initials, buttonLabel, buttonContentW, registerUnit } from "../components.mjs";
import { qrFrame } from "../qr.mjs";
import { petal } from "../atmosphere.mjs";
import { fitFace, faceOf } from "../photo.mjs";

const sharp = () => createRequire(import.meta.url)("sharp");

/* ---------------- lane-private helpers ---------------- */

/* Where a cutout's silhouette touches the image edges. Cutouts are usually
   cropped at the shoulders, so the left/right columns turn opaque partway
   down and the bottom row is solid — those hard edges must bleed off-canvas
   or be tucked. Returns image-px rows (null = edge never opaque). */
const _edges = new Map();
async function silhouetteEdges(photo) {
  if (_edges.has(photo.href)) return _edges.get(photo.href);
  const buf = Buffer.from(photo.href.split(",")[1], "base64");
  const { data, info } = await sharp()(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const a = (x, y) => data[(y * w + x) * ch + ch - 1];
  const firstOpaque = (x) => {
    for (let y = 0; y < h; y++) if (a(x, y) > 96) return y;
    return null;
  };
  let bottom = 0;
  for (let x = 0; x < w; x++) if (a(x, h - 1) > 96) bottom++;
  const scale = photo.w / w;
  const f = (v) => (v == null ? null : v * scale);
  /* outline per row (image px): first/last pixel with any real alpha, so soft hair counts */
  const rowLeft = new Float32Array(h).fill(Infinity);
  const rowRight = new Float32Array(h).fill(-Infinity);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (a(x, y) > 32) { rowLeft[y] = x * scale; break; }
    for (let x = w - 1; x >= 0; x--) if (a(x, y) > 32) { rowRight[y] = x * scale; break; }
  }
  const out = { left: f(firstOpaque(1)), right: f(firstOpaque(w - 2)), bottom: bottom / w > 0.05, rowLeft, rowRight, rowScale: scale };
  _edges.set(photo.href, out);
  return out;
}

/* Arc radii exactly as atmosphere.arcs() draws them (default origin). */
function arcRadii(W, H, origin) {
  const far = Math.hypot(W - origin.cx, 0 - origin.cy);
  const out = [];
  for (let r = 0.28 * Math.min(W, H); r <= far; r *= 1.075) out.push(r);
  return out;
}

/* Rect minus a disk (opposite windings → hole under nonzero fill rule). */
function rectMinusDisk(r, c, R) {
  const f = (v) => Number(v.toFixed(2));
  return [
    `M${f(r.x)} ${f(r.y)}H${f(r.x + r.w)}V${f(r.y + r.h)}H${f(r.x)}Z`,
    `M${f(c.cx + R)} ${f(c.cy)}A${f(R)} ${f(R)} 0 1 0 ${f(c.cx - R)} ${f(c.cy)}A${f(R)} ${f(R)} 0 1 0 ${f(c.cx + R)} ${f(c.cy)}Z`,
  ].join("");
}

/* "Naren Arulrajah" → ["Naren", "Arulrajah"]; honorific stays with the first
   name; anything longer than two words keeps the tail together. */
function nameLines(name) {
  const words = String(name || "").replace(/,.*$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  const lead = /^(dr|mr|ms|mrs)\.?$/i.test(words[0]) ? 2 : 1;
  if (words.length <= lead) return [words.join(" ")];
  return [words.slice(0, lead).join(" "), words.slice(lead).join(" ")];
}

function roleLine(p) {
  return [p.credentials, p.role, p.company].filter(Boolean).join(" · ");
}

/**
 * titleBlock, but each fragment is wrapped to its narrowest width that keeps
 * its line count — no one-word orphan under a long accent line. `maxW` may be
 * an array (one cap per fragment). Same return shape as titleBlock.
 */
function balancedTitle(s, theme, { x, top, maxW, title, size, dryRun = false }) {
  let y = top;
  const lines = [];
  for (const [i, frag] of (title || []).entries()) {
    const one = [frag];
    const cap = Array.isArray(maxW) ? maxW[i] : maxW;
    const n = titleBlock(s, theme, { x, top: 0, maxW: cap, title: one, size, dryRun: true }).lines.length;
    let lo = cap * 0.4, hi = cap;
    while (hi - lo > 4) {
      const mid = (lo + hi) / 2;
      if (titleBlock(s, theme, { x, top: 0, maxW: mid, title: one, size, dryRun: true }).lines.length > n) lo = mid;
      else hi = mid;
    }
    const tb = titleBlock(s, theme, { x, top: y, maxW: n > 1 ? hi + 2 : cap, title: one, size, dryRun });
    lines.push(...tb.lines);
    y += tb.h;
  }
  return { h: y - top, lines, width: Math.max(0, ...lines.map((l) => l.w)) };
}

/** Date over time, small caps, right-aligned in a corner. */
function cornerDate(s, theme, { x, y, date, time, size }) {
  const font = withSize(FONT.label, size);
  const lh = Math.round(size * 1.5);
  const lines = [date, time].filter(Boolean);
  s.text({ x, top: y, lines, font, lh, fill: theme.fgMuted, anchor: "end", name: "Corner date" });
  return { h: lines.length * lh, w: Math.max(0, ...lines.map((l) => measure(l, font))) };
}

/** Slim CTA: frosted strip holding the SIGNAL button + the event name. */
function ctaStrip(s, theme, { x, y, cta, label, size, maxW, h: fixedH, dryRun = false }) {
  const btnH = Math.round(size * 2.5);
  const pad = fixedH ? Math.round((fixedH - btnH) / 2) : Math.round(size * 0.5);
  const ctaFont = withSize(FONT.cta, size);
  const btnW = Math.round(buttonContentW(cta, ctaFont, size) + size * 2.4);
  const lf = withSize(FONT.meta, size - 2);
  const labelW = label ? measure(label, lf) : 0;
  const fits = label && pad + btnW + size * 1.1 + labelW + size * 1.3 <= maxW;
  const w = fits ? Math.round(pad + btnW + size * 1.1 + labelW + size * 1.3) : btnW + pad * 2;
  const h = fixedH || btnH + pad * 2;
  if (dryRun) return { x, y, w, h };
  s.group("CTA strip", () => {
    s.rect({ x, y, w, h, rx: h / 2, fill: theme.glass, stroke: theme.glassLine, name: "CTA strip" });
    s.rect({ x: x + pad, y: y + pad, w: btnW, h: btnH, rx: btnH / 2, fill: theme.signal, name: "Register button" });
    buttonLabel(s, { cx: x + pad + btnW / 2, top: y + pad, lh: btnH, label: cta, font: ctaFont, size, color: theme.onSignal });
    if (fits) s.text({ x: x + pad + btnW + size * 1.1, top: y, lines: [label], font: lf, lh: h, fill: theme.fgMuted, name: "CTA label" });
  });
  return { x, y, w, h };
}

/* The CE badge that rides with every CTA: plate height and credit size per format. */
function ceOpts(ctx) {
  const tall = ctx.format === "portrait";
  return { h: tall ? CE.badgeH.portrait : CE.badgeH.square };
}

/* The CE stamp's spot: straddling the CTA band's top edge at the right, over
   the dominant visual's lower-right corner — clear of faces, text, logo and
   the CTA pair, and wholly on the sheet.

   That last clause is the fix. This used to return the caller's minimum radius
    (now from CE.stampBaseR) and a centre derived from it, while ceStamp()
   draws at stampRadius(), which grows the seal until its label fits on one
   line: 132.6 at "1 CE credit" and 147.7 at two. The seal was therefore drawn
   5.6 px past the right edge on every square speaker card, and 20.7 px past it
   at two credits — a clipped accreditation mark, which is the one element on
   the post that has to look official.

   So the radius is asked of the same function that draws it, and the centre is
   clamped into the canvas with the seal's own size accounted for. */
function stampSpot(ctx, bandTop, boxes = []) {
  const { F, format } = ctx;
  const credits = ctx.cfg.event?.ce;
  const r = stampRadius({ r: format === "portrait" ? CE.stampBaseR.portrait : CE.stampBaseR.square, credits });
  const inset = SPACE.s, clear = 12;
  /* Preferred: straddling the band's top edge at the right, over the cutout's
     lower corner. Straddling the band and sitting over the body are both
     intended - only the FACE is a keep-out. */
  const prefer = { x: F.w - F.pad - r * 0.55, y: Math.min(bandTop + r * 0.1, F.h - r - 14) };
  /* The seal lives in the lower-right, over the cutout's body. That is a
     design decision, not a search result: it is where the eye lands last, and
     it is the only quadrant with no type in it. Searching the whole canvas
     found "free" space in the top-left and put the seal through the speaker's
     name, which is the one element lane B exists to make loud. So the region
     is fixed and the search only chooses within it - and if nothing fits, that
     is a failure to report rather than a spot to find somewhere else. */
  const lo = { x: Math.max(inset + r, F.w * 0.42), y: Math.max(inset + r, F.h * 0.42) };
  const hi = { x: F.w - inset - r, y: F.h - inset - r };
  const clamp = (p) => ({ cx: Math.max(lo.x, Math.min(p.x, hi.x)),
                          cy: Math.max(lo.y, Math.min(p.y, hi.y)) });
  const hits = ({ cx, cy }) => boxes.some((b) => {
    const nx = Math.max(b.x, Math.min(cx, b.x + b.w));
    const ny = Math.max(b.y, Math.min(cy, b.y + b.h));
    return Math.hypot(cx - nx, cy - ny) < r + clear;
  });
  const first = clamp(prefer);
  if (!hits(first)) return { ...first, r };
  /* Clamping the seal onto the sheet can push it into the face or onto the
     CTA pair, so when it collides, take the nearest centre that is on the
     sheet and clear of both - the same nearest-free-point search lanes A and C
     already do. The pair matters as much as the face: a seal covering half the
     PACE plate obscures the provider mark with the credit mark, and chapter 9
     is explicit that neither substitutes for the other. */
  let best = null;
  for (let cy = lo.y; cy <= hi.y; cy += 6) {
    for (let cx = lo.x; cx <= hi.x; cx += 6) {
      if (hits({ cx, cy })) continue;
      const dd = Math.hypot(cx - prefer.x, cy - prefer.y);
      if (!best || dd < best.dd) best = { cx, cy, dd };
    }
  }
  return best ? { cx: best.cx, cy: best.cy, r } : null;
}

/**
 * The CTA band shared by both lane-B post types: a full-width footer the
 * photo runs behind, holding the slim Register strip then the PACE mark (same
 * box height, same row), and optionally date + time right-aligned (left of
 * the CE stamp, which straddles the band's top edge at the right).
 *
 * With `qrCorner`, the speaker card instead gets a right registration rail:
 * an enlarged QR code in the top corner with the Register strip below it,
 * while the footer keeps only date + time and the PACE plate. Returns
 * { top, h, pair, qrKeep }; `dryRun` measures only.
 */
function ctaBand(s, theme, ctx, { withDate = false, dryRun = false, qrCorner = false } = {}) {
  const { F, T, cfg, qr } = ctx;
  const ev = cfg.event || {};
  const P = F.pad, W = F.w, H = F.h;
  const ce = ceOpts(ctx);
  const badge = ceBadge(s, theme, { ...ce, x: 0, y: 0, dryRun: true });
  const stripOpts = { x: P, cta: ev.cta || "Register now", label: null, size: T.caption + 2, h: ce.h, maxW: 0 };
  if (qr && qrCorner) {
    /* right registration rail: enlarged code top-corner, scan caption below
       it. The bottom row floats free — Register pill beside a glass container
       holding date/time beside the PACE plate — with no full-width band, so
       the portrait attaches to the sheet's bottom edge and scales up. */
    const edge = 192;
    const railBox = qrFrame(s, theme, { qr, edge, labels: "below", dryRun: true });
    const railX = W - P - railBox.w;
    const railTop = P - 6;
    const railBottom = railTop + railBox.h;
    const qrKeep = { x: railX, y: railTop, w: railBox.w, h: railBox.h };
    const size = T.caption + 2;
    const ctaFont = withSize(FONT.cta, size);
    const unit = registerUnit(s, theme, {
      x: P, y: 0, dir: "row", cta: ev.cta || "Register now", ctaFont, size,
      date: withDate ? ev.date : null, time: withDate ? ev.time : null,
      dateSize: T.caption, paceH: 52, dryRun: true,
    });
    const h = unit.h;
    const top = H - SPACE.m - h;
    const row = registerUnit(s, theme, {
      x: P, y: top, dir: "row", cta: ev.cta || "Register now", ctaFont, size,
      date: withDate ? ev.date : null, time: withDate ? ev.time : null,
      dateSize: T.caption, paceH: 52, dryRun: true,
    });
    if (dryRun) return { top, h, pair: row.reg, box: row.box, info: row.info, qrKeep };
    registerUnit(s, theme, {
      x: P, y: top, dir: "row", cta: ev.cta || "Register now", ctaFont, size,
      date: withDate ? ev.date : null, time: withDate ? ev.time : null,
      dateSize: T.caption, paceH: 52,
    });
    qrFrame(s, theme, { qr, edge, labels: "below", x: railX, y: railTop });
    return { top, h, pair: row.reg, box: row.box, info: row.info, qrKeep };
  }
  const strip = ctaStrip(s, theme, { ...stripOpts, y: 0, dryRun: true });
  const qrBox = qrFrame(s, theme, { qr, dryRun: true });
  // The QR uses the free gap between the action pair and the lower-right seal.
  // Let its frame rise above the band, as the seal already does, instead of
  // stealing height from the speaker's name, topic and face.
  const rowH = Math.max(strip.h, badge.h);
  const dateH = qr && withDate ? [ev.date, ev.time].filter(Boolean).length * Math.round(T.caption * 1.5) + SPACE.s : 0;
  const h = rowH + SPACE.m * 2 + dateH;
  const top = H - h;
  /* The seal must clear this pair, so the band reports where it ends. */
  const actionH = Math.max(strip.h, badge.h);
  const pair = { x: P, y: top + SPACE.m + dateH + (rowH - actionH) / 2, w: strip.w + SPACE.s + badge.w, h: actionH };
  // Bottom-align the QR frame to the band for a clean grid with the action row.
  // The tall frame will rise above the short CTA/PACE row (as the seal does), but its
  // top stays within the band or just above so it doesn't invade the speaker/topic area.
  const qrBottom = H - SPACE.s;
  const qrY = Math.max(top, qrBottom - qrBox.h);
  const qrKeep = qr ? { x: pair.x + pair.w + SPACE.m, y: qrY, w: qrBox.w, h: qrBox.h } : null;
  if (dryRun) return { top, h, pair, qrKeep };
  s.group("CTA band", () => {
    s.rect({ x: 0, y: top, w: W, h: h + 2, fill: theme.tileFill, name: "CTA band" });
    s.rect({ x: 0, y: top, w: W, h: 1, fill: theme.line, name: "CTA band rule" });
    const ry = top + SPACE.m + dateH;
    /* series order: Register, then the PACE mark 16px to its right, both centred on the row */
    ctaStrip(s, theme, { ...stripOpts, y: ry + (rowH - strip.h) / 2 });
    /* The plate is always drawn: series order is Register, then PACE, 16px apart. */
    ceBadge(s, theme, { ...ce, x: P + strip.w + SPACE.s, y: ry + (rowH - badge.h) / 2 });
    if (qrKeep) qrFrame(s, theme, { qr, x: qrKeep.x, y: qrKeep.y });
    if (qr && withDate) {
      const lh = Math.round(T.caption * 1.5);
      s.text({ x: P, top: top + SPACE.m, lines: [ev.date, ev.time].filter(Boolean), font: withSize(FONT.meta, T.caption), lh, fill: theme.fgMuted, name: "CTA date" });
    } else if (withDate) {
      const lh = Math.round(T.caption * 1.5);
      const n = [ev.date, ev.time].filter(Boolean).length;
      const st = stampSpot(ctx, top, [pair]);
      cornerDate(s, theme, { x: st.cx - st.r - SPACE.m, y: ry + (rowH - n * lh) / 2, date: ev.date, time: ev.time, size: T.caption });
    }
  });
  return { top, h, pair, qrKeep };
}

/* ---------------- speaker_promo ---------------- */

export async function speakerPromo(ctx) {
  const { s, cfg, F, T, theme, panelists, format } = ctx;
  const origin = await ctx.background();
  const P = F.pad, W = F.w, H = F.h;
  const tall = format === "portrait";
  const person = panelists[0] || { name: cfg.person || "" };
  const ev = cfg.event || {};
  const GAP = SPACE.xl;
  const BLEED = 24;
  const textBoxes = (rows) => rows.map(([y0, y1, x1]) => ({ x: P, y: y0, w: x1 - P, h: y1 - y0 }));

  /* ---------- 1. text on a fixed series grid (measured now, drawn last) ----------
     Every speaker card in a campaign puts the name, the kicker and the CTA on
     the same lines; the photo is what adapts. */
  const logoBox = { x: P, y: P - 6, h: tall ? 92 : 84 };
  const nl = nameLines(person.name);
  const nameTop = logoBox.y + logoBox.h + (tall ? SPACE.xxl + SPACE.l : SPACE.xxl);
  let size = T.displayMax;
  const nameMax = W * 0.66 - P;
  while (size > T.card + 12 && Math.max(...nl.map((l) => measure(l, withSize(FONT.claim, size)))) > nameMax) size -= 2;
  const nameFont = withSize(FONT.claim, size);
  const nameLh = Math.round(size * 1.0);
  const nameW = Math.max(0, ...nl.map((l) => measure(l, nameFont)));

  const colW = Math.round(W * (tall ? 0.52 : 0.50)) - P;
  const rf = withSize(FONT.body, T.body);
  const rlh = Math.round(T.body * LH.body);
  const role = roleLine(person);
  /* too long for one line → break at the "·", not mid-phrase */
  const rl = !role ? [] : measure(role, rf) <= colW ? [role]
    : [roleLine({ ...person, company: "" }), person.company].filter(Boolean).flatMap((t) => wrap(t, colW, rf));
  const roleTop = nameTop + nl.length * nameLh + SPACE.m;
  const roleW = Math.max(0, ...rl.map((l) => measure(l, rf)));
  const whoBottom = roleTop + rl.length * rlh;

  const claimSize = tall ? T.card + 4 : T.card;
  const kh = Math.round(T.caption * LH.label);
  const petalH = Math.round(claimSize * 1.05);
  const topicTop = Math.max(Math.round(H * (tall ? 0.42 : 0.48)), whoBottom + SPACE.l);
  const kText = cfg.category || cfg.eyebrow || "";
  const kFont = withSize(FONT.label, T.caption);
  /* a long kicker stacks at its " · " so the large cutout can come in beside
     it — decided by the text alone, so every card in a campaign agrees */
  const kSplit = kText.includes(" · ") && measure(kText, kFont) > W * 0.45
    ? [kText.slice(0, kText.indexOf(" · ")), kText.slice(kText.indexOf(" · ") + 3)] : null;

  /* Bottom row floats free (Register pill beside the date/PACE container);
     the QR lives in the top-corner rail. With no band the portrait attaches
     to the sheet's bottom edge, so text needs less clearance below it. */
  const band = ctaBand(s, theme, ctx, { withDate: true, qrCorner: true, dryRun: true });
  const bandTop = band.top;
  const footClear = band.box ? SPACE.m : SPACE.xl;
  /* the rail is a full keep-out band: the head must sit below it, never under it */
  const railRow = band.qrKeep ? [band.qrKeep.y - SPACE.s, band.qrKeep.y + band.qrKeep.h + SPACE.s, W - P] : null;

  /* The topic block: full-width claim first; it may narrow to wrap ONE more line so the (large) cutout can
     come further left. Each option carries the rows the person must stay
     clear of: [y0, y1, rightmost text x]. */
  const topic = (topicW, kLines) => {
    const titleTop = topicTop + kLines.length * kh + SPACE.m;
    const tb = balancedTitle(s, theme, { x: P, top: titleTop, maxW: topicW, title: cfg.title, size: claimSize, dryRun: true });
    /* each claim line is its own keep-out row, so shoulders may come in under a short line */
    const lineRows = tb.lines.map((l, i) => [l.top, l.top + l.lh, P + l.w + (i === tb.lines.length - 1 ? 18 + petalH * 0.4 : 0)]);
    return {
      topicW, kLines, titleTop, n: tb.lines.length, bottom: titleTop + tb.h,
      key: kLines.length + ":" + lineRows.map((r) => Math.round(r[2])).join(","),
      keepOut: [
        [nameTop, nameTop + nl.length * nameLh, P + nameW],
        [roleTop, whoBottom, P + roleW],
        [topicTop, topicTop + kLines.length * kh, P + Math.max(...kLines.map((l) => measure(l, kFont)))],
        ...lineRows,
      ],
    };
  };
  const topic0 = topic(colW - (tall ? 20 : 40), [kText]);
  const topics = [];
  const nFrag = (cfg.title || []).length;
  for (const kl of kSplit ? [kSplit] : [[kText]]) {
    const t0 = topic(topic0.topicW, kl);
    if (t0.bottom > bandTop - footClear) continue;
    topics.push(t0);
    /* narrow one fragment (lowest first — nearest the shoulders) by one line */
    for (let i = nFrag - 1; i >= 0; i--) {
      for (let w = t0.topicW - 20; w >= colW * 0.5; w -= 20) {
        const caps = Array.from({ length: nFrag }, (_, j) => (j === i ? w : t0.topicW));
        const t = topic(caps, kl);
        if (t.n > t0.n + 1 || t.bottom > bandTop - footClear) break;
        if (!topics.some((o) => o.key === t.key)) topics.push(t);
      }
    }
  }
  if (!topics.length) topics.push(topic0);
  let chosen = topic0;

  /* ---------- 2. the person ---------- */
  let head = null;
  let silLeft = () => W;
  if (person.photo) {
    const ph = person.photo;
    const f = faceOf(ph);
    const e = await silhouetteEdges(ph);
    const fcx = f.x + f.w / 2;
    const imgBottom = e.bottom ? ph.h : ph.bbox.bottom;

    const place = (faceH, cx0, faceTopPref, keepOut) => {
      const k = faceH / f.h;
      const below = (imgBottom - f.y) * k;
      /* with a floating row the portrait's bottom bleeds off the sheet; behind
         a band it hides behind it, and a natural base stands on it */
      const foot = band.box ? H + 8 : bandTop;
      const faceTop = e.bottom
        ? Math.max(faceTopPref, foot + (band.box ? 0 : SPACE.s) - below)
        : Math.min(faceTopPref, foot - below);
      /* a hard right crop edge that shows above the band runs off the canvas */
      const rightShows = e.right != null && faceTop + (e.right - f.y) * k < bandTop;
      const cx = Math.max(cx0, rightShows ? W + BLEED - (ph.w - fcx) * k : 0);
      const fit = fitFace(ph, { faceH, cx, faceTop });
      const rowAt0 = (yy) => Math.floor((yy - fit.y) / k / e.rowScale);
      const rawLeft = (y0, y1) => {
        let m = Infinity;
        for (let yy = Math.max(0, Math.floor(y0)); yy <= Math.min(H, Math.ceil(y1)); yy += 2) {
          const row = rowAt0(yy);
          if (row >= 0 && row < e.rowLeft.length) m = Math.min(m, fit.x + e.rowLeft[row] * k);
        }
        return m;
      };
      /* a hard left crop edge is tucked behind one arc of the field */
      const needs = [];
      if (e.left != null && fit.x > 0) needs.push(Math.hypot(fit.x + 3 - origin.cx, fit.y + e.left * k - 12 - origin.cy));
      const tuck = needs.length ? arcRadii(W, H, origin).find((r) => r >= Math.max(...needs)) || null : null;
      /* the arc may trim a shoulder, never the head */
      const headBottomY = fit.y + (f.y + f.h * 1.15) * k;
      const headSafe = !tuck || (() => {
        for (let yy = Math.max(0, fit.y + ph.bbox.top * k); yy <= Math.min(H, headBottomY); yy += 4) {
          const dy = yy - origin.cy;
          if (Math.abs(dy) < tuck && origin.cx + Math.sqrt(tuck * tuck - dy * dy) > rawLeft(yy, yy)) return false;
        }
        return true;
      })();
      const rowAt = (yy) => Math.floor((yy - fit.y) / k / e.rowScale);
      const left = (y0, y1) => {
        let m = Infinity;
        for (let yy = Math.max(0, Math.floor(y0)); yy <= Math.min(H, Math.ceil(y1)); yy += 2) {
          const row = rowAt(yy);
          if (row < 0 || row >= e.rowLeft.length) continue;
          let x = fit.x + e.rowLeft[row] * k;
          if (tuck) {
            const dy = yy - origin.cy;
            if (Math.abs(dy) < tuck) x = Math.max(x, origin.cx + Math.sqrt(tuck * tuck - dy * dy));
          }
          m = Math.min(m, x);
        }
        return m;
      };
      /* head (hair included) must sit wholly on canvas and below the logo area */
      let headRight = -Infinity;
      const headRows = [ph.bbox.top, f.y + f.h].map((v) => Math.floor(v / e.rowScale));
      for (let r = headRows[0]; r <= headRows[1] && r < e.rowRight.length; r++) headRight = Math.max(headRight, fit.x + e.rowRight[r] * k);
      const headTop = fit.y + ph.bbox.top * k;
      const clear = keepOut.every(([y0, y1, x1]) => left(y0 - SPACE.s, y1 + SPACE.s) >= x1 + GAP);
      const logoClear = logoBox.y + logoBox.h + SPACE.s;
      /* the head (not the shoulders) must clear the floating row: the body
         may run behind the glass, but never the face behind the button */
      const faceBox = { x: cx - faceH * 0.5, y: faceTop, w: faceH, h: faceH * 1.2 };
      const rowClear = !band.box || [band.pair, band.box].every((b) => !b ||
        faceBox.x + faceBox.w + 8 < b.x || faceBox.x > b.x + b.w + 8 ||
        faceBox.y + faceBox.h + 8 < b.y || faceBox.y > b.y + b.h + 8);
      const fits = clear && headSafe && rowClear && headRight <= W - SPACE.m && headTop >= logoClear;
      // A QR occupies space the seal previously searched. Choose the photo
      // framing and seal together, rather than discovering the clash after drawing.
      const sealFits = fits && (!ctx.qr || stampSpot(ctx, bandTop, [
        { x: cx - faceH * 0.5, y: faceTop, w: faceH, h: faceH * 1.2 },
        band.pair, band.box, band.qrKeep, ...textBoxes(keepOut),
      ].filter(Boolean)));
      return { faceH, k, cx, faceTop, fit, tuck, left, keepOut, ok: Boolean(sealFits) };
    };
    /* Faces are a primary element: large and bottom-bleeding on the speaker
       card, never more than ~2x the source pixels (low-res photos stay
       crisp). Shrink only if no claim width / position clears the text. */
    const series = tall ? 340 : 320;
    const hiFace = Math.min(series, Math.floor((f.h * 2.05) / 10) * 10);
    const loFace = tall ? 200 : 180;
    const cxs = [0.74, 0.76, 0.72, 0.78, 0.7, 0.8, 0.82, 0.84].map((c) => W * c);
    const tops = (tall ? [0.4, 0.37, 0.43, 0.34, 0.31] : [0.38, 0.35, 0.41, 0.32]).map((t) => H * t);
    let pl = null;
    for (let fh = hiFace; fh >= loFace && !pl; fh -= 10)
      for (const t of topics) {
        const keepOut = railRow ? [...t.keepOut, railRow] : t.keepOut;
        for (const ft of tops) {
          pl = cxs.map((c) => place(fh, c, ft, keepOut)).find((p) => p.ok) || null;
          if (pl) break;
        }
        if (pl) { chosen = t; break; }
      }
    const railKeep = railRow ? [...topic0.keepOut, railRow] : topic0.keepOut;
    pl = pl || place(loFace, W * 0.8, tops[0], railKeep);
    /* last resort must also respect the rail: reframe below it rather than
       overlap the code. If even that fails, accept the frame (a post must
       render) — the seal search still reports a true collision loudly. */
    if (pl && !pl.ok && railRow) {
      const lower = place(loFace, W * 0.7, railRow[1] + SPACE.xl, railKeep);
      if (lower.ok) pl = lower;
    }
    const { faceH, cx, faceTop, fit, tuck } = pl;
    head = { cx, cy: faceTop + faceH * 0.46, r: faceH * 0.92, face: { x: cx - faceH * 0.5, y: faceTop, w: faceH, h: faceH * 1.2 } };
    /* a hard left crop edge is tucked behind one arc of the field */
    const clipRect = { x: fit.x - 2, y: -10, w: W + 20 - fit.x, h: H + 20 };
    const clip = tuck ? { d: rectMinusDisk(clipRect, origin, tuck) } : clipRect;
    s.image({ href: ph.href, x: fit.x, y: fit.y, w: fit.w, h: fit.h, clip, name: "Speaker cutout" });
    silLeft = pl.left;
  } else {
    /* monogram: a quiet disk right of the topic */
    const r = tall ? 190 : 160;
    head = { cx: W - P - r - 8, cy: tall ? H * 0.5 : H * 0.5, r: r + 18 };
    monogram(s, theme, { name: person.name, clip: { cx: head.cx, cy: head.cy, r }, size: r * 0.62 });
    const R = head.r;
    silLeft = (y0, y1) => {
      const dy = y0 <= head.cy && y1 >= head.cy ? 0 : Math.min(Math.abs(y0 - head.cy), Math.abs(y1 - head.cy));
      return dy >= R ? W : head.cx - Math.sqrt(R * R - dy * dy);
    };
  }

  /* ---------- 3. footer band (over the photo's bottom), then the text ---------- */
  ctaBand(s, theme, ctx, { withDate: true, qrCorner: true });
  logo(s, theme, logoBox);
  s.text({ x: P - size * 0.04, top: nameTop, lines: nl, font: nameFont, lh: nameLh, fill: theme.fg, name: "Speaker name" });
  if (rl.length) s.text({ x: P, top: roleTop, lines: rl, font: rf, lh: rlh, fill: theme.fgMuted, name: "Speaker role" });
  kicker(s, theme, { x: P, y: topicTop, text: chosen.kLines[0], size: T.caption });
  if (chosen.kLines[1]) s.text({ x: P, top: topicTop + kh, lines: chosen.kLines.slice(1), font: kFont, lh: kh, fill: theme.kicker, name: "Kicker (2)" });
  const tb = balancedTitle(s, theme, { x: P, top: chosen.titleTop, maxW: chosen.topicW, title: cfg.title, size: claimSize });
  const last = tb.lines[tb.lines.length - 1];
  if (last) petal(s, theme, { x: P + last.w + 18, y: last.top + last.lh * 0.8, h: petalH });
  /* The headline is a keep-out too: the seal sits low-right and the claim runs
     low-left, and at a wider credit count ("2 CE credits" is 15 px larger in
     radius than "1") they meet. */
  const words = ctx.qr ? textBoxes(chosen.keepOut)
    : { x: P, y: chosen.titleTop, w: Math.max(...tb.lines.map((l) => l.w), 0), h: tb.h };
  stamp(s, theme, ctx, bandTop, head?.face, band.pair, words, band.qrKeep, band.box);
}

/* ---------------- intro_panel_one / two ---------------- */

export async function introPanelist(ctx) {
  const { s, cfg, F, T, theme, panelists, format } = ctx;
  await ctx.background();
  const P = F.pad, W = F.w, H = F.h;
  const tall = format === "portrait";
  const person = panelists[0] || { name: cfg.person || "" };

  const lg = logo(s, theme, { x: P, y: P - 6, h: tall ? 92 : 84 });
  pill(s, theme, { x: W - P, y: P + 14, text: "Meet the panel", size: T.caption, align: "right", variant: "glass" });

  /* ---- the foot first: CTA band, then the room the person + tag need ---- */
  const band = ctaBand(s, theme, ctx, { withDate: true, dryRun: true });
  const bandTop = band.top;
  const archW = tall ? 420 : 360; // reduce visual weight of portrait vs headline; still legible cutout
  const archX = W - P - archW;
  const tagSize = tall ? T.card - 14 : T.card - 16;
  const tagOpts = { name: person.name, role: roleLine(person), size: tagSize, minSize: T.caption, maxW: Math.min(480, archX - P + 40), side: "right" };
  const tm = offstage(s, () => nameTag(s, theme, { ...tagOpts, x: 0, y: 0 }));
  const minZone = tall ? 470 : 360; // headline → band: enough for a legible arch window

  /* ---- headline leads (the one loud element): largest size that leaves the zone ---- */
  let y = lg.y + lg.h + (tall ? SPACE.xxl : SPACE.xl);
  const k = kicker(s, theme, { x: P, y, text: cfg.category || cfg.eyebrow, size: T.caption });
  y += k.h + SPACE.m;
  const budget = bandTop - minZone - y;
  let hSize = T.display;
  for (let sz = T.displayMax; sz >= T.display; sz -= 2) {
    if (balancedTitle(s, theme, { x: P, top: y, maxW: W - P * 2, title: cfg.title, size: sz, dryRun: true }).h <= budget) { hSize = sz; break; }
  }
  const tb = balancedTitle(s, theme, { x: P, top: y, maxW: W - P * 2, title: cfg.title, size: hSize });
  y += tb.h;
  const headBottom = y;
  const lastLine = tb.lines[tb.lines.length - 1];
  if (lastLine) petal(s, theme, { x: P + lastLine.w + 22, y: lastLine.top + lastLine.lh * 0.82, h: Math.round(hSize * 0.8) });

  /* ---- arched window, running behind the band ---- */
  const archTop = headBottom + SPACE.l;
  const archR = archW / 2;
  const archBottom = bandTop + 8;
  const d = `M${archX} ${archBottom}V${archTop + archR}A${archR} ${archR} 0 0 1 ${archX + archW} ${archTop + archR}V${archBottom}Z`;
  const acx = archX + archR;
  s.path({ d, fill: theme.tileFill, name: "Arch window" });
  const faceTop = archTop + archR * 0.42;
  let faceH = archW * 0.32;
  if (person.photo) {
    const ph = person.photo;
    const f = faceOf(ph);
    const e = await silhouetteEdges(ph);
    /* the photo's bottom crop must fall behind the band, never inside the arch */
    const kMin = e.bottom ? (archBottom + 8 - faceTop) / (ph.h - f.y) : 0;
    faceH = Math.max(faceH, f.h * kMin);
    portrait(s, ph, { faceH, cx: acx, faceTop, clip: { d }, name: "Panelist cutout" });
  } else {
    s.text({ x: acx, top: archTop + archR * 0.35, lines: [initials(person.name) || "?"], font: withSize(FONT.claimLight, archW * 0.3), lh: archW * 0.6, fill: theme.fgMuted, anchor: "middle", name: "Initials" });
  }
  /* credibility ring: an arch hairline offset from the window */
  const o = 12;
  s.path({
    d: `M${archX - o} ${archBottom}V${archTop + archR}A${archR + o} ${archR + o} 0 0 1 ${archX + archW + o} ${archTop + archR}V${archBottom}`,
    stroke: theme.ring, sw: 1.5, strokeOpacity: 0.55, name: "Credibility ring",
  });

  ctaBand(s, theme, ctx, { withDate: true });

  /* ---- name tag: bubble left of the face, tail toward it ---- */
  const faceCy = faceTop + faceH * 0.5;
  const tagX = archX + 48 - tm.w; // overlaps the arch rim, clear of the face
  const tagY = Math.max(headBottom + SPACE.l, Math.min(faceCy - tm.h + 6, bandTop - SPACE.xl - tm.h));
  nameTag(s, theme, { ...tagOpts, x: tagX, y: tagY });
  stamp(s, theme, ctx, bandTop, person.photo ? { x: acx - faceH * 0.5, y: faceTop, w: faceH, h: faceH * 1.2 } : null, band.pair, null, band.qrKeep);
}

/** Draw the CE stamp at its spot. A seal over the face is a build failure. */
function stamp(s, theme, ctx, bandTop, face, pair, words, qrKeep, box) {
  const credits = ctx.cfg.event?.ce;
  const spot = stampSpot(ctx, bandTop, [face, pair, box, words, qrKeep].flat().filter(Boolean));
  /* Lanes A and C return null rather than place a colliding seal; this one used
     to warn and draw it anyway, which is how a post ships with the
     accreditation mark sitting on somebody's chin. There is no third option:
     the mark is mandatory, so nowhere to put it is a failure. */
  if (!spot)
    throw new Error(`[${ctx.cfg.name} ${ctx.format}] nowhere to place the CE stamp clear of the face — reframe the photo or give the band more room`);
  ceStamp(s, theme, { ...spot, credits });
}

/* Run a draw call without emitting it (components have no dryRun for tags). */
function offstage(s, fn) {
  s.stack.push([]);
  try {
    return fn();
  } finally {
    s.stack.pop();
  }
}
