/**
 * Normalized post config (.gen/<name>.json) + format → one SVG string.
 *
 * The same string is written to canva/ and rasterised by Chrome into out/, so
 * this is the only place a post's appearance is decided.
 */
import { Scene } from "./scene.mjs";
import { FORMATS, TYPE, themeFor, SUPPORTED_FORMATS } from "./tokens.mjs";
import { preparePhoto } from "./photo.mjs";
import { background } from "./atmosphere.mjs";
import { layoutFor } from "./layouts/index.mjs";
import { prepareQr } from "./qr.mjs";

export { SUPPORTED_FORMATS };

const photoCache = new Map();

async function photosFor(cfg) {
  return Promise.all(
    (cfg.panelists || []).map(async (p) => {
      if (!p.photo) return null;
      const key = `${p.photo}|${cfg.cutout !== false}`;
      if (!photoCache.has(key)) {
        const stem = String(p.name || "photo").toLowerCase().replace(/[^a-z0-9]+/g, "-");
        photoCache.set(key, preparePhoto(p.photo, { stem, cutout: cfg.cutout !== false }).catch((e) => {
          console.warn(`  [${p.name}] photo could not be prepared (${e.message}) — monogram instead`);
          return null;
        }));
      }
      return photoCache.get(key);
    }),
  );
}

export async function buildSvg(cfg, format) {
  const F = FORMATS[format];
  if (!F) throw new Error(`IU layouts support ${SUPPORTED_FORMATS.join(", ")} (got "${format}")`);
  const theme = themeFor(cfg.brand);
  const s = new Scene(F.w, F.h);
  const photos = await photosFor(cfg);
  const qr = await prepareQr(cfg.event?.qr, cfg.name);
  const ctx = {
    s, cfg, format, F, T: TYPE[format], theme, photos, qr,
    panelists: (cfg.panelists || []).map((p, i) => ({ ...p, photo: photos[i] })),
    background: (opts) => background(s, theme, opts),
  };
  await layoutFor(cfg.postType)(ctx);
  /* Accreditation guard: both marks present, and the seal wholly on the sheet.
     This is what makes "every post carries both marks" a fact rather than an
     intention - gen.mjs requires the input, the layouts always draw them, and
     this refuses to hand back an SVG where either one is missing or clipped. */
  const svg = s.toSvg();
  for (const [node, what] of [["PACE plate", "the PACE mark"], ["Stamp seal", "the CE stamp"]]) {
    if (!svg.includes(`data-name="${node}"`))
      throw new Error(`[${cfg.name} ${format}] ${what} is missing — every IU event post carries both`);
  }
  const seal = /<path\b[^>]*data-name="Stamp seal"[^>]*\bd="M([^"]+)"/.exec(svg);
  if (seal) {
    const xs = [], ys = [];
    for (const m of seal[1].matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)) { xs.push(+m[1]); ys.push(+m[2]); }
    const out = Math.min(...xs) < 0 || Math.min(...ys) < 0
             || Math.max(...xs) > F.w || Math.max(...ys) > F.h;
    if (out)
      throw new Error(`[${cfg.name} ${format}] the CE stamp is clipped by the canvas `
        + `(x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}, `
        + `y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)} on ${F.w}x${F.h})`);
  }

  /* Legibility guard: nothing on a post may be set below the caption tier,
     except stamp texture, the QR micro-labels (OBA parity: SCAN TO 15px) and
     the speaker-row role line, which is supporting microcopy under a
     full-size name (like SCAN TO under REGISTER). */
  const small = s.textSizes.filter((t) => t.size < ctx.T.caption - 0.5 && t.name !== "Initials" && t.name !== "Stamp ring glyph" && t.name !== "Scan to" && t.name !== "Stamp label" && t.name !== "Stamp count" && t.name !== "Panelist role");
  for (const t of small) {
    console.warn(`  [${cfg.name} ${format}] small text: ${t.name} "${t.text}" at ${Math.round(t.size)}px (floor ${ctx.T.caption}px)`);
  }
  return svg;
}
