/**
 * Every number in the deck.
 *
 * If a magic constant shows up in render-svg.mjs or lib/draw.mjs, it belongs here
 * instead — that is the rule that keeps nine slide types from drifting apart.
 *
 * Colours are NOT here. They come from ../panel-social-posts/brands.mjs, which is the
 * single source of palette truth across every OBA tool. The only colour-ish values in
 * this file are structural alphas (hairlines, glass, vignette) that describe surface
 * treatment rather than brand hue.
 */

import { SANS, MONO } from "./text.mjs";

export { SANS, MONO };

/* 16:9 at 1:1. A px here is a px on the projector, which is what MIN_TYPE is about. */
export const CANVAS = {
  w: 1920,
  h: 1080,
  scale: 2,
  padX: 120,
  padTop: 84,
  padBottom: 76,
  name: "Slide 1920x1080 (16:9)",
};

/* 12 columns chosen so every span lands on an integer — no rounding drift anywhere. */
export const GRID = { cols: 12, gutter: 24, colW: 118, contentW: 1680, x0: 120, x1: 1800 };

export const span = (n) => n * GRID.colW + (n - 1) * GRID.gutter;
export const colX = (i) => GRID.x0 + i * (GRID.colW + GRID.gutter);

/**
 * Nothing below 16px carries information.
 *
 * zoom-banner has the same rule at 11px for a 640×200 strip; this is the slide-scale
 * equivalent. A deck is not only projected, it is thumbnailed inside a Zoom tile, and
 * 16px at 1920 is where a mono footer label survives that downscale. If something will
 * not fit at 16px, cut it — do not shrink it.
 */
export const MIN_TYPE = 16;

/* Horizontal bands every slide shares, so the deck reads as one object. */
export const BANDS = {
  headerTop: 84,
  headerH: 68,
  bodyTop: 232,
  bodyBottom: 920,
  footerRuleY: 956,
  footerBaseY: 990,
};
export const bodyHeight = BANDS.bodyBottom - BANDS.bodyTop;

/**
 * Type scale. One canvas size, so one scale — the per-format tables the siblings carry
 * are complexity this tool does not need.
 *
 * Each token is a complete spec for lib/text.mjs: font, size, line-height, weight and
 * tracking in em. Passing tokens straight to measure() is what keeps wrapping honest.
 */
export const TYPE = {
  display:   { font: SANS, fs: 92, lh: 1.06, weight: 300, track: -0.02 },
  // The cover carries a headline AND a speaker rail, so its title runs smaller than the
  // display token — the rail needs the height more than the headline does. 64, not 80:
  // the rail is bottom-anchored and takes whatever the title stack leaves over, so this
  // token is the tile-size dial. Every 1px here costs the tiles ~1.06px of height per
  // headline line, and at 80 a three-line cover left them at 62% of their ladder size.
  // It floors at h1: a cover headline smaller than a section heading reads as a mistake.
  coverTitle:{ font: SANS, fs: 64, lh: 1.06, weight: 300, track: -0.02 },
  h1:        { font: SANS, fs: 64, lh: 1.08, weight: 300, track: -0.02 },
  h1Tight:   { font: SANS, fs: 56, lh: 1.08, weight: 300, track: -0.02 },
  h2:        { font: SANS, fs: 34, lh: 1.20, weight: 500, track: 0 },
  lead:      { font: SANS, fs: 28, lh: 1.45, weight: 400, track: 0 },
  // 26, not 22: MIN_TYPE is the floor for a mono footer label, not a body size. Bio
  // points, agenda notes and offer notes are read from a Zoom tile as often as from a
  // projector, and 22 turned into texture there. Copy that no longer fits gets cut.
  body:      { font: SANS, fs: 26, lh: 1.45, weight: 400, track: 0 },
  // The divider title: between display and h1, and its own token so the wrap measure
  // and the rendered size are the same number (they used to be 92 and 72).
  dividerTitle: { font: SANS, fs: 72, lh: 1.06, weight: 300, track: -0.02 },
  // Spotlight hero stat: h1's metrics (so it shares the name's baseline) at a heavier
  // weight, so the one number on the slide is the thing the eye lands on.
  stat:      { font: SANS, fs: 64, lh: 1.08, weight: 500, track: -0.02 },
  // The stat slide's numeral — the largest type in the deck, on purpose: one number,
  // nothing else competing with it.
  statHero:  { font: SANS, fs: 160, lh: 1.00, weight: 300, track: -0.03 },
  name:      { font: SANS, fs: 30, lh: 1.25, weight: 500, track: 0 },
  role:      { font: SANS, fs: 20, lh: 1.40, weight: 400, track: 0 },
  numeral:   { font: SANS, fs: 84, lh: 1.00, weight: 300, track: -0.03 },
  // The header eyebrow — kept as its own token, 30% over monoLead, rather than resizing
  // monoLead itself: that token is shared with the cover meta line and closing website
  // line, which are not part of this "header" ask.
  eyebrow:   { font: MONO, fs: 26, lh: 1.30, weight: 500, track: 0.14 },
  monoLead:  { font: MONO, fs: 20, lh: 1.30, weight: 500, track: 0.14 },
  monoLabel: { font: MONO, fs: 16, lh: 1.30, weight: 500, track: 0.14 },
  monoChip:  { font: MONO, fs: 16, lh: 1.00, weight: 500, track: 0.10 },
  // Cover speaker captions live inside the headshot as pills, and lean on the mono face
  // to read as a distinct badge layer rather than a continuation of the SANS headline
  // and subtitle stack above them.
  coverName: { font: MONO, fs: 20, lh: 1.20, weight: 600, track: 0.01 },
  // The role/company under the name is Inter in sentence case, not mono caps: a long
  // job title in tracked capitals is the hardest thing on the slide to read, and the
  // mono name above it already does the "badge" job.
  coverRole: { font: SANS, fs: 18, lh: 1.30, weight: 400, track: 0 },
};

/** Convenience: line-height in px for a token. */
export const lh = (t) => Math.round(t.fs * t.lh);

/**
 * Dots texture — a DECK-SCOPED override, deliberately louder than the shared value.
 *
 * OBA BRAND.md §5.1 specifies 9% white at 0.55 layer opacity on an 18px grid, and calls
 * it "nearly invisible by intent". That is right for a 1080 square competing in a feed.
 * It is wrong here: at slide dwell-time the backdrop reads as empty, and the dots are
 * the cheapest way to give it substance. panel-social-posts' own history agrees — its
 * recent commits move this value up and down repeatedly, most recently to 0.75 opacity.
 *
 * So the deck raises it, as a surface-specific token. This value must never be written
 * back into the shared social-post settings.
 *
 * Spacing scales with the canvas: 18px on 1080 is ~60 dots across. Holding 18px at 1920
 * would give 106 and read as noise; 28 keeps the perceived density close to the original
 * while staying tighter than a strict 1.78x scale, which looked sparse.
 */
export const DOTS = {
  spacing: 28,
  radius: 1.6,
  alpha: 0.12,
  layerOpacity: 0.75,
  maskFrom: 0.18,
  maskTo: 0.62,
  brandReference: { spacing: 18, alpha: 0.09, layerOpacity: 0.55 },
};

/* Surface treatment. Structural alphas only — no brand hue lives here. */
export const SURFACE = {
  // cardSmall is the inner-card radius (bio points, benefit cards, sponsor CTA) — one
  // step tighter than the outer card so nested rounded corners read as nested.
  radius: { card: 24, cardSmall: 20, tile: 24, plate: 20, chip: 22, pill: 999 },
  hairline: { w: 1, fill: "rgba(255,255,255,0.14)" },
  cardStroke: { w: 1.5, fill: "rgba(255,255,255,0.16)" },
  cardInset: "rgba(255,255,255,0.04)",
  cardPad: { x: 40, y: 36 },
  shadow: { dy: 24, blur: 28, color: "#0b1220", opacity: 0.55 },
  // Headshot tiles get a tighter shadow than cards: the card shadow's 24px drop and
  // 14px blur smeared 60px of dark below a portrait and haloed the closing avatars.
  tileShadow: { dy: 6, blur: 10, color: "#0b1220", opacity: 0.35 },
  glass: [
    ["rgba(255,255,255,0.16)", 0],
    ["rgba(255,255,255,0.05)", 0.42],
    ["rgba(11,18,32,0.35)", 1],
  ],
  glassAngle: 165,
  // The deck's one "readable over anything" fill: pill()/pillBlock()'s default. Bio
  // cards briefly borrowed it too, but a flat slab next to the glass benefit/Q&A cards
  // read as a second card system; they are back on the glass gradient.
  pillFill: "rgba(11,18,32,0.42)",
  // The cover caption plate sits on a photo, so it runs darker than pillFill.
  plateFill: "rgba(11,18,32,0.55)",
  // List bullet: the dot, its gap to the text, and its ink.
  listDot: { r: 5, gap: 20, fill: "rgba(255,255,255,0.7)" },
  // Mono capsule (tags, recap chips): height and side padding around the measured label.
  pill: { h: 44, padX: 18 },
  // QR plate: caption offset below the plate and the ink of the "scan here" placeholder.
  qr: { captionGap: 24, placeholderFill: "rgba(11,18,32,0.45)" },
  // The white surface a sponsor mark sits on. Sponsor logos are rarely white-safe, so
  // the mark gets a plate rather than being dropped onto slate and disappearing.
  logoPlate: { fill: "rgba(255,255,255,0.94)", placeholderFill: "rgba(11,18,32,0.35)" },
  /* Rating star: geometry only, no hue. A gold star would read as a rating fastest,
     but gold is not in the OBA palette and inventing one here is exactly the leak the
     "no brand hue in SURFACE" test exists to catch. The star takes brand.accentText
     instead — the brand's own highlight ink over the dark ground — and the five-point
     SHAPE does the "this is a rating" work that the colour would otherwise do. */
  star: { size: 24, gap: 8, innerRatio: 0.42 },
  bracket: { inset: 48, arm: 64, w: 2, fill: "rgba(255,255,255,0.28)" },
  vignette: { cx: 0.5, cy: 0.46, r: 0.78, color: "#0b1220", maxAlpha: 0.42 },
  tileRing: { w: 1.5, fill: "rgba(255,255,255,0.18)" },
  ghostNumeral: "rgba(255,255,255,0.20)",
  // +30% over the previous 42, alongside TYPE.eyebrow, so the header row scales as one.
  logoH: 55,
  // Header eyebrow's dot marker: radius and its inset from GRID.x0 stay equal, so the
  // dot's left edge sits flush on the margin. Also +30% over the old 5.
  eyebrowDotR: 7,
  // Gap between the dot's right edge and the eyebrow text; unchanged from the old design.
  eyebrowGap: 12,
};

/* Text fills, as alphas over the slate backdrop. Kept beside the type scale because
   contrast and size trade off against each other.

   body/muted were raised from .62/.55: the backdrop's glow lobe is centred at
   (0.72w, 0.42h), which is exactly where the spotlight rail's bio text sits, and
   mid-grey over a lighter slate is the first thing Zoom's compression flattens. Raising
   the ink is local; moving the glow would re-tune every slide's backdrop. */
export const INK = {
  primary: "#ffffff",
  lead: "rgba(255,255,255,0.80)",
  body: "rgba(255,255,255,0.72)",
  muted: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.45)",
};

/**
 * Agenda rail geometry, by item count.
 *
 * Rows are tabled rather than computed so 4 and 5 items both fill the band without a
 * gap at the bottom — the thing that makes a 4-item agenda look unfinished.
 */
export const RAIL = {
  // top + n*rowH + (n-1)*gap lands on BANDS.bodyBottom, so both counts fill the band.
  top: 380,
  4: { rowH: 117, gap: 24, numeral: 84 },
  5: { rowH: 93, gap: 18, numeral: 68 },
  numeralCol: { x: GRID.x0, w: 108 },
  ruleX: 252,
  textX: 288,
  noteGap: 52,
  textMaxW: GRID.x1 - 288,
};

/**
 * Cover speaker rail: tile size by headcount, bottom-anchored.
 *
 * Mirrors the siblings' modular ladder (solo → duo → row → grid), scaled up. Above six
 * the cover stops being a cover; gen.mjs rejects it rather than shrinking further.
 */
const TILE_LADDER = {
  1: { w: 520, h: 666 },
  2: { w: 478, h: 614 },
  3: { w: 426, h: 546 },
  4: { w: 380, h: 486 },
  5: { w: 338, h: 432 },
  // Capped below a straight +30% (which would have been 307x393): at 6-up, that overruns
  // even the full 1920 canvas once centred, let alone the left-aligned content column.
  6: { w: 294, h: 376 },
};
export const TILE_GAP = 28;
export const MAX_COVER_SPEAKERS = 6;

export function tileLayout(count) {
  const n = Math.min(Math.max(count, 1), MAX_COVER_SPEAKERS);
  const t = TILE_LADDER[n];
  const totalW = n * t.w + (n - 1) * TILE_GAP;
  return { ...t, gap: TILE_GAP, totalW, x0: Math.round((CANVAS.w - totalW) / 2) };
}

/** Monogram size for a tile, capped so a solo portrait's initials stay type, not art. */
export const monogramSize = (tileW) => Math.min(Math.round(tileW * 0.26), 96);

/* Which slides wear the full frame (brackets, no footer) versus the content chrome. */
export const HERO_TYPES = new Set(["cover", "divider", "stat", "closing"]);

/**
 * Per-slide-type geometry. Text-dependent maths (wrapping, fit-down, bottom-anchoring)
 * happens in lib/slides.mjs; everything fixed lives here.
 */
export const SLIDE_LAYOUTS = {
  cover: {
    // 160, not 200: at 200 the gap under the eyebrow was larger than the eyebrow's own
    // margin above it, and every pixel of it was coming out of the speaker tiles, which
    // the rail sizes from the leftovers. The title still clears the eyebrow's baseline.
    titleTop: 160, titleMaxW: span(9), titleMaxLines: 3,
    subtitleGap: 32, subtitleMaxW: span(8),
    // Date/time/format as one mono line rather than three pills: the pill row cost 44px
    // of the rail's height and read as chrome on a slide that already has plenty.
    metaGap: 30,
    // The rail is bottom-anchored and its height is what is LEFT over, the way
    // zoom-banner sizes its faces. A three-line headline shrinks the tiles instead of
    // colliding with them; below railMinH it is an overflow error, not a smaller tile.
    // Name and role now live INSIDE the tile as pills over a bottom scrim, rather than
    // as a separate row below it, so the rail no longer needs to stop at the shared
    // BANDS.bodyBottom — that band exists to leave room for the footer row, and the
    // cover has no footer (HERO_TYPES draws corner brackets instead). It runs down to
    // the canvas's own declared bottom margin instead, which is what actually bounds a
    // hero slide's content. (A very wide 5-6up panel can still reach toward the
    // bottom-right waveform decoration — that's the width clamp's job, not this one's.)
    railGap: 40, railBottom: CANVAS.h - CANVAS.padBottom, railMinH: 220,
    tilePad: 20, scrimH: 200,
    // Name and role sit in ONE combined badge (not two stacked pills), so there is a
    // single caption per speaker rather than a name-pill floating over a role-pill.
    captionPadX: 18, captionPadY: 14, captionGap: 6,
    // The role line wraps to up to 2 lines instead of forcing one — IBM Plex Mono runs
    // wide enough that a one-line title ellipsised away most job titles after ~3 words.
    roleMaxLines: 2,
    // Caption lines fit inside this fraction of the plate's inner width. wrap() accepts
    // a line at 100.0% of the measure, and two of four plates on the first real deck
    // landed exactly there — text flush to the padding reads as bursting even when it
    // technically fits. The ladder (role · company → role → company → ellipsis) runs
    // against the slack width, not the raw one.
    roleSlack: 0.94,
  },
  /* Two cards, one shared band. Both open on `y` and close on `colBottom`, so the
     columns read as a pair rather than as a card sitting beside a loose list — the left
     column used to be bounded glass while the right was a bare label over four floating
     cards, which gave the slide three competing top edges in its first 35px.

     880/752 is measured off the rag, not guessed: at the old 960 the description's last
     line filled 58% of its measure and the detail's 60%. At 880 they fill 85% and 76%.
     The right column's trailing space is fine because its quotes are hairline-separated
     ROWS — a short row in a list rags; a short card looks unfinished. */
  sponsor: {
    card: { x: GRID.x0, y: 232, w: 880, h: 634 },   // 120 -> 1000
    rail: { x: 1048, y: 232, w: 752, h: 634 },      // 1048 -> 1800 = GRID.x1
    colBottom: 866,
    // 20px under the cards and 44 above the footer rule. At the old 894 it sat 28/36 —
    // near-equidistant between the content and the deck chrome, so it belonged to
    // neither. Ends on 912, inside BANDS.bodyBottom.
    learnMoreY: 886,
    /* The mark IS the title: the header eyebrow carries the tier and the logo states
       the name, so the card has no pill and no h1 to repeat them. It runs as a masthead
       along the card's inner left margin.

       padX/padY are proportional to the plate rather than one scalar. The plate's aspect
       (760/280 = 2.71) and the trimmed logo's (655/240 = 2.73) are near-identical, so a
       uniform inset always makes HEIGHT bind — the mark ends up vertically cramped
       inside wide side margins. Scaling the insets keeps the optical margin even. */
    mark: { w: 560, h: 205, padX: 54, padY: 20 },
    /* 72, against the 20 that holds the two paragraphs together. The one large gap on
       the card, and what makes "who" and "what they do" read as two groups.

       It is a FIXED gap, not the leftover space. A mark small enough to leave slack
       would otherwise push that slack into this one gap — at 560x205 that would be
       141px, a hole rather than a group separator. layoutSponsor centres the whole
       block in the card instead, so the slack splits evenly above and below it. */
    markCopyGap: 72,
    descDetailGap: 20,
    /* Proof rows inside the rail card, separated by a hairline centred in rowGap — what
       this slide did before it briefly used four stacked cards whose 18px gap equalled
       their own 18px padding, merging them into one striped block.
       4*103 + 3*24 = 484, landing on the card floor. sourceGap 8, not 6: a claim and
       its attribution were the tightest pair on the slide, which is backwards. */
    proof: { labelGap: 32, rowGap: 24, starsGap: 12, sourceGap: 8, maxLines: 2 },
  },
  // A note must fit one line: at body size a second line pushes the 5-row rail past
  // its band, and on a projected agenda a two-line note is a paragraph, not a note.
  agenda: { headingTop: 200, noteMaxLines: 1 },
  // Title block centred on the canvas, a short rule above and below. No numeral: the
  // ghost "03" was the deck slide index, which collided with the agenda's 01–04 topic
  // numbering — an attendee reads a number on a divider as a section, and it wasn't one.
  divider: { centerY: CANVAS.h / 2, maxW: span(10), maxLines: 2, rule: { w: 120, gap: 44 } },
  // Pattern-interrupt slide: numeral, one line, optional source, centred as one block.
  // Nine slides on one backdrop and attention drops around the third spotlight; one
  // number the audience did not expect resets it.
  stat: {
    centerY: CANVAS.h / 2, maxW: span(10), textMaxLines: 2, valueGap: 24,
    // Optional `note` under the claim — the question the panel will answer, say.
    noteGap: 16, noteMaxLines: 2, sourceGap: 28,
  },
  spotlight: {
    portrait: { x: GRID.x0, y: 232, w: 520, h: 680 }, monogram: 132,
    chip: { x: 152, y: 800, w: 456, h: 120 }, chipPad: { x: 32, y: 26 }, chipMaxLines: 3,
    rail: { x: 712, w: GRID.x1 - 712 },
    // The name's cap line sits on the portrait's top edge (nameTop is derived from it via
    // capTop(), not tabled); everything below stacks by these gaps.
    nameRoleGap: 12, roleMaxLines: 2, roleRuleGap: 28, ruleListGap: 32,
    // Bio cards are sized to their text — padY above and below however many lines the
    // point wraps to — rather than a fixed row that left one-liners floating in a slab.
    // Worst case (h1 name, 2-line role, three 2-line points) ends at 832, inside
    // tagsY - listBottomGap = 836; tests/geometry.test.mjs holds that inequality.
    card: { padX: 32, padY: 20, gap: 20, maxLines: 2 },
    tagsY: 868, tagGap: 16, listBottomGap: 32,
    // Hero stat: right-aligned on the name row — the number shares the name's baseline,
    // its label shares the role's. That fills the empty right side of the row without
    // spending any of the vertical budget the bio stack needs. `gap` is the minimum
    // clearance between the name/role and the number/label.
    stat: { gap: 48 },
    // Speaker website, right-aligned on the tag row; siteGap is its clearance from the
    // last tag.
    siteGap: 32,
  },
  offer_primary: {
    headingTop: 184, headingMaxW: span(8), supportMaxW: span(7),
    headSupportGap: 20, supportGridGap: 16,
    // Four benefits form a 2x2 and need two row heights inside the band; three form a
    // single row, so they can be wider AND taller. Sizing both from the 2x2 case made
    // three-up cards too narrow for a two-line title.
    gridArea: { x: GRID.x0, w: 1168 },
    gridTop: 448,          // 4-up: gridTop + 2*h + gap = 920 = BANDS.bodyBottom
    gridTop3: 500,         // 3-up: one row whose top AND bottom edge match the QR plate
    // noteLines is the note's line budget; with the two-line title zone below, the card
    // heights close exactly: 4-up 28+82+8+76+28 = 222, 3-up 28+82+8+114+28 = 260 ≤ 300.
    card4: { w: 542, h: 222, gap: 28, cols: 2, noteLines: 2 },
    card3: { w: 370, h: 300, gap: 29, cols: 3, noteLines: 3 },
    // Every card reserves titleLines of h2 before the note, wrapped or not, so the notes
    // in a row start on the same y — otherwise a 2/2/1-line title row reads ragged.
    cardPad: { x: 32, y: 28 }, titleLines: 2, titleGap: 8,
    // Note text is lighter than the shared TYPE.body weight (400): the title above it is
    // already the bold anchor of the card, and a lighter note reads as secondary without
    // needing a second typeface. Scoped here rather than touching TYPE.body itself, which
    // the sponsor detail copy and the Q&A rail reminder also share.
    noteWeight: 300,
    rail: { x: 1368, w: 432 },
    qr: 300,
    /* The rail is a glass PANEL now, not a bare QR sitting on the backdrop: title, value
       badge, code, caption, url. It is sized to its contents and centred in the body
       band, so it no longer shares edges with the 3-up benefit row — 631px of panel
       cannot align with a 300px grid, and the wrapper is the point of the slide. */
    panel: {
      pad: { x: 32, y: 32 },
      titleValueGap: 20, valueQrGap: 24, qrCtaGap: 24, ctaUrlGap: 10,
      titleMaxLines: 3, ctaMaxLines: 2,
    },
  },
  offer_secondary: {
    headingTop: 200, headingMaxW: span(6), supportMaxW: span(6),
    listTop: 424, listRowH: 96, listMaxW: 760, checkR: 14,
    rail: { x: 1000, w: 800 },
    visual: { y: 232, h: 400 },
    qr: 240, qrY: 664,
  },
  /* Heading block, then two stacked ROWS of content, then a full-height rail card.
     The rail used to begin at the cards' y, which left the slide's top-right quadrant
     empty — 1267x280 of nothing beside a heading only 400px wide. */
  qa: {
    headingTop: 200,
    underline: { w: 120, gap: 28 },
    supportGap: 24,
    /* The card row ANCHORS to wherever the support line (or the underline, if a deck
       omits [qa].support) actually ends, rather than centring inside a fixed worst-case
       band. Centring left real (short) content — a one-line support, one-line prompts —
       floating in a sea of slack, with the empty space split uselessly above the cards
       AND below the recap pills. 48px is "not too close": enough to read as deliberate
       spacing, not a collision. Because it's measured from the ACTUAL support height, a
       future deck with a longer (wrapped) support line still gets correct spacing — it
       just leaves less room below, caught by the overflow check below if it doesn't fit. */
    cardTopGap: 48,
    /* Row 1: the two prompts, side by side. Their width is DERIVED from whatever the
       rail leaves, so the pair always spans the area exactly. padX/icon are sized so
       both prompts still hold one line in half the area: at padX 44 / icon 64 the
       longer one wrapped. */
    cardGap: 28, cardPad: { x: 36, y: 54 }, cardLabelGap: 12, cardMaxLines: 2,
    promptIcon: { size: 56, gap: 24 },
    // Gap between the prompt row and the recap row below it — no longer fighting a tight
    // centred band, so this can be a full, deliberate gap rather than squeezed to 16.
    rowsGap: 24,
    /* Row 2: recap pills, content-sized, flowing left to right and WRAPPING when the
       next one will not fit.

       fs 26 / pad 36x24 / radius 22 — up again from 22 / 28x16 / 20 now that anchoring
       (above) frees real room instead of it sitting empty. recapMaxW went 380 -> 440
       alongside the font bump so real topic text stays on one line at the bigger size.

       Sized for the REALISTIC case — one line per pill — not "every pill needs 2 lines
       across 2 full rows": that compound worst case and a close anchor can't both fit in
       1080px (worked by hand: satisfying both leaves the compound case 35-100px over).
       recapMaxLines: 2 stays as a hard ceiling — an unusually long topic can still wrap
       to 2 lines — but a build where that then overflows the band fails loudly via the
       runtime check below, same as any other "shorten the copy" overflow in this repo.
       The "Q&A rows fit beside the rail" test in tests/geometry.test.mjs holds the actual
       margin for the realistic case, not this comment. */
    /* Inter, not IBM Plex Mono — the other pill: every other pill/tag in the deck
       (sponsor level, expertise tags, the value badge) is a short mono LABEL, but a
       recap topic is a full phrase read the same way the prompt cards' answer text is.
       Sentence case, not upper(): all-caps mono is this deck's "chrome" register, and
       a recap topic is content, not chrome. It also reads a topic like
       "Trust, and the fear of poaching" as a phrase rather than a shouted tag. */
    recapFs: 26, recapMaxW: 440, recapMaxLines: 2,
    recapColGap: 24, recapRowGap: 14, recapLabelGap: 12,
    /* Radius comes up slightly with the pill (20 -> 22): still under radius.card (24),
       above radius.cardSmall (20) — the biggest a chip gets before it reads as a card. */
    recapPad: { x: 36, y: 24 }, recapRadius: 22,
    rail: { x: 1398, y: 232, w: 402, h: 688 },
    railGap: 32, railLabelGap: 20,
    reminderMaxLines: 3, reminderQrGap: 32,
    qr: 280, qrCaptionGap: 24,
  },
  closing: {
    messageY: 330, messageMaxW: 1400, nextGap: 48, websiteGap: 44, copyRowGap: 20,
    // 200px avatars at a 56px gap: the pitch (256) has to hold two half-names in
    // TYPE.role (up to ~170px) or two half-websites in monoLabel (~225px) plus nameMinGap.
    // Under each name, the speaker's website, siteGap below.
    avatar: 200, avatarGap: 56, avatarY: 716, nameGap: 16, nameMinGap: 24, siteGap: 4,
    qr: 240, qrX: 1500, qrY: 700, qrGap: 40,
  },
};

/** Cover caption plate height: fixed for every tile so the four plates line up. */
export const coverCaptionH = () => {
  const c = SLIDE_LAYOUTS.cover;
  return c.captionPadY * 2 + lh(TYPE.coverName) + c.captionGap + c.roleMaxLines * lh(TYPE.coverRole);
};
