/**
 * zoom-banner — shared geometry.
 *
 * Single source of truth for the canvas box, the typography scale, and the
 * panelist band. Imported by gen.mjs / render.mjs (Node) and mirrored as inline
 * defaults at the top of banner-template.html so the browser preview and the
 * rendered PNG stay in sync.
 *
 * DESIGN RULE: nothing here may drop below MIN_TYPE. The banner renders 1:1 at
 * 640x200, so a px in this file is a px on screen. Everything under ~11px is
 * decoration, not information — it costs pixels and says nothing. That rule is
 * the forcing function behind this layout: it is what removed the subtitle, the
 * painted-on CTA buttons and the LIVE pill, and what bought the room to put
 * panelist roles at a readable size.
 */

/* The Zoom banner box. Exports are supersampled at SCALE and downscaled back
   to exactly w x h by render.mjs. */
export const CANVAS = {
  w: 640,
  h: 200,
  scale: 3, // deviceScaleFactor for the screenshot (1920 x 600)
  padX: 20,
  padTop: 8,
  padBottom: 8,
  name: "Zoom Banner 640x200",
};

/* The legibility floor. Enforced by eye and by the grep in CLAUDE.md. */
export const MIN_TYPE = 11;

/* Three type sizes, and no more. */
export const TYPE = {
  title: 16,
  titleLh: 1.18,
  body: 11, // eyebrow, date chip, panelist name, panelist role
  bodyLh: 1.25,
  logoH: 26,
};

export const MAX_PANELISTS = 4;

/* Roles longer than this stop fitting two lines at TYPE.body in a column of
   COLUMN_W. gen.mjs warns rather than letting them clip silently. */
export const ROLE_MAX_CHARS = 40;

/* Vertical rhythm. The face band is bottom-anchored and absorbs whatever the
   header does not use, so tile size is computed rather than tabled. */
export const BANDS = {
  headerH: 26, // logo + eyebrow + date chip row
  headerGap: 4, // header row -> title
  bandGap: 10, // title -> face band
  nameGap: 6, // tile -> name
  roleGap: 2, // name -> role
  roleLines: 2,
};

/* Column width per count. Wide enough that a ROLE_MAX_CHARS role wraps to two
   lines instead of three, and a nowrap name at TYPE.body fits on one line.
   The 1–2 panelist columns were tightened from the old 240/200 so the face
   band stops reading as a long empty gap between two faces. */
const COLUMN_W = { 1: 200, 2: 160, 3: 150, 4: 142 };
const COLUMN_GAP = { 1: 0, 2: 30, 3: 26, 4: 10 };

/* Tile aspect (tileW / tileH) per count. Faces scale with the room they have:
   a solo panelist gets a near-column tile, four panelists stay tight. This
   replaces the old fixed 0.86 portrait crop that left 175px between two faces. */
const TILE_ASPECT = { 1: 1.4, 2: 1.35, 3: 1.15, 4: 1.0 };

/**
 * Layout for a given panelist count and title height.
 *
 * @param {number} count       1..MAX_PANELISTS
 * @param {number} titleLines  how many lines the title wraps to (1 or 2)
 */
export function tileLayout(count, titleLines = 1) {
  const n = Math.max(1, Math.min(MAX_PANELISTS, Number(count) || 1));
  const lines = Math.max(1, Math.min(2, Number(titleLines) || 1));

  const titleH = Math.round(TYPE.title * TYPE.titleLh * lines);
  const nameH = Math.round(TYPE.body * TYPE.bodyLh);
  const roleH = Math.round(TYPE.body * TYPE.bodyLh * BANDS.roleLines);

  /* Everything above the face band, plus everything below the tile. */
  const consumed =
    CANVAS.padTop +
    BANDS.headerH +
    BANDS.headerGap +
    titleH +
    BANDS.bandGap +
    BANDS.nameGap +
    nameH +
    BANDS.roleGap +
    roleH +
    CANVAS.padBottom;

  const tileH = Math.max(40, CANVAS.h - consumed);
  const tileW = Math.min(
    Math.round(tileH * TILE_ASPECT[n]),
    COLUMN_W[n] - 24, // keep a little air either side of the tile inside the column
  );

  return {
    count: n,
    titleLines: lines,
    tileH,
    tileW,
    columnW: COLUMN_W[n],
    gap: COLUMN_GAP[n],
    bandTop: CANVAS.padTop + BANDS.headerH + BANDS.headerGap + titleH + BANDS.bandGap,
  };
}

export default { CANVAS, MIN_TYPE, TYPE, BANDS, MAX_PANELISTS, ROLE_MAX_CHARS, tileLayout };
