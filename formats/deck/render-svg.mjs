#!/usr/bin/env node
/**
 * Build one layered SVG per slide from a .gen/<deck>.json sidecar.
 *
 *   node render-svg.mjs -c .gen/<deck>.json [--slides 1,4-6]
 *
 * This is the ONLY visual source in the tool. render.mjs screenshots and prints these
 * same strings, so the PNG, the PDF and the Canva SVG cannot drift apart — they are one
 * document. The siblings keep an HTML template alongside a mirrored SVG builder and pay
 * a documented "change one, change the other" tax; with nine slide types that tax is
 * not affordable.
 *
 * Structure, per type: layout() resolves every coordinate into a flat object, then
 * draw() is pure and reads it. layout() also returns `overflow[]`, and any entry fails
 * the build — measurement is exact (see lib/metrics.mjs), so overflow is a real defect
 * rather than an estimate.
 *
 * Never hand-edit the output. Change the TOML or the geometry and re-render.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BRANDS_MODULE, CANVA, LOGO_BASE, PSP } from "./lib/paths.mjs";
import {
  CANVAS, GRID, BANDS, TYPE, SURFACE, INK, RAIL, SLIDE_LAYOUTS,
  span, lh, tileLayout, monogramSize, bodyHeight, coverCaptionH,
} from "./lib/geometry.mjs";
import { measure, wrap, balance, wrapFragments, fitDown, blockHeight, truncateLines, capTop, baseOffset } from "./lib/text.mjs";
import * as D from "./lib/draw.mjs";

const { escXml } = D;

function parseArgs(argv) {
  const a = { config: null, slides: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-c") a.config = argv[++i];
    else if (argv[i] === "--slides") {
      a.slides = new Set(
        String(argv[++i] || "").split(",").flatMap((p) => {
          const m = p.trim().match(/^(\d+)(?:-(\d+))?$/);
          if (!m) return [];
          const lo = Number(m[1]), hi = m[2] ? Number(m[2]) : lo;
          return Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
        })
      );
    }
  }
  return a;
}

/* ---------------------------------------------------------------- shared ---------- */

const bodyBottom = BANDS.bodyBottom;

/** Header row: eyebrow with its dot marker on the left, brand logo on the right. */
function slideHeader(cfg, slide, eyebrow) {
  const parts = [];
  const spec = TYPE.eyebrow;
  const y = BANDS.headerTop;
  if (eyebrow) {
    const r = SURFACE.eyebrowDotR;
    parts.push(D.dotMarker("eyebrow-dot", "Eyebrow dot", GRID.x0 + r, y + spec.fs * spec.lh / 2, r));
    parts.push(D.text("eyebrow", "Eyebrow", GRID.x0 + r * 2 + SURFACE.eyebrowGap, y, eyebrow, spec, INK.lead, { upper: true }));
  }
  const logoFile = path.join(LOGO_BASE, cfg.brand.logo || "assets/oba-logo-white.png");
  parts.push(D.brandLogo("brand-logo", `${String(cfg.brand.id || "OBA").split("_")[0]} logo`, logoFile, GRID.x1, y - 2));
  return parts.filter(Boolean).join("\n");
}

const slideChrome = (cfg, slide, eyebrow) =>
  [
    slideHeader(cfg, slide, eyebrow),
    slide.showFooter ? D.slideFooter(slide.footerLeft, slide.number, slide.total, BANDS) : D.cornerBrackets(),
  ].join("\n");

/** Horizontal room a dotRow needs before its text starts — the dot plus its gap. */
const dotRowIndent = SURFACE.listDot.r * 2 + SURFACE.listDot.gap;

/** Mono-dot list row — the brand's "bullet + label" rhythm at body size. */
function dotRow(idBase, name, x, y, lines, spec = TYPE.body) {
  const { r, fill } = SURFACE.listDot;
  return [
    D.dotMarker(`${idBase}-dot`, `${name} dot`, x + r, y + spec.fs * spec.lh / 2, r, fill),
    D.textBlock(`${idBase}-text`, name, x + dotRowIndent, y, lines, spec, INK.body),
  ].join("\n");
}

/* ----------------------------------------------------------------- cover ---------- */

function layoutCover(slide) {
  const L = SLIDE_LAYOUTS.cover;
  const overflow = [];
  const notes = [];

  const titleLines = wrapFragments(slide.title, L.titleMaxW, TYPE.coverTitle);
  if (titleLines.length > L.titleMaxLines) {
    overflow.push(`title wraps to ${titleLines.length} lines, max ${L.titleMaxLines}`);
  }
  const titleH = blockHeight(titleLines.length, lh(TYPE.coverTitle));
  let y = L.titleTop + titleH;

  const subLines = slide.subtitle ? balance(slide.subtitle, L.subtitleMaxW, TYPE.lead) : [];
  const subTop = y + (subLines.length ? L.subtitleGap : 0);
  y = subTop + blockHeight(subLines.length, lh(TYPE.lead));

  const metaLine = slide.meta.join("   ·   ");
  const metaTop = y + (metaLine ? L.metaGap : 0);
  if (metaLine && measure(metaLine.toUpperCase(), TYPE.monoLead) > GRID.contentW) {
    overflow.push("cover meta line is wider than the content box");
  }
  y = metaTop + (metaLine ? lh(TYPE.monoLead) : 0);

  /* Whatever vertical space is left becomes the rail; the tiles scale into it. Now that
     the rail is left-aligned rather than centred (see x0 below), it also has to fit the
     content column horizontally — a wide ladder entry times a high speaker count can
     otherwise run the row past GRID.x1, which centring used to hide for free. Both
     constraints scale the tile uniformly, so the aspect ratio never distorts. */
  const railTop = y + L.railGap;
  const avail = L.railBottom - railTop;
  const base = tileLayout(slide.speakers.length);
  const rawTotalW = slide.speakers.length * base.w + (slide.speakers.length - 1) * base.gap;
  const scale = Math.min(1, avail / base.h, GRID.contentW / rawTotalW);
  const tileH = Math.round(base.h * scale);
  const tileW = Math.round(base.w * scale);
  if (tileH < L.railMinH) {
    overflow.push(`speaker rail has only ${Math.round(avail)}px — shorten the title or subtitle`);
  }
  /* Left-aligned to the content column, not centred — the rail reads as part of the
     same left-hand stack as the title/subtitle/meta above it, rather than a separate
     centred object dropped onto the slide. */
  const x0 = GRID.x0;

  /* Name and role are drawn as ONE combined badge inside the tile, over a bottom scrim,
     so the tile carries a single caption rather than two stacked pills. It is fitted to
     the tile's own inner width (tile width minus padding minus the badge's own padding),
     so it never runs past the photo it sits on. */
  const padIn = L.tilePad;
  const innerW = tileW - padIn * 2;
  /* Text fits inside a slack fraction of the plate's inner measure, never the whole of
     it — see roleSlack in geometry. */
  const fitW = Math.floor((innerW - L.captionPadX * 2) * L.roleSlack);
  /* One plate size for every tile, so the row of captions shares a top edge whether a
     role wraps to one line or two. */
  const capH = coverCaptionH();
  const capY = (tileTop) => tileTop + tileH - padIn - capH;

  const tiles = slide.speakers.map((sp, i) => {
    const x = x0 + i * (tileW + base.gap);
    const y = L.railBottom - tileH;

    const nameSpecs = [TYPE.coverName, { ...TYPE.coverName, fs: 18 }, { ...TYPE.coverName, fs: 16 }];
    let name = fitDown(sp.name, fitW, nameSpecs, { maxLines: 1 });
    let nameText = sp.name;
    if (name.overflow && sp.short && sp.short !== sp.name) {
      const short = fitDown(sp.short, fitW, nameSpecs, { maxLines: 1 });
      if (!short.overflow) { name = short; nameText = sp.short; }
    }
    if (name.overflow) overflow.push(`speaker name "${sp.name}" does not fit its badge`);

    /* Degrade in steps rather than failing the deck: "role · company", then role alone,
       then company alone, then an ellipsis. A long job title is normal and should never
       be the reason a panel cannot build — the spotlight slide still shows it in full. */
    const fits = (lines) =>
      lines.length <= L.roleMaxLines && lines.every((l) => measure(l, TYPE.coverRole) <= fitW);
    const rungs = [[sp.role, sp.company].filter(Boolean).join(" · "), sp.role, sp.company].filter(Boolean);
    let roleLines = [];
    for (const rung of rungs) {
      roleLines = wrap(rung, fitW, TYPE.coverRole);
      if (fits(roleLines)) break;
    }
    if (roleLines.length > L.roleMaxLines) {
      roleLines = truncateLines(roleLines, L.roleMaxLines, fitW, TYPE.coverRole).lines;
      notes.push(`cover role for "${sp.name}" was trimmed to ${L.roleMaxLines} lines`);
    }
    /* wrap() gives a single over-long word its own line rather than breaking it, and the
       plate is fixed-width now, so that is a real overflow rather than a wider plate. */
    if (roleLines.some((l) => measure(l, TYPE.coverRole) > fitW)) {
      overflow.push(`cover role for "${sp.name}" has a word wider than its plate`);
    }

    return { sp, x, y, w: tileW, h: tileH, name, nameText, roleLines, capY: capY(y), capW: innerW, capH };
  });

  return { overflow, notes, titleLines, subLines, subTop, metaLine, metaTop, tiles };
}

function drawCover(cfg, slide, ly) {
  const L = SLIDE_LAYOUTS.cover;
  const parts = [
    D.textBlock("title", "Title", GRID.x0, L.titleTop, ly.titleLines, TYPE.coverTitle, INK.primary, { dimFill: INK.muted }),
  ];
  if (ly.subLines.length) {
    parts.push(D.textBlock("subtitle", "Subtitle", GRID.x0, ly.subTop, ly.subLines, TYPE.lead, INK.lead));
  }
  if (ly.metaLine) {
    parts.push(D.text("meta", "Event meta", GRID.x0, ly.metaTop, ly.metaLine, TYPE.monoLead, INK.muted, { upper: true }));
  }
  ly.tiles.forEach((t, i) => {
    const idx = String(i + 1).padStart(2, "0");
    parts.push(D.headshotTile(`speaker-tile-${idx}`, `Headshot tile ${idx}`, t, t.sp,
      { monogramSize: monogramSize(t.w), scrimH: L.scrimH, shadow: false }));
    const rows = [{ text: t.nameText, spec: t.name.spec, fill: INK.primary }];
    if (t.roleLines.length) {
      rows.push({ text: t.roleLines, spec: TYPE.coverRole, fill: INK.lead, rowGapBefore: L.captionGap });
    }
    parts.push(D.pillBlock(`speaker-caption-${idx}`, `Speaker caption ${idx}`, t.x + L.tilePad, t.capY, rows,
      { padX: L.captionPadX, padY: L.captionPadY, fill: SURFACE.plateFill, w: t.capW, h: t.capH }).svg);
  });
  parts.push(D.waveform("waveform", "Waveform", GRID.x1 - D.waveformWidth, CANVAS.h - 64));
  return parts.join("\n");
}

/* --------------------------------------------------------------- divider ---------- */

function layoutDivider(slide) {
  const L = SLIDE_LAYOUTS.divider;
  const lines = balance(slide.text, L.maxW, TYPE.dividerTitle);
  const overflow = lines.length > L.maxLines ? [`divider text wraps to ${lines.length} lines, max ${L.maxLines}`] : [];
  const blockH = blockHeight(lines.length, lh(TYPE.dividerTitle));
  const textTop = L.centerY - blockH / 2;
  return { overflow, lines, textTop, ruleTopY: textTop - L.rule.gap, ruleBottomY: textTop + blockH + L.rule.gap, L };
}

const drawDivider = (cfg, slide, ly) => {
  const ruleX = CANVAS.w / 2 - ly.L.rule.w / 2;
  return [
    D.hairline("divider-rule-top", "Divider rule top", ruleX, ly.ruleTopY, ly.L.rule.w),
    D.textBlock("divider-text", "Divider text", CANVAS.w / 2, ly.textTop, ly.lines, TYPE.dividerTitle, INK.primary, { anchor: "middle" }),
    D.hairline("divider-rule-bottom", "Divider rule bottom", ruleX, ly.ruleBottomY, ly.L.rule.w),
  ].join("\n");
};

/* ------------------------------------------------------------------ stat ---------- */

function layoutStat(slide) {
  const L = SLIDE_LAYOUTS.stat;
  const overflow = [];
  const lines = balance(slide.text, L.maxW, TYPE.h1, { maxLines: L.textMaxLines });
  if (lines.length > L.textMaxLines) overflow.push(`stat text wraps to ${lines.length} lines, max ${L.textMaxLines}`);
  const hasValue = Boolean(slide.value);
  if (hasValue && measure(slide.value, TYPE.statHero) > L.maxW) overflow.push("stat value is wider than the slide");
  if (slide.source && measure(slide.source.toUpperCase(), TYPE.monoLabel) > L.maxW) overflow.push("stat source is wider than the slide");

  const noteLines = slide.note ? balance(slide.note, L.maxW, TYPE.lead, { maxLines: L.noteMaxLines }) : [];
  if (noteLines.length > L.noteMaxLines) overflow.push(`stat note wraps to ${noteLines.length} lines, max ${L.noteMaxLines}`);

  /* Numeral, line, note, source — one block, centred on the canvas. */
  const valueH = hasValue ? lh(TYPE.statHero) + L.valueGap : 0;
  const textH = blockHeight(lines.length, lh(TYPE.h1));
  const noteH = noteLines.length ? L.noteGap + blockHeight(noteLines.length, lh(TYPE.lead)) : 0;
  const sourceH = slide.source ? L.sourceGap + lh(TYPE.monoLabel) : 0;
  const top = L.centerY - (valueH + textH + noteH + sourceH) / 2;
  return {
    overflow, lines, noteLines, hasValue,
    valueTop: top, textTop: top + valueH, noteTop: top + valueH + textH + L.noteGap,
    sourceTop: top + valueH + textH + noteH + L.sourceGap, L,
  };
}

function drawStat(cfg, slide, ly) {
  const cx = CANVAS.w / 2;
  const parts = [];
  if (ly.hasValue) {
    parts.push(D.text("stat-value", "Stat value", cx, ly.valueTop, slide.value, TYPE.statHero, INK.primary, { anchor: "middle" }));
  }
  parts.push(D.textBlock("stat-text", "Stat text", cx, ly.textTop, ly.lines, TYPE.h1, ly.hasValue ? INK.lead : INK.primary, { anchor: "middle" }));
  if (ly.noteLines.length) {
    parts.push(D.textBlock("stat-note", "Stat note", cx, ly.noteTop, ly.noteLines, TYPE.lead, INK.body, { anchor: "middle" }));
  }
  if (slide.source) {
    parts.push(D.text("stat-source", "Stat source", cx, ly.sourceTop, slide.source, TYPE.monoLabel, INK.muted, { anchor: "middle", upper: true }));
  }
  return parts.join("\n");
}

/* ---------------------------------------------------------------- agenda ---------- */

function layoutAgenda(slide) {
  const overflow = [];
  const n = slide.items.length;
  const r = RAIL[n];
  if (!r) return { overflow: [`agenda has ${n} items; only 4 or 5 are supported`], rows: [], heading: [] };

  const heading = balance(slide.heading, span(8), TYPE.h1);
  const numeralSpec = { ...TYPE.numeral, fs: r.numeral };

  const rows = slide.items.map((item, i) => {
    const y = RAIL.top + i * (r.rowH + r.gap);
    const titleLines = wrap(item.title, RAIL.textMaxW, TYPE.h2);
    const noteLines = wrap(item.note, RAIL.textMaxW, TYPE.body);
    if (titleLines.length > 1) overflow.push(`topic ${i + 1} title wraps to ${titleLines.length} lines`);
    if (noteLines.length > SLIDE_LAYOUTS.agenda.noteMaxLines) {
      overflow.push(`topic ${i + 1} note wraps to ${noteLines.length} lines — cut it to one`);
    }
    const used = lh(TYPE.h2) * titleLines.length + RAIL.noteGap - lh(TYPE.h2) + lh(TYPE.body) * noteLines.length;
    if (used > r.rowH) overflow.push(`topic ${i + 1} needs ${Math.round(used)}px in a ${r.rowH}px row`);
    /* Center the numeral's em-box on the title+note block, not baseline-to-baseline with
       the title alone: baseline alignment left the 84px numeral's optical weight sitting
       entirely above the title, floating clear of the row it's meant to label. */
    const numeralTop = y + (used - numeralSpec.fs) / 2;
    return { ...item, y, numeralTop, titleLines, noteLines, numeralSpec };
  });

  return { overflow, rows, heading, r, railH: n * r.rowH + (n - 1) * r.gap };
}

function drawAgenda(cfg, slide, ly) {
  const parts = [D.textBlock("heading", "Heading", GRID.x0, SLIDE_LAYOUTS.agenda.headingTop, ly.heading, TYPE.h1)];
  parts.push(D.vrule("rail-rule", "Agenda rule", RAIL.ruleX, RAIL.top, ly.railH));
  ly.rows.forEach((row, i) => {
    const idx = String(i + 1).padStart(2, "0");
    /* xRight: the numeral column's right edge. ghostNumeral fills leftward from it in
       fixed digit cells, so 01..05 share both edges. */
    parts.push(D.ghostNumeral(`topic-num-${idx}`, `Topic numeral ${idx}`,
      RAIL.numeralCol.x + RAIL.numeralCol.w, row.numeralTop, row.n, row.numeralSpec));
    parts.push(D.textBlock(`topic-title-${idx}`, `Topic title ${idx}`, RAIL.textX, row.y, row.titleLines, TYPE.h2));
    if (row.noteLines.length) {
      parts.push(D.textBlock(`topic-note-${idx}`, `Topic note ${idx}`, RAIL.textX,
        row.y + RAIL.noteGap, row.noteLines, TYPE.body, INK.body));
    }
  });
  return parts.join("\n");
}

/* ------------------------------------------------------------- spotlight ---------- */

function layoutSpotlight(slide) {
  const L = SLIDE_LAYOUTS.spotlight;
  const overflow = [];
  const railW = L.rail.w;

  const name = fitDown(slide.speaker.name, railW, [TYPE.h1, TYPE.h1Tight], { maxLines: 1 });
  if (name.overflow) overflow.push(`speaker name "${slide.speaker.name}" does not fit the rail`);

  const roleText = [slide.speaker.role, slide.speaker.company].filter(Boolean).join(" · ");
  const roleLines = wrap(roleText, railW, TYPE.lead);
  if (roleLines.length > L.roleMaxLines) {
    overflow.push(`role + company wraps to ${roleLines.length} lines, max ${L.roleMaxLines}`);
  }

  /* The name's cap line sits on the portrait's top edge — that is the line the eye draws
     first across the two columns, and a line box's half-leading put it 11px low. */
  const nameTop = Math.round(L.portrait.y - capTop(name.spec));
  const roleTop = nameTop + lh(name.spec) + L.nameRoleGap;
  const ruleY = roleTop + blockHeight(roleLines.length, lh(TYPE.lead)) + L.roleRuleGap;

  /* Hero stat, right-aligned on the name row. The number sits on the name's baseline
     and the label on the role's, so the row reads name ↔ number, role ↔ what it counts.
     Baselines are matched explicitly because the specs differ in size and font. */
  const onBaselineOf = (top, ref, spec) =>
    top + baseOffset(ref.font, ref.fs, ref.fs * ref.lh) - baseOffset(spec.font, spec.fs, spec.fs * spec.lh);
  let stat = null;
  if (slide.speaker.stat) {
    const value = slide.speaker.stat;
    const label = slide.speaker.statLabel;
    const nameW = measure(name.lines[0] || "", name.spec);
    const valueW = measure(value, TYPE.stat);
    if (nameW + L.stat.gap + valueW > railW) overflow.push(`stat "${value}" collides with the speaker name — shorten one`);
    const roleW = roleLines.length ? measure(roleLines[0], TYPE.lead) : 0;
    const labelW = label ? measure(label.toUpperCase(), TYPE.monoLabel) : 0;
    if (roleW + L.stat.gap + labelW > railW) overflow.push(`stat label "${label}" collides with the role line — shorten one`);
    stat = {
      value, label,
      valueTop: onBaselineOf(nameTop, name.spec, TYPE.stat),
      labelTop: onBaselineOf(roleTop, TYPE.lead, TYPE.monoLabel),
    };
  }

  /* Each card is as tall as its point: padY, the wrapped lines, padY. A fixed row height
     left a one-line point floating in a slab twice its size. */
  const textW = railW - L.card.padX * 2 - dotRowIndent;
  let cy = ruleY + L.ruleListGap;
  const bio = slide.bio.map((b, i) => {
    const lines = wrap(b, textW, TYPE.body);
    if (lines.length > L.card.maxLines) {
      overflow.push(`bio[${i + 1}] wraps to ${lines.length} lines, max ${L.card.maxLines}`);
    }
    const h = L.card.padY * 2 + blockHeight(lines.length, lh(TYPE.body));
    const card = { lines, y: cy, h, textY: cy + L.card.padY };
    cy += h + L.card.gap;
    return card;
  });
  const listBottom = cy - L.card.gap;
  if (listBottom > L.tagsY - L.listBottomGap) {
    overflow.push(`bio cards end at ${Math.round(listBottom)}px, into the tag row — shorten a point`);
  }

  let tx = L.rail.x;
  const tags = slide.tags.map((label) => {
    const w = Math.round(measure(label.toUpperCase(), TYPE.monoChip) + SURFACE.pill.padX * 2);
    const item = { label, x: tx, w };
    tx += w + L.tagGap;
    return item;
  });
  const tagsEnd = tx - L.tagGap;
  if (tagsEnd > GRID.x1) overflow.push("expertise tags overflow the rail — shorten one");

  /* Website, right-aligned on the tag row, vertically centred on the pills. */
  let site = null;
  if (slide.speaker.website) {
    const siteW = measure(slide.speaker.website.toUpperCase(), TYPE.monoLabel);
    if (tagsEnd + L.siteGap + siteW > GRID.x1) overflow.push("speaker website collides with the expertise tags — shorten a tag");
    site = { text: slide.speaker.website, top: L.tagsY + (SURFACE.pill.h - lh(TYPE.monoLabel)) / 2 };
  }

  /* The overlay chip used to repeat the name that is already set 64px tall on the rail,
     which reads as a template bug rather than emphasis. When the profile carries a quote
     the chip earns its place by adding something; otherwise the portrait stays clean. */
  const quoteLines = slide.speaker.quote
    ? wrap(`\u201C${slide.speaker.quote}\u201D`, L.chip.w - L.chipPad.x * 2, TYPE.role)
    : [];
  const chip = quoteLines.length && quoteLines.length <= L.chipMaxLines
    ? { ...L.chip, y: L.chip.y - (quoteLines.length - 2) * lh(TYPE.role),
        h: L.chip.h + (quoteLines.length - 2) * lh(TYPE.role), lines: quoteLines }
    : null;

  return { overflow, name, roleLines, nameTop, roleTop, ruleY, bio, tags, chip, stat, site, L };
}

function drawSpotlight(cfg, slide, ly) {
  const L = ly.L;
  const parts = [
    D.headshotTile("portrait", "Speaker portrait", L.portrait, slide.speaker, { monogramSize: L.monogram }),
  ];
  if (ly.chip) {
    parts.push(D.glassCard("quote-chip", "Speaker quote chip", ly.chip, { radius: SURFACE.radius.card }));
    parts.push(D.textBlock("chip-quote", "Chip quote", ly.chip.x + L.chipPad.x, ly.chip.y + L.chipPad.y, ly.chip.lines, TYPE.role, INK.primary));
  }
  parts.push(
    D.textBlock("speaker-name", "Speaker name", L.rail.x, ly.nameTop, ly.name.lines, ly.name.spec),
    D.textBlock("speaker-role", "Speaker role", L.rail.x, ly.roleTop, ly.roleLines, TYPE.lead, INK.lead),
    D.hairline("rail-rule", "Rail rule", L.rail.x, ly.ruleY, L.rail.w)
  );
  if (ly.stat) {
    parts.push(D.text("stat-value", "Hero stat", GRID.x1, ly.stat.valueTop, ly.stat.value, TYPE.stat, INK.primary, { anchor: "end" }));
    if (ly.stat.label) {
      parts.push(D.text("stat-label", "Hero stat label", GRID.x1, ly.stat.labelTop, ly.stat.label, TYPE.monoLabel, INK.muted, { anchor: "end", upper: true }));
    }
  }
  ly.bio.forEach((b, i) => {
    const idx = String(i + 1).padStart(2, "0");
    parts.push(D.glassCard(`bio-card-${idx}`, `Bio card ${idx}`,
      { x: L.rail.x, y: b.y, w: L.rail.w, h: b.h }, { radius: SURFACE.radius.cardSmall }));
    parts.push(dotRow(`bio-${idx}`, `Bio point ${idx}`, L.rail.x + L.card.padX, b.textY, b.lines));
  });
  ly.tags.forEach((t, i) => {
    parts.push(D.pill(`tag-${i + 1}`, `Expertise tag ${i + 1}`, t.x, L.tagsY, t.label).svg);
  });
  if (ly.site) {
    parts.push(D.text("speaker-site", "Speaker website", GRID.x1, ly.site.top, ly.site.text, TYPE.monoLabel, INK.muted, { anchor: "end", upper: true }));
  }
  return parts.join("\n");
}

/* --------------------------------------------------------------- sponsor ---------- */

/**
 * Two matching glass cards on one band. The left card is the sponsor: an identity row
 * (mark + tier pill), the name, then the two paragraphs together. The right card is the
 * proof: a label pill, then one hairline-separated row per client quote.
 *
 * Both cards open on `y` and close on `colBottom`, and both carry a pill in the same
 * position, so the columns read as a pair. The mark is a fixed 440x180 badge rather than
 * a plate sized to whatever space is left — flexing it is what previously grew it to
 * 890x151 of near-white, out-contrasting the name it introduces and splitting the two
 * paragraphs apart.
 */
function layoutSponsor(slide) {
  const L = SLIDE_LAYOUTS.sponsor;
  const overflow = [];
  const notes = [];
  const innerW = L.card.w - SURFACE.cardPad.x * 2;
  const floor = L.colBottom - SURFACE.cardPad.y;

  /* --- left card: the story block --- */
  /* Wrapped once, here, because the block's height decides where the block starts. */
  const descLines = slide.description ? wrap(slide.description, innerW, TYPE.lead) : [];
  const detailLines = slide.detail ? wrap(slide.detail, innerW, TYPE.body) : [];
  const copyH = blockHeight(descLines.length, lh(TYPE.lead)) +
    (descLines.length && detailLines.length ? L.descDetailGap : 0) +
    blockHeight(detailLines.length, lh(TYPE.body));

  /* The block — mark, then the two paragraphs — is optically centred in the card rather
     than hung from its top edge. The mark no longer fills the card's width, so
     top-anchoring it would push every pixel of slack into the single gap beneath it:
     141px at this mark size, which reads as a hole rather than a group separator. */
  const blockTop = L.card.y + SURFACE.cardPad.y;
  const blockH = L.mark.h + L.markCopyGap + copyH;
  const top = blockTop + Math.max(0, (floor - blockTop - blockH) / 2);

  const mark = {
    x: L.card.x + (L.card.w - L.mark.w) / 2,   // centred on the card, not hung left
    y: top,
    w: L.mark.w,
    h: L.mark.h,
  };

  /* With the h1 gone, the mark is the only thing naming the sponsor — so a sponsor whose
     logo has not arrived yet falls back to its name set as the card's headline, centred
     in the block the mark would have occupied. The block keeps its height either way, so
     the copy underneath never shifts. gen.mjs already warns about the missing file; the
     slide's job is to still read. */
  const hasLogo = Boolean(slide.logo);
  let name = null;
  let nameTop = 0;
  if (!hasLogo) {
    name = fitDown(slide.name, innerW, [TYPE.h1, TYPE.h1Tight], { maxLines: 2, balanced: true });
    if (name.overflow) overflow.push("sponsor name wraps past two lines");
    nameTop = mark.y + (mark.h - blockHeight(name.lines.length, lh(name.spec))) / 2;
  }

  const descTop = mark.y + mark.h + L.markCopyGap;
  const detailTop = descTop + blockHeight(descLines.length, lh(TYPE.lead)) +
    (descLines.length && detailLines.length ? L.descDetailGap : 0);
  const copyBottom = detailTop + blockHeight(detailLines.length, lh(TYPE.body));
  if (copyBottom > floor) {
    overflow.push(
      `sponsor copy ends at ${Math.round(copyBottom)}, past the card floor at ${floor} ` +
        `— shorten [sponsor] description or detail`
    );
  }

  /* --- right card: label pill, then the proof rows --- */
  const railInnerW = L.rail.w - SURFACE.cardPad.x * 2;
  const railX = L.rail.x + SURFACE.cardPad.x;
  const label = slide.proofLabel ? String(slide.proofLabel) : "";
  const labelY = L.rail.y + SURFACE.cardPad.y;

  let y = labelY + (label ? SURFACE.pill.h + L.proof.labelGap : 0);
  const rows = slide.proof.map((q, i) => {
    const lines = wrap(q.text, railInnerW, TYPE.body);
    if (lines.length > L.proof.maxLines) {
      overflow.push(`client quote ${i + 1} wraps to ${lines.length} lines, max ${L.proof.maxLines}`);
    }
    const starsH = q.stars ? SURFACE.star.size + L.proof.starsGap : 0;
    const textTop = y + starsH;
    const textH = blockHeight(lines.length, lh(TYPE.body));
    const h = starsH + textH + (q.source ? L.proof.sourceGap + lh(TYPE.monoLabel) : 0);
    const row = {
      ...q, lines,
      x: railX, y, w: railInnerW, h,
      starsTop: y,
      textTop,
      sourceTop: q.source ? textTop + textH + L.proof.sourceGap : 0,
      /* The separator sits centred in the gap, and only BETWEEN rows — a rule under the
         last row would read as the card's own floor drawn in the wrong place. */
      ruleY: i < slide.proof.length - 1 ? y + h + L.proof.rowGap / 2 : 0,
    };
    y += h + L.proof.rowGap;
    return row;
  });
  const stackBottom = rows.length ? y - L.proof.rowGap : labelY;
  if (stackBottom > floor) {
    overflow.push(
      `client proof stack ends at ${Math.round(stackBottom)}, past the card floor at ${floor} ` +
        `— drop a [[sponsor_proof]] entry or shorten one`
    );
  }

  const learnMore = [slide.cta, slide.website].filter(Boolean).join(": ");
  if (!learnMore) notes.push("sponsor has no `cta`/`website` — the learn-more line is omitted");

  return {
    overflow, notes, L,
    mark, hasLogo, name, nameTop, descLines, descTop, detailLines, detailTop,
    label, labelY, railX, railInnerW, rows, learnMore,
  };
}

function drawSponsor(cfg, slide, ly) {
  const L = ly.L;
  const x = L.card.x + SURFACE.cardPad.x;

  const parts = [
    D.glassCard("sponsor-card", "Sponsor card", L.card),
    D.glassCard("proof-card", "Client proof card", L.rail),
  ];

  if (ly.hasLogo) {
    /* radius.cardSmall, not radius.card: the mark is nested inside a 24 card, and two
       rounded corners at the same radius read as a misalignment rather than as nesting. */
    parts.push(D.logoPlate("sponsor-logo-plate", "Sponsor logo plate", ly.mark, slide.logo, slide.name,
      { padX: L.mark.padX, padY: L.mark.padY, radius: SURFACE.radius.cardSmall }));
  } else {
    parts.push(D.textBlock("sponsor-name", "Sponsor name", x, ly.nameTop, ly.name.lines, ly.name.spec));
  }

  if (ly.descLines.length) {
    parts.push(D.textBlock("sponsor-desc", "Sponsor description", x, ly.descTop, ly.descLines, TYPE.lead, INK.lead));
  }
  if (ly.detailLines.length) {
    parts.push(D.textBlock("sponsor-detail", "Sponsor detail", x, ly.detailTop, ly.detailLines, TYPE.body, INK.body));
  }

  if (ly.label) {
    parts.push(D.pill("proof-label", "Client proof label", ly.railX, ly.labelY, ly.label).svg);
  }

  ly.rows.forEach((r, i) => {
    const idx = String(i + 1).padStart(2, "0");
    if (r.stars) {
      /* Full-strength white: at 24px the brand's accent ink read as pale grey dots
         rather than a rating, and gold is not in the OBA palette. */
      parts.push(D.stars(`proof-stars-${idx}`, `Client proof rating ${idx}`, r.x, r.starsTop, r.stars,
        { fill: INK.primary }));
    }
    parts.push(D.textBlock(`proof-text-${idx}`, `Client quote ${idx}`, r.x, r.textTop, r.lines, TYPE.body, INK.primary));
    if (r.source) {
      parts.push(D.text(`proof-source-${idx}`, `Client name ${idx}`, r.x, r.sourceTop, r.source, TYPE.monoLabel, INK.faint, { upper: true }));
    }
    if (r.ruleY) {
      parts.push(D.hairline(`proof-rule-${idx}`, `Client proof rule ${idx}`, r.x, r.ruleY, r.w));
    }
  });

  if (ly.learnMore) {
    parts.push(D.text("sponsor-learn-more", "Sponsor learn more", GRID.x0, L.learnMoreY, ly.learnMore, TYPE.monoLead, INK.lead, { upper: true }));
  }
  return parts.join("\n");
}

/* ---------------------------------------------------------------- offers ---------- */

function layoutOfferPrimary(slide) {
  const L = SLIDE_LAYOUTS.offer_primary;
  const overflow = [];
  const head = fitDown(slide.headline, L.headingMaxW, [TYPE.h1, TYPE.h1Tight], { maxLines: 2, balanced: true });
  if (head.overflow) overflow.push("offer headline wraps past two lines");
  const supTop = L.headingTop + blockHeight(head.lines.length, lh(head.spec)) + L.headSupportGap;
  const supLines = wrap(slide.support, L.supportMaxW, TYPE.lead);

  const n = slide.benefits.length;
  const g = n >= 4 ? L.card4 : L.card3;
  const gridTop = n >= 4 ? L.gridTop : L.gridTop3;
  if (supTop + blockHeight(supLines.length, lh(TYPE.lead)) > gridTop - L.supportGridGap) {
    overflow.push("offer support text runs into the benefit grid");
  }

  /* Every card reserves the same two-line title zone, wrapped or not, so the notes in a
     row start on one y. Letting the note follow its own title made a 2/2/1-line title
     row read as three unrelated boxes rather than one grid. */
  const textW = g.w - L.cardPad.x * 2;
  const noteOffset = L.cardPad.y + L.titleLines * lh(TYPE.h2) + L.titleGap;
  const noteSpec = { ...TYPE.body, weight: L.noteWeight };
  const cards = slide.benefits.map((b, i) => {
    const col = i % g.cols, row = Math.floor(i / g.cols);
    const x = L.gridArea.x + col * (g.w + g.gap);
    const y = gridTop + row * (g.h + g.gap);
    const titleLines = wrap(b.title, textW, TYPE.h2);
    const noteLines = wrap(b.note, textW, noteSpec);
    if (titleLines.length > L.titleLines) {
      overflow.push(`benefit ${i + 1} title wraps to ${titleLines.length} lines, max ${L.titleLines}`);
    }
    if (noteLines.length > g.noteLines) {
      overflow.push(`benefit ${i + 1} note wraps to ${noteLines.length} lines, max ${g.noteLines}`);
    }
    return { x, y, w: g.w, h: g.h, titleLines, noteLines, titleTop: y + L.cardPad.y, noteTop: y + noteOffset };
  });

  /* The rail is a glass PANEL, sized to its contents and centred in the band: title,
     value badge, code, caption, url. Everything in it is centred on the panel's midline.
     `balance()` rather than `wrap()` for the title and caption — wrap() breaks the CTA as
     "SCAN TO RESERVE IN UNDER A" / "MINUTE", leaving a one-word widow. */
  const P = L.panel;
  const railMid = L.rail.x + L.rail.w / 2;
  const innerW = L.rail.w - P.pad.x * 2;

  const titleLines = slide.panelTitle ? balance(slide.panelTitle, innerW, TYPE.lead, { maxLines: P.titleMaxLines }) : [];
  if (titleLines.length > P.titleMaxLines) overflow.push(`offer panel title wraps to ${titleLines.length} lines, max ${P.titleMaxLines}`);
  const ctaLines = slide.cta ? balance(slide.cta.toUpperCase(), innerW, TYPE.monoLabel, { maxLines: P.ctaMaxLines }) : [];
  if (ctaLines.length > P.ctaMaxLines) overflow.push(`offer caption wraps to ${ctaLines.length} lines, max ${P.ctaMaxLines}`);
  const valuePill = slide.value ? D.pill("offer-value", "Offer value", 0, 0, slide.value) : null;

  const panelH = P.pad.y * 2 +
    (titleLines.length ? blockHeight(titleLines.length, lh(TYPE.lead)) + P.titleValueGap : 0) +
    (valuePill ? SURFACE.pill.h + P.valueQrGap : 0) +
    L.qr +
    (ctaLines.length ? P.qrCtaGap + blockHeight(ctaLines.length, lh(TYPE.monoLabel)) : 0) +
    (slide.url ? P.ctaUrlGap + lh(TYPE.monoLabel) : 0);
  const panelY = BANDS.bodyTop + Math.max(0, (bodyBottom - BANDS.bodyTop - panelH) / 2);
  if (panelH > bodyBottom - BANDS.bodyTop) overflow.push(`offer panel needs ${Math.round(panelH)}px in a ${bodyBottom - BANDS.bodyTop}px band`);
  if (L.qr > innerW) overflow.push(`offer QR (${L.qr}) is wider than its panel (${innerW})`);

  let py = panelY + P.pad.y;
  const titleTop = py;
  if (titleLines.length) py += blockHeight(titleLines.length, lh(TYPE.lead)) + P.titleValueGap;
  const valueY = py;
  if (valuePill) py += SURFACE.pill.h + P.valueQrGap;
  const qrY = py;
  py += L.qr;
  const ctaTop = py + P.qrCtaGap;
  if (ctaLines.length) py = ctaTop + blockHeight(ctaLines.length, lh(TYPE.monoLabel));
  const urlTop = py + P.ctaUrlGap;

  const panel = { x: L.rail.x, y: panelY, w: L.rail.w, h: panelH };
  const qrX = L.rail.x + (L.rail.w - L.qr) / 2;

  return { overflow, head, supTop, supLines, cards, panel, qrX, qrY, railMid,
    titleLines, titleTop, valuePill, valueY, ctaLines, ctaTop, urlTop, L };
}

function drawOfferPrimary(cfg, slide, ly) {
  const L = ly.L;
  const parts = [
    D.textBlock("headline", "Headline", GRID.x0, L.headingTop, ly.head.lines, ly.head.spec),
    D.textBlock("support", "Support", GRID.x0, ly.supTop, ly.supLines, TYPE.lead, INK.lead),
  ];
  const noteSpec = { ...TYPE.body, weight: L.noteWeight };
  ly.cards.forEach((c, i) => {
    const idx = String(i + 1).padStart(2, "0");
    parts.push(D.glassCard(`benefit-card-${idx}`, `Benefit card ${idx}`, c, { radius: SURFACE.radius.cardSmall }));
    parts.push(D.textBlock(`benefit-title-${idx}`, `Benefit title ${idx}`, c.x + L.cardPad.x, c.titleTop, c.titleLines, TYPE.h2));
    parts.push(D.textBlock(`benefit-note-${idx}`, `Benefit note ${idx}`, c.x + L.cardPad.x, c.noteTop, c.noteLines, noteSpec, INK.body));
  });
  parts.push(D.glassCard("offer-panel", "Offer panel", ly.panel));
  if (ly.titleLines.length) {
    parts.push(D.textBlock("offer-panel-title", "Offer panel title", ly.railMid, ly.titleTop, ly.titleLines, TYPE.lead, INK.primary, { anchor: "middle" }));
  }
  if (ly.valuePill) {
    /* Re-emitted at its measured position: pill() sizes itself to its label, so the
       width is only known after the first call. */
    parts.push(D.pill("offer-value", "Offer value", ly.railMid - ly.valuePill.w / 2, ly.valueY, slide.value).svg);
  }
  /* No caption argument — the CTA is laid out below, balanced across two lines. */
  parts.push(D.qrPlate("offer-qr", "Offer QR", ly.qrX, ly.qrY, L.qr, slide.qr, ""));
  if (ly.ctaLines.length) {
    parts.push(D.textBlock("offer-cta", "Offer caption", ly.railMid, ly.ctaTop, ly.ctaLines, TYPE.monoLabel, INK.muted, { anchor: "middle" }));
  }
  if (slide.url) {
    parts.push(D.text("offer-url", "Offer URL", ly.railMid, ly.urlTop, slide.url, TYPE.monoLabel, INK.lead, { anchor: "middle" }));
  }
  return parts.join("\n");
}

function layoutOfferSecondary(slide) {
  const L = SLIDE_LAYOUTS.offer_secondary;
  const overflow = [];
  const head = fitDown(slide.headline, L.headingMaxW, [TYPE.h1, TYPE.h1Tight], { maxLines: 2, balanced: true });
  if (head.overflow) overflow.push("secondary headline wraps past two lines");
  const supTop = L.headingTop + blockHeight(head.lines.length, lh(head.spec)) + 20;
  const supLines = wrap(slide.support, L.supportMaxW, TYPE.lead);

  const items = slide.items.map((label, i) => {
    const lines = wrap(label, L.listMaxW, TYPE.body);
    if (lines.length > 1) overflow.push(`"what you get" item ${i + 1} wraps — shorten it`);
    return { label, lines, y: L.listTop + i * L.listRowH };
  });
  const listBottom = L.listTop + items.length * L.listRowH;
  if (listBottom > bodyBottom) overflow.push(`"what you get" list ends at ${listBottom}px, past the band`);

  return { overflow, head, supTop, supLines, items, L };
}

function drawOfferSecondary(cfg, slide, ly) {
  const L = ly.L;
  const parts = [
    D.textBlock("headline", "Headline", GRID.x0, L.headingTop, ly.head.lines, ly.head.spec),
    D.textBlock("support", "Support", GRID.x0, ly.supTop, ly.supLines, TYPE.lead, INK.lead),
  ];
  ly.items.forEach((it, i) => {
    const idx = String(i + 1).padStart(2, "0");
    const cy = it.y + lh(TYPE.body) / 2;
    parts.push(D.hairline(`item-rule-${idx}`, `Item rule ${idx}`, GRID.x0, it.y - 14, L.listMaxW + 60));
    parts.push(`  <circle id="item-check-${idx}" data-name="Item check ${idx}" cx="${GRID.x0 + L.checkR}" cy="${cy}"
    r="${L.checkR}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`);
    parts.push(D.textBlock(`item-text-${idx}`, `Item ${idx}`, GRID.x0 + L.checkR * 2 + 20, it.y, it.lines, TYPE.body, INK.primary));
  });

  const visual = { x: L.rail.x, y: L.visual.y, w: L.rail.w, h: L.visual.h };
  const uri = D.imageDataUri(slide.visual);
  if (uri) {
    parts.push(`  <clipPath id="visual-clip"><rect x="${visual.x}" y="${visual.y}" width="${visual.w}" height="${visual.h}" rx="${SURFACE.radius.card}"/></clipPath>`);
    parts.push(`  <image id="visual" data-name="Visual" href="${uri}" x="${visual.x}" y="${visual.y}"
    width="${visual.w}" height="${visual.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#visual-clip)"/>`);
  } else {
    parts.push(D.glassCard("visual-placeholder", "Visual placeholder", visual));
    parts.push(D.text("visual-caption", "Visual caption", visual.x + visual.w / 2, visual.y + visual.h / 2 - 10,
      "Inside the cohort", TYPE.monoLabel, INK.muted, { anchor: "middle", upper: true }));
  }
  parts.push(D.qrPlate("secondary-qr", "Secondary QR", L.rail.x, L.qrY, L.qr, slide.qr, "Scan to join"));
  if (slide.url) {
    parts.push(D.text("secondary-url", "Secondary URL", L.rail.x + L.qr + 32, L.qrY + L.qr / 2 - 12,
      slide.url, TYPE.monoLabel, INK.lead, { upper: true }));
  }
  return parts.join("\n");
}

/* -------------------------------------------------------------------- Q&A --------- */

function layoutQa(slide) {
  const L = SLIDE_LAYOUTS.qa;
  const overflow = [];
  const heading = wrap(slide.heading, span(8), TYPE.display);

  /* The rail is a full-height card when the deck has something to put in it. It used to
     start at the cards' y, leaving the slide's top-right quadrant empty. */
  const hasRail = Boolean(slide.reminder || slide.qrRequested);
  const areaRight = hasRail ? L.rail.x - L.railGap : GRID.x1;

  const underlineY = L.headingTop + blockHeight(heading.length, lh(TYPE.display)) + L.underline.gap;
  const supportLines = slide.support ? balance(slide.support, areaRight - GRID.x0, TYPE.lead, { maxLines: 2 }) : [];
  const supportTop = underlineY + L.supportGap;

  /* --- row 1: the two prompts, side by side, each with an icon on its left --- */
  const cardW = (areaRight - GRID.x0 - L.cardGap) / 2;
  const textW = cardW - L.cardPad.x * 2 - L.promptIcon.size - L.promptIcon.gap;
  const cards = slide.prompts.filter((p) => p.text).map((p) => {
    const lines = wrap(p.text, textW, TYPE.lead);
    if (lines.length > L.cardMaxLines) overflow.push(`prompt "${p.label}" wraps to ${lines.length} lines, max ${L.cardMaxLines}`);
    return { ...p, lines, bodyH: lh(TYPE.monoLabel) + L.cardLabelGap + blockHeight(lines.length, lh(TYPE.lead)) };
  });
  /* Both cards take the height of the taller, so the pair reads as one row. */
  const cardH = Math.max(0, ...cards.map((c) => L.cardPad.y * 2 + Math.max(c.bodyH, L.promptIcon.size)));

  /* --- row 2: recap chips, content-sized, flowing left to right and wrapping --- */
  /* Sized from geometry, not the token table directly — see recapFs. Inter, not
     IBM Plex Mono: this pill holds a whole phrase, and mono in this deck is reserved
     for short chrome labels (tags, the sponsor pill, the footer). */
  const recapSpec = { ...TYPE.lead, fs: L.recapFs };
  const recapChips = slide.recap.map((label) => {
    // Sentence case, as authored — this is content, not a shouted mono chip.
    const lines = balance(label, L.recapMaxW, recapSpec, { maxLines: L.recapMaxLines });
    if (lines.length > L.recapMaxLines) overflow.push(`recap topic "${label}" wraps to ${lines.length} lines, max ${L.recapMaxLines}`);
    const w = Math.round(Math.max(...lines.map((l) => measure(l, recapSpec))) + L.recapPad.x * 2);
    if (w > areaRight - GRID.x0) overflow.push(`recap topic "${label}" is wider than the row`);
    return { label, lines, w };
  });
  /* Every chip gets the SAME height so a row reads as a set, and a shorter one is
     centred in it by its own padding rather than sitting at the top of a too-tall box. */
  const chipLines = Math.max(1, ...recapChips.map((c) => c.lines.length));
  const chipH = L.recapPad.y * 2 + chipLines * lh(recapSpec) + (chipLines - 1) * 2;

  let fx = GRID.x0;
  let fy = 0;
  const placed = recapChips.map((c) => {
    if (fx > GRID.x0 && fx + c.w > areaRight) { fx = GRID.x0; fy += chipH + L.recapRowGap; }
    const at = { ...c, chipH, spec: recapSpec, dx: fx, dy: fy,
      padY: (chipH - (c.lines.length * lh(recapSpec) + (c.lines.length - 1) * 2)) / 2 };
    fx += c.w + L.recapColGap;
    return at;
  });
  const recapH = placed.length ? lh(TYPE.monoLabel) + L.recapLabelGap + fy + chipH : 0;

  /* The card row anchors a fixed gap below wherever the support line (or, lacking one,
     the heading underline) actually ends — not centred in a fixed worst-case band, which
     left real (short) content floating in slack. See cardTopGap's comment in geometry.mjs. */
  const textBottom = supportLines.length
    ? supportTop + blockHeight(supportLines.length, lh(TYPE.lead))
    : underlineY;
  const top = textBottom + L.cardTopGap;
  const blockH = cardH + (recapH ? L.rowsGap + recapH : 0);
  if (top + blockH > bodyBottom) {
    overflow.push(`Q&A content needs ${Math.round(blockH)}px below y=${Math.round(top)}, band ends at ${bodyBottom}`);
  }

  cards.forEach((c, i) => {
    c.x = GRID.x0 + i * (cardW + L.cardGap);
    c.y = top; c.w = cardW; c.h = cardH;
    /* Icon and the label+text block are each centred on the card's content box, so a
       one-line and a two-line prompt both sit level with their icon. */
    c.iconX = c.x + L.cardPad.x;
    c.iconTop = top + (cardH - L.promptIcon.size) / 2;
    c.bodyX = c.iconX + L.promptIcon.size + L.promptIcon.gap;
    c.labelTop = top + (cardH - c.bodyH) / 2;
    c.textTop = c.labelTop + lh(TYPE.monoLabel) + L.cardLabelGap;
  });

  const recapLabelTop = top + cardH + L.rowsGap;
  const recapY = recapLabelTop + lh(TYPE.monoLabel) + L.recapLabelGap;
  const recap = placed.map((c) => ({ ...c, x: c.dx, y: recapY + c.dy }));

  /* --- rail: one centred stack inside a full-height card --- */
  const railInnerW = L.rail.w - SURFACE.cardPad.x * 2;
  const railMid = L.rail.x + L.rail.w / 2;
  const reminderLines = hasRail && slide.reminder ? wrap(slide.reminder, railInnerW, TYPE.body) : [];
  if (reminderLines.length > L.reminderMaxLines) overflow.push(`reminder wraps to ${reminderLines.length} lines, max ${L.reminderMaxLines}`);
  const captionLines = hasRail && slide.qrRequested && slide.cta
    ? balance(slide.cta.toUpperCase(), railInnerW, TYPE.monoLabel, { maxLines: 2 }) : [];

  const railStackH = lh(TYPE.monoLabel) +
    (reminderLines.length ? L.railLabelGap + blockHeight(reminderLines.length, lh(TYPE.body)) : 0) +
    (slide.qrRequested ? L.reminderQrGap + L.qr : 0) +
    (captionLines.length ? L.qrCaptionGap + blockHeight(captionLines.length, lh(TYPE.monoLabel)) : 0);
  const railTop = L.rail.y + SURFACE.cardPad.y +
    Math.max(0, (L.rail.h - SURFACE.cardPad.y * 2 - railStackH) / 2);
  if (railStackH > L.rail.h - SURFACE.cardPad.y * 2) overflow.push("Q&A rail stack overruns its card");
  if (slide.qrRequested && L.qr > railInnerW) overflow.push(`Q&A QR (${L.qr}) is wider than its rail (${railInnerW})`);

  let ry = railTop + lh(TYPE.monoLabel);
  const reminderTop = ry + L.railLabelGap;
  if (reminderLines.length) ry = reminderTop + blockHeight(reminderLines.length, lh(TYPE.body));
  const qrY = ry + L.reminderQrGap;
  const captionTop = qrY + L.qr + L.qrCaptionGap;

  return { overflow, heading, underlineY, supportLines, supportTop, cards, recap, recapLabelTop,
    hasRail, railTop, railMid, reminderTop, reminderLines, qrY, captionLines, captionTop, L };
}

function drawQa(cfg, slide, ly) {
  const L = ly.L;
  const parts = [
    D.textBlock("heading", "Heading", GRID.x0, L.headingTop, ly.heading, TYPE.display),
    D.hairline("heading-underline", "Heading underline", GRID.x0, ly.underlineY, L.underline.w, "rgba(255,255,255,0.5)"),
  ];
  if (ly.supportLines.length) {
    parts.push(D.textBlock("support", "Support", GRID.x0, ly.supportTop, ly.supportLines, TYPE.lead, INK.lead));
  }
  ly.cards.forEach((c, i) => {
    const idx = String(i + 1).padStart(2, "0");
    parts.push(D.glassCard(`qa-card-${idx}`, `Q&A card ${idx}`, c));
    if (c.icon) parts.push(D.icon(`qa-icon-${idx}`, `Q&A icon ${idx}`, c.iconX, c.iconTop, L.promptIcon.size, c.icon));
    parts.push(D.text(`qa-label-${idx}`, `Q&A label ${idx}`, c.bodyX, c.labelTop, c.label, TYPE.monoLabel, INK.muted, { upper: true }));
    parts.push(D.textBlock(`qa-text-${idx}`, `Q&A text ${idx}`, c.bodyX, c.textTop, c.lines, TYPE.lead));
  });
  if (ly.recap.length) {
    parts.push(D.text("recap-label", "Recap label", GRID.x0, ly.recapLabelTop, slide.recapLabel, TYPE.monoLabel, INK.muted, { upper: true }));
    ly.recap.forEach((r, i) => {
      parts.push(D.pillBlock(`recap-${i + 1}`, `Recap pill ${i + 1}`, r.x, r.y,
        [{ text: r.lines, spec: r.spec }],
        { w: r.w, padX: L.recapPad.x, padY: r.padY, h: r.chipH, radius: L.recapRadius }).svg);
    });
  }
  if (ly.hasRail) {
    parts.push(D.glassCard("qa-rail", "Q&A rail", L.rail));
    parts.push(D.text("rail-label", "Rail label", L.rail.x + SURFACE.cardPad.x, ly.railTop, slide.railLabel, TYPE.monoLabel, INK.muted, { upper: true }));
    if (ly.reminderLines.length) {
      parts.push(D.textBlock("reminder", "Reminder", L.rail.x + SURFACE.cardPad.x, ly.reminderTop, ly.reminderLines, TYPE.body, INK.body));
    }
    if (slide.qrRequested) {
      parts.push(D.qrPlate("qa-qr", "Q&A QR", ly.railMid - L.qr / 2, ly.qrY, L.qr, slide.qr, ""));
      if (ly.captionLines.length) {
        parts.push(D.textBlock("qa-caption", "Q&A QR caption", ly.railMid, ly.captionTop, ly.captionLines, TYPE.monoLabel, INK.muted, { anchor: "middle" }));
      }
    }
  }
  return parts.join("\n");
}

/* --------------------------------------------------------------- closing ---------- */

function layoutClosing(slide) {
  const L = SLIDE_LAYOUTS.closing;
  const overflow = [];
  const message = balance(slide.message, L.messageMaxW, TYPE.display);
  if (message.length > 2) overflow.push("closing message is longer than two lines");
  const nextTop = L.messageY + blockHeight(message.length, lh(TYPE.display)) + L.nextGap;
  const nextLines = slide.next ? wrap(slide.next, L.messageMaxW, TYPE.lead) : [];
  const siteTop = nextTop + blockHeight(nextLines.length, lh(TYPE.lead)) + L.websiteGap;
  if (siteTop + lh(TYPE.monoLead) > L.avatarY - L.copyRowGap) overflow.push("closing copy runs into the speaker row");

  const count = slide.speakers.length;
  const pitch = L.avatar + L.avatarGap;
  const totalW = count * L.avatar + (count - 1) * L.avatarGap;
  const x0 = (CANVAS.w - totalW) / 2;

  /* Full names under the avatars; a pair of neighbours that would collide falls back to
     the short form for that pair, and only a collision that survives that is an error. */
  const nameW = (s) => measure(s, TYPE.role);
  const collide = (a, b) => (nameW(a) + nameW(b)) / 2 + L.nameMinGap > pitch;
  const labels = slide.speakers.map((sp) => sp.name);
  for (let i = 1; i < count; i++) {
    if (!collide(labels[i - 1], labels[i])) continue;
    labels[i - 1] = slide.speakers[i - 1].short || labels[i - 1];
    labels[i] = slide.speakers[i].short || labels[i];
    if (collide(labels[i - 1], labels[i])) overflow.push(`closing names "${labels[i - 1]}" and "${labels[i]}" collide`);
  }
  /* Websites under the names, same collision rule; a site that would collide is dropped
     for that pair rather than failing the deck — it is secondary to the name. */
  const siteW = (s) => measure(String(s || "").toUpperCase(), TYPE.monoLabel);
  const sites = slide.speakers.map((sp) => sp.website);
  for (let i = 1; i < count; i++) {
    if (sites[i - 1] && sites[i] && (siteW(sites[i - 1]) + siteW(sites[i])) / 2 + L.nameMinGap > pitch) {
      overflow.push(`closing websites "${sites[i - 1]}" and "${sites[i]}" collide — shorten one`);
    }
  }
  const avatars = slide.speakers.map((sp, i) => ({
    sp, label: labels[i], site: sites[i],
    x: x0 + i * pitch, y: L.avatarY, w: L.avatar, h: L.avatar, cx: x0 + i * pitch + L.avatar / 2,
  }));
  const nameTop = L.avatarY + L.avatar + L.nameGap;
  const avatarSiteTop = nameTop + lh(TYPE.role) + L.siteGap;
  if (slide.qrRequested && x0 + totalW > L.qrX - L.qrGap) overflow.push("closing speaker row runs into the QR plate");

  return { overflow, message, nextTop, nextLines, siteTop, avatars, nameTop, avatarSiteTop, L };
}

function drawClosing(cfg, slide, ly) {
  const L = ly.L;
  const parts = [
    D.textBlock("message", "Closing message", CANVAS.w / 2, L.messageY, ly.message, TYPE.display, INK.primary, { anchor: "middle" }),
  ];
  if (ly.nextLines.length) {
    parts.push(D.textBlock("next-step", "Next step", CANVAS.w / 2, ly.nextTop, ly.nextLines, TYPE.lead, INK.lead, { anchor: "middle" }));
  }
  if (slide.website) {
    parts.push(D.text("closing-site", "Closing website", CANVAS.w / 2, ly.siteTop, slide.website, TYPE.monoLead, INK.muted, { anchor: "middle", upper: true }));
  }
  ly.avatars.forEach((a, i) => {
    const idx = String(i + 1).padStart(2, "0");
    parts.push(D.headshotTile(`avatar-${idx}`, `Closing avatar ${idx}`, a, a.sp,
      { radius: a.w / 2, monogramSize: monogramSize(a.w) }));
    parts.push(D.text(`avatar-name-${idx}`, `Closing name ${idx}`, a.cx, ly.nameTop,
      a.label, TYPE.role, INK.body, { anchor: "middle" }));
    if (a.site) {
      parts.push(D.text(`avatar-site-${idx}`, `Closing website ${idx}`, a.cx, ly.avatarSiteTop,
        a.site, TYPE.monoLabel, INK.faint, { anchor: "middle", upper: true }));
    }
  });
  if (slide.qrRequested) {
    parts.push(D.qrPlate("closing-qr", "Closing QR", L.qrX, L.qrY, L.qr, slide.qr, "Scan before you go"));
  } else {
    /* The waveform and the QR caption occupy the same corner; the QR is information and
       the equalizer is ornament, so the ornament yields. */
    parts.push(D.waveform("waveform", "Waveform", GRID.x1 - D.waveformWidth, CANVAS.h - 64));
  }
  return parts.join("\n");
}

/* ---------------------------------------------------------------- registry -------- */

const RENDERERS = {
  cover: { layout: layoutCover, draw: drawCover, eyebrow: (s) => s.eyebrow },
  divider: { layout: layoutDivider, draw: drawDivider, eyebrow: () => "" },
  stat: { layout: layoutStat, draw: drawStat, eyebrow: () => "" },
  agenda: { layout: layoutAgenda, draw: drawAgenda, eyebrow: (s) => s.eyebrow },
  spotlight: { layout: layoutSpotlight, draw: drawSpotlight, eyebrow: (s) => s.eyebrow },
  /* The header eyebrow carries the tier, which is why the card no longer needs a pill
     repeating it 180px below. */
  sponsor: { layout: layoutSponsor, draw: drawSponsor, eyebrow: (s) => s.level || "Sponsor" },
  offer_primary: { layout: layoutOfferPrimary, draw: drawOfferPrimary, eyebrow: (s) => s.eyebrow },
  offer_secondary: { layout: layoutOfferSecondary, draw: drawOfferSecondary, eyebrow: (s) => s.eyebrow },
  qa: { layout: layoutQa, draw: drawQa, eyebrow: () => "Questions" },
  closing: { layout: layoutClosing, draw: drawClosing, eyebrow: () => "" },
};

/**
 * `withFonts: false` omits the @font-face block.
 *
 * A standalone SVG must carry its own fonts. But the PDF path stacks all twelve into
 * ONE document, where twelve identical @font-face declarations make Chrome treat them
 * as twelve distinct typefaces — it then re-subsets Inter per page and downgrades it to
 * Type 3, which took the deck PDF to 27.8 MB. Declaring the faces once fixes both.
 */
export function buildSlideSvg(cfg, slide, { withFonts = true } = {}) {
  const r = RENDERERS[slide.type];
  if (!r) throw new Error(`no renderer for slide type "${slide.type}"`);
  const ly = r.layout(slide, cfg);
  const body = [
    D.defs(cfg.brand),
    withFonts ? D.fontFaceCss() : "",
    D.background(cfg.brand),
    slideChrome(cfg, slide, r.eyebrow(slide)),
    `  <g id="content" data-name="Content">`,
    r.draw(cfg, slide, ly),
    `  </g>`,
    D.vignette(),
  ].filter(Boolean).join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${CANVAS.w}" height="${CANVAS.h}" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}">
  <title>${escXml(cfg.deck)} — slide ${slide.number} (${slide.type})</title>
${body}
</svg>`;
  return { svg, overflow: ly.overflow || [], notes: ly.notes || [] };
}

export const slideFileName = (slide) => `${String(slide.number).padStart(2, "0")}-${slide.type}.svg`;

/** Remove generated files in `dir` that are not in `keep`. Only ever touches output. */
export function pruneStale(dir, keep, transform = (f) => f) {
  if (!fs.existsSync(dir)) return [];
  const wanted = new Set(keep.map(transform));
  const removed = [];
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(".")) continue;
    if (!wanted.has(f)) { fs.unlinkSync(path.join(dir, f)); removed.push(f); }
  }
  return removed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.config) {
    console.error("usage: node render-svg.mjs -c .gen/<deck>.json [--slides 1,4-6]");
    process.exit(2);
  }
  const cfg = JSON.parse(fs.readFileSync(args.config, "utf8"));
  const { BRANDS } = await import(BRANDS_MODULE);
  cfg.brand = BRANDS[cfg.brandId] || BRANDS.OBA;

  const dir = path.join(CANVA, cfg.deck);
  fs.mkdirSync(dir, { recursive: true });
  /* Drop slides that are no longer in the deck. Without this, deleting a section leaves
     its rendered slide behind and the next Canva import picks up a slide the deck no
     longer contains — silently, because the file looks as fresh as the rest. */
  if (!args.slides) pruneStale(dir, cfg.slides.map(slideFileName));

  const problems = [];
  let written = 0;
  for (const slide of cfg.slides) {
    if (args.slides && !args.slides.has(slide.number)) continue;
    const { svg, overflow, notes } = buildSlideSvg(cfg, slide);
    for (const o of overflow) problems.push(`slide ${slide.number} (${slide.type}): ${o}`);
    for (const nMsg of notes) console.warn(`  ! slide ${slide.number}: ${nMsg}`);
    fs.writeFileSync(path.join(dir, slideFileName(slide)), svg);
    written++;
  }

  console.log(`  svg: ${written} slide${written === 1 ? "" : "s"} -> canva/${cfg.deck}/`);

  /* Overflow is a build failure, not a warning. Measurement is exact, so a block that
     does not fit really does not fit — and a collision is invisible to every other
     automated check in this tool. */
  if (problems.length) {
    console.error(`\n  ${problems.length} layout overflow${problems.length > 1 ? "s" : ""}:\n`);
    for (const p of problems) console.error(`    • ${p}`);
    console.error("");
    /* Exit 3, not 1: an overflow is a CONTENT problem the author can fix, and gen.mjs
       reports it differently from a genuine renderer crash. */
    process.exit(3);
  }
}

/* pathToFileURL, not string concatenation: this repo lives under a path with spaces,
   and import.meta.url percent-encodes them. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
